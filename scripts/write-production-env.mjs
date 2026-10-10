import { writeFileSync } from 'node:fs';

// Append only explicitly configured deployment overrides. Compose reads the
// last assignment, so unrelated settings in the complete ENV_FILE are retained.
const names = ['PERSONAL_POSTGRES_PASSWORD', 'CORS_ORIGIN', 'QC_ENABLED', 'QC_WORKER_ENABLED', 'S3_ENDPOINT_URL', 'S3_ACCESS_KEY',
  'S3_SECRET_KEY', 'S3_BUCKET_AUDIO', 'S3_REGION', 'NEXARA_API_KEY',
  'GIGACHAT_AUTH_KEY', 'GIGACHAT_SCOPE', 'GIGACHAT_CA_BUNDLE_PATH',
  'GMAIL_ENABLED', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI', 'GMAIL_TOKEN_ENCRYPTION_KEY'];
const base = process.env.ENV_FILE;
if (!base?.trim() || !process.argv[2]) throw new Error('ENV_FILE and output path are required');
const lines = [base, ''];
for (const name of names) {
  const value = process.env[`DEPLOY_${name}`];
  if (!value) continue;
  if (/[\r\n\0]/u.test(value)) throw new Error(`Invalid multiline deployment setting: ${name}`);
  // Compose supports double-quoted escapes; $$ keeps literal credential dollars
  // from being interpreted as references to other environment variables.
  lines.push(`${name}=${JSON.stringify(value).replace(/\$/gu, () => '$$')}`);
}
writeFileSync(process.argv[2], `${lines.join('\n')}\n`, { mode: 0o600 });
