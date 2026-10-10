import { config } from '../config/config';
import { isGmailOAuthConfigured } from './gmailOAuth';

if (!config.gmailEnabled) {
  console.info('Gmail preflight: automatic import disabled.');
} else if (!isGmailOAuthConfigured() || !config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey || !config.r2Bucket) {
  console.error('Gmail preflight failed: configure Web OAuth client, redirect URI, token encryption key and R2 storage.');
  process.exitCode = 1;
} else {
  console.info('Gmail preflight passed. Mailbox consent will be completed in the dashboard.');
}
