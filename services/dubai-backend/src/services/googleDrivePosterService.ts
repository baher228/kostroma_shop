import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/config';

type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type DriveListResponse = {
  files?: DrivePosterFile[];
  nextPageToken?: string;
};

export type DrivePosterFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
};

export type PosterMatch = {
  file: DrivePosterFile;
  score: number;
};

const psdMimeTypes = ['image/vnd.adobe.photoshop', 'image/x-photoshop'];
const tokenScope = 'https://www.googleapis.com/auth/drive.readonly';
const driveApiBase = 'https://www.googleapis.com/drive/v3';

let cachedToken: { token: string; expiresAt: number } | null = null;

const base64Url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

export const normalizePosterName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\.[^.]+$/i, '')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/[^a-zа-я0-9]+/giu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const words = (value: string) => new Set(normalizePosterName(value).split(' ').filter((word) => word.length > 1));

const wordsMatch = (a: string, b: string) => {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 3 && longer.startsWith(shorter);
};

export const scorePosterFileName = (productName: string, fileName: string) => {
  const product = normalizePosterName(productName);
  const file = normalizePosterName(fileName);
  if (!product || !file) return 0;
  if (product === file) return 1;
  if (product.includes(file) || file.includes(product)) return 0.92;

  const productWords = words(product);
  const fileWords = words(file);
  if (!productWords.size || !fileWords.size) return 0;
  const intersection = [...productWords].filter((word) => [...fileWords].some((fileWord) => wordsMatch(word, fileWord))).length;
  const union = new Set([...productWords, ...fileWords]).size;
  const overlap = intersection / Math.max(productWords.size, fileWords.size);
  const jaccard = intersection / union;
  return Number(Math.max(overlap * 0.85, jaccard).toFixed(3));
};

const credentialsPath = () => {
  const configured = config.googleApplicationCredentials;
  if (!configured) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not configured.');
  return path.isAbsolute(configured) ? configured : path.resolve(__dirname, '../..', configured);
};

const readServiceAccount = async (): Promise<GoogleServiceAccount> => {
  const raw = await fs.readFile(credentialsPath(), 'utf8');
  const parsed = JSON.parse(raw) as GoogleServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google service account JSON is missing client_email or private_key.');
  }
  return parsed;
};

const requestAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.token;

  const serviceAccount = await readServiceAccount();
  const privateKey = serviceAccount.private_key;
  if (!privateKey) throw new Error('Google service account JSON is missing private_key.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: tokenScope,
    aud: serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || 'Failed to authorize Google Drive service account.');
  }

  cachedToken = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
};

const driveRequest = async <T>(pathAndQuery: string): Promise<T> => {
  const token = await requestAccessToken();
  const response = await fetch(`${driveApiBase}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || 'Google Drive request failed.');
  return payload as T;
};

const listPosterFilesByQuery = async (mimeQuery: string, folderId = config.googleDrivePostersFolderId): Promise<DrivePosterFile[]> => {
  if (!folderId) throw new Error('GOOGLE_DRIVE_POSTERS_FOLDER_ID is not configured.');
  const files: DrivePosterFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and (${mimeQuery})`,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await driveRequest<DriveListResponse>(`/files?${params.toString()}`);
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return files.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
};

export const listPosterPsdFiles = async (folderId = config.googleDrivePostersFolderId): Promise<DrivePosterFile[]> => {
  const mimeQuery = psdMimeTypes.map((mimeType) => `mimeType = '${mimeType}'`).join(' or ');
  const files = await listPosterFilesByQuery(mimeQuery, folderId);
  return files.filter((file) => file.name.toLowerCase().endsWith('.psd') || psdMimeTypes.includes(file.mimeType));
};

const findPosterFileForProduct = async (productName: string, files: DrivePosterFile[]) => {
  const matches = files
    .map((file) => ({ file, score: scorePosterFileName(productName, file.name) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = matches[0] ?? null;
  return {
    best: best && best.score >= 0.45 ? best : null,
    candidates: matches.slice(0, 5),
  };
};

export const findPosterPsdForProduct = async (productName: string) =>
  findPosterFileForProduct(productName, await listPosterPsdFiles());

export const downloadPosterDriveFile = async (fileId: string) => {
  const token = await requestAccessToken();
  const response = await fetch(`${driveApiBase}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || 'Failed to download poster file from Google Drive.');
  }
  return Buffer.from(await response.arrayBuffer());
};

export const safePosterPdfFileName = (value: string) =>
  (value
    .replace(/[^\wа-яА-ЯёЁ. -]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'poster.pdf')
    .replace(/\.pdf$/i, '') + '.pdf';

export const posterPdfContentDisposition = (fileName: string) => {
  const safe = safePosterPdfFileName(fileName);
  const asciiFallback = safe
    .normalize('NFKD')
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'poster';
  const fallback = `${asciiFallback}.pdf`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
};
