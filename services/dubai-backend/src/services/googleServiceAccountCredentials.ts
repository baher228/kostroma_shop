import fs from 'fs/promises';
import path from 'path';

export type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type CredentialSources = {
  applicationCredentials?: string;
  serviceAccountJson?: string;
  serviceAccountJsonBase64?: string;
};

type ReadFile = (filePath: string, encoding: BufferEncoding) => Promise<string>;

const normalizePrivateKey = (privateKey: string) =>
  privateKey.includes('\\n') && !privateKey.includes('\n')
    ? privateKey.replace(/\\n/g, '\n')
    : privateKey;

const parseJsonValue = (raw: string): unknown => {
  let parsed: unknown = JSON.parse(raw.trim());
  // Some secret stores JSON-encode the complete credential JSON a second time.
  if (typeof parsed === 'string') parsed = JSON.parse(parsed.trim());
  return parsed;
};

export const parseGoogleServiceAccountJson = (raw: string): GoogleServiceAccount => {
  let parsed: unknown;
  try {
    parsed = parseJsonValue(raw);
  } catch {
    throw new Error('Google service account credentials contain invalid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Google service account credentials must be a JSON object.');
  }

  const serviceAccount = parsed as GoogleServiceAccount;
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google service account JSON is missing client_email or private_key.');
  }

  return {
    ...serviceAccount,
    private_key: normalizePrivateKey(serviceAccount.private_key),
  };
};

const looksLikeInlineJson = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('"{') || trimmed.includes('"client_email"');
};

export const readGoogleServiceAccount = async (
  sources: CredentialSources,
  options: {
    baseDirectory?: string;
    readFile?: ReadFile;
  } = {},
): Promise<GoogleServiceAccount> => {
  if (sources.serviceAccountJsonBase64) {
    const decoded = Buffer.from(sources.serviceAccountJsonBase64.trim(), 'base64').toString('utf8');
    return parseGoogleServiceAccountJson(decoded);
  }

  if (sources.serviceAccountJson) {
    return parseGoogleServiceAccountJson(sources.serviceAccountJson);
  }

  const applicationCredentials = sources.applicationCredentials?.trim();
  if (!applicationCredentials) {
    throw new Error(
      'Google service account is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON, '
      + 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, or GOOGLE_APPLICATION_CREDENTIALS.',
    );
  }

  // Google normally defines GOOGLE_APPLICATION_CREDENTIALS as a file path, but
  // deployment secret stores commonly put the credential JSON directly in it.
  if (looksLikeInlineJson(applicationCredentials)) {
    return parseGoogleServiceAccountJson(applicationCredentials);
  }

  const filePath = path.isAbsolute(applicationCredentials)
    ? applicationCredentials
    : path.resolve(options.baseDirectory ?? process.cwd(), applicationCredentials);
  const raw = await (options.readFile ?? fs.readFile)(filePath, 'utf8');
  return parseGoogleServiceAccountJson(raw);
};
