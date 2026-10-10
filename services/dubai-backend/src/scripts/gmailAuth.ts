import { spawn } from 'child_process';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';

const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const openBrowser = (url: string) => {
  // No shell interpolation: OAuth URLs contain '&' and must be one argument.
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler',url] : [url];
  const child = spawn(command,args,{ detached: true,stdio: 'ignore',windowsHide: true });
  child.on('error',() => console.log('Браузер не открылся. Используйте ссылку авторизации выше.'));
  child.unref();
};

export const authorizeGmail = async () => {
  dotenv.config();
  const credentialsPath = path.resolve(process.cwd(),process.env.GMAIL_OAUTH_CREDENTIALS_FILE || 'secrets/gmail-oauth-client.json');
  const credentials = JSON.parse(await fs.readFile(credentialsPath,'utf8')) as { installed?: { client_id?: string; client_secret?: string } };
  const source = credentials.installed;
  if (!source?.client_id || !source.client_secret) throw new Error('Требуется OAuth JSON для приложения Desktop App (installed).');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const codePromise = new Promise<string>((resolve,reject) => { resolveCode=resolve; rejectCode=reject; });
  // Register rejection handling immediately, before awaiting listener setup.
  void codePromise.catch(() => {});
  let timer: NodeJS.Timeout | undefined;
  const server = http.createServer((request,response) => {
    let url: URL;
    try { url = new URL(request.url || '/','http://127.0.0.1'); }
    catch { response.writeHead(400).end('Invalid callback URL'); return; }
    if (url.pathname !== '/oauth2callback') { response.writeHead(404).end('Not found'); return; }
    const returnedState = url.searchParams.get('state') || '';
    const returnedBytes = Buffer.from(returnedState);
    const expectedBytes = Buffer.from(state);
    const validState = returnedBytes.length === expectedBytes.length && timingSafeEqual(returnedBytes,expectedBytes);
    if (!validState) { response.writeHead(400).end('Invalid OAuth state'); return; }
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code) {
      response.writeHead(400).end('Authorization failed. Return to the terminal.');
      rejectCode(new Error('Google не разрешил доступ Gmail.')); return;
    }
    response.writeHead(200,{ 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Авторизация Gmail завершена. Вернитесь в терминал.');
    resolveCode(code);
  });
  try {
    await new Promise<void>((resolve,reject) => {
      server.once('error',reject);
      server.listen(Number(process.env.GMAIL_AUTH_CALLBACK_PORT || 0),'127.0.0.1',resolve);
    });
    const port = (server.address() as { port: number }).port;
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const { google } = require('googleapis');
    const oauth = new google.auth.OAuth2(source.client_id,source.client_secret,redirectUri);
    const url = oauth.generateAuthUrl({
      access_type: 'offline',prompt: 'consent',scope: [scope],state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method: 'S256',
    });
    timer = setTimeout(() => rejectCode(new Error('Время ожидания авторизации истекло.')),5 * 60 * 1000);
    console.log('Откройте ссылку Google OAuth (доступ только на чтение Gmail):');
    console.log(url);
    openBrowser(url);
    const code = await codePromise;
    const { tokens } = await oauth.getToken({ code,codeVerifier: verifier,redirect_uri: redirectUri });
    if (!tokens.refresh_token) throw new Error('Google не вернул refresh token. Удалите разрешение приложения и повторите gmail:auth.');
    const output = path.resolve(process.cwd(),'secrets/gmail-token.env');
    await fs.mkdir(path.dirname(output),{ recursive: true });
    await fs.writeFile(output,`GMAIL_CLIENT_ID=${source.client_id}\nGMAIL_CLIENT_SECRET=${source.client_secret}\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\nGMAIL_ENABLED=true\n`,{ mode: 0o600 });
    console.log(`Настройки сохранены локально: ${output}`);
    console.log('Перенесите эти четыре значения в .env / секреты контейнера. Не коммитьте этот файл. GMAIL_ALLOWED_SENDERS задайте отдельно.');
  } finally {
    if (timer) clearTimeout(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

if (require.main === module) {
  authorizeGmail().catch(() => {
    // OAuth provider errors can include token request bodies. Keep them private.
    console.error('Авторизация Gmail не завершена. Проверьте Desktop OAuth JSON, разрешение gmail.readonly и повторите команду.');
    process.exitCode=1;
  });
}
