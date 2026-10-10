import { opsDb } from '../db/opsDb';

export const saveGmailOAuthState = async (stateHash: string,browserHash: string,verifierEncrypted: string) => {
  await opsDb.query('DELETE FROM gmail_oauth_states WHERE expires_at <= NOW();');
  await opsDb.query(`INSERT INTO gmail_oauth_states (state_hash,browser_hash,verifier_encrypted,expires_at)
    VALUES ($1,$2,$3,NOW() + INTERVAL '10 minutes');`, [stateHash,browserHash,verifierEncrypted]);
};
export const consumeGmailOAuthState = async (stateHash: string,browserHash: string) => {
  const result = await opsDb.query<{ verifier_encrypted: string }>(`DELETE FROM gmail_oauth_states
    WHERE state_hash=$1 AND browser_hash=$2 AND expires_at > NOW() RETURNING verifier_encrypted;`, [stateHash,browserHash]);
  return result.rows[0]?.verifier_encrypted ?? null;
};
export const readGmailConnection = async () => {
  const result = await opsDb.query<{ email: string; refresh_token_encrypted: string; connected_at: Date }>(
    'SELECT email,refresh_token_encrypted,connected_at FROM gmail_connection WHERE singleton=TRUE;');
  return result.rows[0] ?? null;
};
export const saveGmailConnection = async (email: string,encryptedToken: string) => {
  await opsDb.query(`INSERT INTO gmail_connection (singleton,email,refresh_token_encrypted) VALUES (TRUE,$1,$2)
    ON CONFLICT (singleton) DO UPDATE SET email=EXCLUDED.email,refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,connected_at=NOW();`, [email,encryptedToken]);
};
export const deleteGmailConnection = async () => {
  await opsDb.query('DELETE FROM gmail_connection;');
};
