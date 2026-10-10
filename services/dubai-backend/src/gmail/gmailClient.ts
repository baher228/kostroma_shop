import { config } from '../config/config';
import type { GmailMimePart } from './gmailAttachmentParser';

export type GmailMessage = { id?: string | null; internalDate?: string | null; payload?: GmailMimePart | null };
export type GmailApiClient = {
  listMessages: (query: string, maxResults: number, pageToken?: string) => Promise<{ messages: Array<{ id: string }>; nextPageToken?: string }>;
  getMessage: (messageId: string) => Promise<GmailMessage>;
  getAttachment: (messageId: string, attachmentId: string) => Promise<string>;
};
export class GmailConfigurationError extends Error {
  constructor() {
    super('Gmail включён, но GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET или GMAIL_REFRESH_TOKEN не заполнены.');
    this.name = 'GmailConfigurationError';
  }
}
const errorInfo = (error: unknown) => error as { code?: unknown; message?: string; response?: { status?: unknown; data?: { error?: unknown } }; $metadata?: { httpStatusCode?: unknown } } | null;
const errorStatus = (error: unknown) => Number(errorInfo(error)?.response?.status ?? errorInfo(error)?.$metadata?.httpStatusCode ?? errorInfo(error)?.code);
export const isTemporaryGmailError = (error: unknown) => {
  const status = errorStatus(error);
  if (status === 408 || status === 429 || status >= 500 && status <= 599) return true;
  return ['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ECONNREFUSED','40001','40P01','53300','57P01','57P02','57P03','08000','08001','08003','08006'].includes(String(errorInfo(error)?.code ?? ''));
};
export const isGmailAuthenticationError = (error: unknown) => errorStatus(error) === 401 ||
  /invalid_grant|invalid credentials|unauthorized/i.test(`${errorInfo(error)?.message || ''} ${errorInfo(error)?.response?.data?.error || ''}`);
export const isInvalidGmailPageTokenError = (error: unknown) => errorStatus(error) === 400 && /page\s*token/i.test(errorInfo(error)?.message || '');

export const withGmailRetry = async <T>(operation: () => Promise<T>, attempts = 3, wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve,ms))): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (isGmailAuthenticationError(error) || !isTemporaryGmailError(error) || attempt >= attempts) throw error;
      await wait(Math.min(500 * 2 ** (attempt - 1),4000));
    }
  }
};

// Error payloads from Google/R2 may include request credentials. Only fixed,
// actionable diagnostics cross the logs, health and history API boundary.
export const sanitizedGmailError = (error: unknown) => {
  if (error instanceof GmailConfigurationError) return error.message;
  if (isGmailAuthenticationError(error)) return 'Gmail требует повторной авторизации: invalid_grant / 401. Выполните gmail:auth и обновите refresh token.';
  if (error instanceof Error && error.name === 'PromotionImportPrerequisiteError') return 'Не загружен прайс розничных цен; импорт накладной будет повторён.';
  if (isTemporaryGmailError(error)) return 'Временная ошибка Gmail, хранилища или базы данных; будет выполнена повторная попытка.';
  return 'Не удалось обработать вложение. Проверьте формат файла и настройки Gmail/R2/БД.';
};

export const createGmailClient = (): GmailApiClient => {
  if (!config.gmailClientId || !config.gmailClientSecret || !config.gmailRefreshToken) throw new GmailConfigurationError();
  // Lazy loading avoids initializing Google OAuth when Gmail is disabled.
  const { google } = require('googleapis');
  const auth = new google.auth.OAuth2(config.gmailClientId,config.gmailClientSecret);
  auth.setCredentials({ refresh_token: config.gmailRefreshToken });
  const gmail = google.gmail({ version: 'v1', auth });
  const options = { timeout: 30000, retry: false };
  return {
    listMessages: async (q,maxResults,pageToken) => {
      const response: any = await withGmailRetry(() => gmail.users.messages.list({ userId: config.gmailUser,q,maxResults,pageToken },options),config.gmailMaxRetries);
      return { messages: (response.data.messages || []).flatMap((message: { id?: string }) => message.id ? [{ id: message.id }] : []), nextPageToken: response.data.nextPageToken || undefined };
    },
    getMessage: async (id) => {
      const response: any = await withGmailRetry(() => gmail.users.messages.get({ userId: config.gmailUser,id,format: 'full' },options),config.gmailMaxRetries);
      return response.data;
    },
    getAttachment: async (messageId,id) => {
      const response: any = await withGmailRetry(() => gmail.users.messages.attachments.get({ userId: config.gmailUser,messageId,id },options),config.gmailMaxRetries);
      return response.data.data || '';
    },
  };
};
