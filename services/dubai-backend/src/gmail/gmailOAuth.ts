import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'crypto';
import { config } from '../config/config';
import * as repository from '../repositories/gmailConnectionRepository';
import { withGmailPollLock } from '../repositories/gmailImportsRepository';
import { createGmailClient,GmailConfigurationError } from './gmailClient';
import { GmailPollBusyError } from './gmailService';

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export class GmailOAuthError extends Error {
  constructor(public readonly reason: 'configuration' | 'state' | 'permission' | 'authorization') {
    super('Не удалось подключить Gmail. Попробуйте подключить аккаунт заново.');
    this.name = 'GmailOAuthError';
  }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const encryptionKey = () => {
  if (!config.gmailTokenEncryptionKey || !/^[0-9a-f]{64}$/i.test(config.gmailTokenEncryptionKey)) throw new GmailOAuthError('configuration');
  return Buffer.from(config.gmailTokenEncryptionKey,'hex');
};
export const encryptGmailSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from('gmail-oauth-v1'));
  const encrypted = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
};
export const decryptGmailSecret = (value: string) => {
  const [version,iv,tag,data,...extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data || extra.length) throw new GmailOAuthError('configuration');
  const decipher = createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from('gmail-oauth-v1'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
};
export const gmailOAuthConfig = () => {
  if (!config.gmailClientId || !config.gmailClientSecret || !config.gmailRedirectUri) throw new GmailOAuthError('configuration');
  encryptionKey();
  const callback = new URL(config.gmailRedirectUri);
  if (callback.search || callback.hash || callback.username || callback.password ||
    callback.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && callback.protocol === 'http:' && ['127.0.0.1','localhost'].includes(callback.hostname))) {
    throw new GmailOAuthError('configuration');
  }
  if (!callback.pathname.endsWith('/api/promotions/gmail/oauth/callback')) throw new GmailOAuthError('configuration');
  return { callback,clientId: config.gmailClientId,clientSecret: config.gmailClientSecret };
};
export const isGmailOAuthConfigured = () => { try { gmailOAuthConfig(); return true; } catch { return false; } };
const oauthClient = () => {
  const settings = gmailOAuthConfig();
  const { google } = require('googleapis');
  return new google.auth.OAuth2(settings.clientId,settings.clientSecret,settings.callback.href);
};
export const beginGmailOAuth = async () => {
  const auth = oauthClient();
  const state = randomBytes(32).toString('base64url');
  const browser = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  await repository.saveGmailOAuthState(hash(state),hash(browser),encryptGmailSecret(verifier));
  return { browser,authorizationUrl: auth.generateAuthUrl({
    scope: [GMAIL_READ_SCOPE,GMAIL_SEND_SCOPE],access_type: 'offline',prompt: 'consent select_account',state,include_granted_scopes: true,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method: 'S256',
  }) as string };
};
export const exchangeGmailOAuthCode = async (code: string,verifier: string) => {
  const auth = oauthClient();
  const { tokens } = await auth.getToken({ code,codeVerifier: verifier });
  if (!tokens.refresh_token || !tokens.access_token) throw new GmailOAuthError('authorization');
  // Check the scopes actually granted, including granular consent denial.
  const info = await auth.getTokenInfo(tokens.access_token);
  if (!info.scopes.includes(GMAIL_READ_SCOPE)) throw new GmailOAuthError('permission');
  auth.setCredentials(tokens);
  const { google } = require('googleapis');
  const profile = await google.gmail({ version: 'v1',auth }).users.getProfile({ userId: 'me' },{ timeout: 30000,retry: false });
  const email = String(profile.data.emailAddress || '').toLowerCase();
  if (!email || email.length > 320 || !email.includes('@')) throw new GmailOAuthError('authorization');
  return { email,refreshToken: tokens.refresh_token as string,scopes: info.scopes.filter((scope: string) => [GMAIL_READ_SCOPE,GMAIL_SEND_SCOPE].includes(scope)) };
};
export const finishGmailOAuth = async (state: string,browser: string,code: string,exchange: (code: string,verifier: string) => Promise<{ email: string; refreshToken: string; scopes?: string[] }> = exchangeGmailOAuthCode) => {
  gmailOAuthConfig();
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser) || !code || code.length > 4096) throw new GmailOAuthError('state');
  const encrypted = await repository.consumeGmailOAuthState(hash(state),hash(browser));
  if (!encrypted) throw new GmailOAuthError('state');
  const result = await exchange(code,decryptGmailSecret(encrypted));
  const saved = await withGmailPollLock(async (signal) => {
    signal.throwIfAborted();
    await repository.saveGmailConnection(result.email,encryptGmailSecret(result.refreshToken),result.scopes ?? []);
    return true;
  });
  if (!saved) throw new GmailPollBusyError();
};
export const disconnectGmail = async () => {
  const removed = await withGmailPollLock(async (signal) => {
    signal.throwIfAborted();
    await repository.deleteGmailConnection();
    return true;
  });
  if (!removed) throw new GmailPollBusyError();
};
export const getGmailConnectionStatus = async () => {
  const connection = await repository.readGmailConnection();
  return { configured: isGmailOAuthConfigured(),connected: Boolean(connection || config.gmailRefreshToken),email: connection?.email ?? null,
    canSend: Boolean(connection?.granted_scopes?.includes(GMAIL_SEND_SCOPE)) };
};
// Called inside the poll lock, so changing the mailbox never races an import.
export const getConnectedGmailClient = async () => {
  const connection = await repository.readGmailConnection();
  if (connection) return { client: createGmailClient(decryptGmailSecret(connection.refresh_token_encrypted)),mailbox: connection.email,canSend: Boolean(connection.granted_scopes?.includes(GMAIL_SEND_SCOPE)) };
  // Preserve existing CLI integrations for installations that already use them.
  if (config.gmailRefreshToken) return { client: createGmailClient(),mailbox: 'legacy',canSend: false };
  throw new GmailConfigurationError();
};
