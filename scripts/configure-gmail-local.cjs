// Import a Web OAuth client without printing or committing credentials.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname,'..');
const client = JSON.parse(fs.readFileSync(process.argv[2] || '','utf8')).web;
const redirect = 'http://127.0.0.1:5173/dxb/api/promotions/gmail/oauth/callback';
if (!client?.client_id || !client.client_secret || !client.redirect_uris?.includes(redirect)) {
  throw new Error('A Web OAuth JSON with the local authorized redirect URI is required.');
}
const envPath = path.join(root,'services/dubai-backend/.env');
const current = fs.readFileSync(envPath,'utf8');
const key = current.match(/^GMAIL_TOKEN_ENCRYPTION_KEY="?([0-9a-f]{64})"?\r?$/mi)?.[1] || randomBytes(32).toString('hex');
const values = { GMAIL_CLIENT_ID: client.client_id,GMAIL_CLIENT_SECRET: client.client_secret,GMAIL_REDIRECT_URI: redirect,
  GMAIL_TOKEN_ENCRYPTION_KEY: key,GMAIL_ENABLED: 'true' };
const lines = current.split(/\r?\n/).filter((line) => !Object.keys(values).some((name) => line.startsWith(`${name}=`)));
fs.writeFileSync(envPath,lines.join('\n').trimEnd() + '\n' + Object.entries(values).map(([name,value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n',{ mode: 0o600 });
console.log('Local Web OAuth configured. Restart the Dubai backend and connect Gmail in the dashboard.');
