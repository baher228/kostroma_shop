const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const express = require('express');
const { config } = require('../dist/config/config');
const oauth = require('../dist/gmail/gmailOAuth');
const repository = require('../dist/repositories/gmailConnectionRepository');
const imports = require('../dist/repositories/gmailImportsRepository');
const { GmailService,GmailPollBusyError } = require('../dist/gmail/gmailService');
const { GmailConfigurationError } = require('../dist/gmail/gmailClient');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const configured = (t) => {
  const before = { ...config };
  Object.assign(config, { gmailClientId: 'test.apps.googleusercontent.com',gmailClientSecret: 'client-secret-hidden',
    gmailRedirectUri: 'https://example.com/dxb/api/promotions/gmail/oauth/callback',gmailTokenEncryptionKey: 'ab'.repeat(32) });
  t.after(() => Object.assign(config,before));
};

test('Gmail connection secrets use authenticated encryption and reject tampering or another key', (t) => {
  configured(t);
  const encrypted = oauth.encryptGmailSecret('refresh-token-hidden');
  assert.ok(!encrypted.includes('refresh-token-hidden'));
  assert.notEqual(encrypted,oauth.encryptGmailSecret('refresh-token-hidden'));
  assert.equal(oauth.decryptGmailSecret(encrypted),'refresh-token-hidden');
  const segments = encrypted.split('.');
  const ciphertext = Buffer.from(segments[3],'base64url'); ciphertext[0] ^= 1;
  segments[3] = ciphertext.toString('base64url');
  assert.throws(() => oauth.decryptGmailSecret(segments.join('.')));
  config.gmailTokenEncryptionKey = 'cd'.repeat(32);
  assert.throws(() => oauth.decryptGmailSecret(encrypted));
  config.gmailTokenEncryptionKey = 'not-a-key';
  assert.equal(oauth.isGmailOAuthConfigured(),false);
});

test('Gmail authorization requests readonly offline consent with PKCE and hashed browser-bound state', async (t) => {
  configured(t);
  let saved;
  t.mock.method(repository,'saveGmailOAuthState',async (...args) => { saved=args; });
  const result = await oauth.beginGmailOAuth();
  const url = new URL(result.authorizationUrl);
  assert.equal(url.origin,'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'),oauth.GMAIL_READ_SCOPE);
  assert.equal(url.searchParams.get('access_type'),'offline');
  assert.equal(url.searchParams.get('prompt'),'consent select_account');
  assert.equal(url.searchParams.get('redirect_uri'),config.gmailRedirectUri);
  assert.equal(saved[0],hash(url.searchParams.get('state')));
  assert.equal(saved[1],hash(result.browser));
  const verifier = oauth.decryptGmailSecret(saved[2]);
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.ok(!JSON.stringify(result).includes(config.gmailClientSecret));
});

test('Gmail callback cannot replace a mailbox with wrong browser state or replayed consent; saved token survives a new client', async (t) => {
  configured(t);
  let stateRecord;
  let connection;
  t.mock.method(repository,'saveGmailOAuthState',async (...args) => { stateRecord=args; });
  t.mock.method(repository,'consumeGmailOAuthState',async (state,browser) => {
    if (!stateRecord || state !== stateRecord[0] || browser !== stateRecord[1]) return null;
    const value=stateRecord[2]; stateRecord=null; return value;
  });
  t.mock.method(imports,'withGmailPollLock',async (callback) => callback(new AbortController().signal));
  t.mock.method(repository,'saveGmailConnection',async (email,token) => { connection={ email,refresh_token_encrypted: token }; });
  t.mock.method(repository,'readGmailConnection',async () => connection);
  const start = await oauth.beginGmailOAuth();
  const state = new URL(start.authorizationUrl).searchParams.get('state');
  let exchanges=0;
  const exchange = async (code,verifier) => {
    exchanges++; assert.equal(code,'google-code'); assert.match(verifier,/^[A-Za-z0-9_-]{43}$/);
    return { email: 'mailbox@example.com',refreshToken: 'token-hidden' };
  };
  await assert.rejects(oauth.finishGmailOAuth(state,'x'.repeat(43),'google-code',exchange),oauth.GmailOAuthError);
  assert.equal(exchanges,0);
  await oauth.finishGmailOAuth(state,start.browser,'google-code',exchange);
  assert.equal(connection.email,'mailbox@example.com');
  assert.equal(oauth.decryptGmailSecret(connection.refresh_token_encrypted),'token-hidden');
  await assert.rejects(oauth.finishGmailOAuth(state,start.browser,'google-code',exchange),oauth.GmailOAuthError);
  assert.equal(exchanges,1);
  const status = await oauth.getGmailConnectionStatus();
  assert.deepEqual(status,{ configured: true,connected: true,email: 'mailbox@example.com' });
  assert.ok(!JSON.stringify(status).includes('token'));
  const restarted = await oauth.getConnectedGmailClient();
  assert.equal(restarted.mailbox,'mailbox@example.com');
  assert.equal(typeof restarted.client.listMessages,'function');
});

test('mailbox switch and disconnect are blocked by an active poll and disconnected installs do not retain the old client', async (t) => {
  configured(t);
  t.mock.method(imports,'withGmailPollLock',async () => null);
  const remove = t.mock.method(repository,'deleteGmailConnection',async () => {});
  await assert.rejects(oauth.disconnectGmail(),GmailPollBusyError);
  assert.equal(remove.mock.callCount(),0);
  config.gmailRefreshToken = undefined;
  t.mock.method(repository,'readGmailConnection',async () => null);
  await assert.rejects(oauth.getConnectedGmailClient(),GmailConfigurationError);
});

test('Google token exchange verifies actual readonly consent before reading the mailbox profile', async (t) => {
  configured(t);
  const { google }=require('googleapis');
  let scopes=[]; let profileCalls=0; let codeRequest;
  t.mock.method(google.auth,'OAuth2',function () { return {
    getToken: async (input) => { codeRequest=input; return { tokens: { access_token: 'hidden-access',refresh_token: 'hidden-refresh' } }; },
    getTokenInfo: async () => ({ scopes }),setCredentials: () => {},
  }; });
  t.mock.method(google,'gmail',() => ({ users: { getProfile: async () => { profileCalls++; return { data: { emailAddress: 'Mailbox@Example.com' } }; } } }));
  await assert.rejects(oauth.exchangeGmailOAuthCode('code','verifier'),(error) => error instanceof oauth.GmailOAuthError && error.reason === 'permission');
  assert.equal(profileCalls,0);
  scopes=[oauth.GMAIL_READ_SCOPE];
  assert.deepEqual(await oauth.exchangeGmailOAuthCode('code','verifier'),{ email: 'mailbox@example.com',refreshToken: 'hidden-refresh' });
  assert.deepEqual(codeRequest,{ code: 'code',codeVerifier: 'verifier' });
});

test('resolved mailbox and cursor are refreshed inside the import lock on every poll', async () => {
  let locked=false; let email='first@example.com';
  const claimed=[]; const cursorKeys=[];
  const attachment={ filename: 'ignored.exe',mimeType: 'application/octet-stream',body: { attachmentId: 'same-file',size: 4 } };
  const client={ listMessages: async () => ({ messages: [{ id: 'same-id' }] }),
    getMessage: async () => ({ payload: { headers: [{ name: 'From',value: 'sender@example.com' }],parts: [attachment] } }) };
  const service=new GmailService(null,{ resolveClient: async () => { assert.ok(locked); return { client,mailbox: email }; },dependencies: { repository: {
    withGmailPollLock: async (fn) => { locked=true; try { return await fn(new AbortController().signal); } finally { locked=false; } },
    recoverGmailImportObjects: async () => {},failExhaustedGmailImports: async () => {},
    getGmailPollCursor: async (key) => { cursorKeys.push(key); },setGmailPollCursor: async () => {},
    claimGmailImport: async (input) => { claimed.push(input); return { id: 'claim',attemptCount: 1 }; },
    completeGmailImport: async () => {},
  } } });
  await service.poll(); email='second@example.com'; await service.poll();
  assert.deepEqual(claimed.map((item) => item.mailbox),['first@example.com','second@example.com']);
  assert.equal(claimed[0].messageId,claimed[1].messageId);
  assert.notEqual(cursorKeys[0],cursorKeys[1]);
});

test('OAuth callback is public but cannot bypass state; connect and disconnect require manager authorization', async (t) => {
  configured(t);
  const { createDubaiApp } = require('../dist/app/dubaiApp');
  const poller = require('../dist/gmail/gmailPoller');
  const calls=[];
  t.mock.method(oauth,'finishGmailOAuth',async (...args) => { calls.push(args); throw new oauth.GmailOAuthError('state'); });
  t.mock.method(poller,'pollGmailNow',async () => { throw new Error('must not poll'); });
  const server=createDubaiApp().listen(0,'127.0.0.1');
  await new Promise((resolve) => server.once('listening',resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for (const endpoint of ['connect','disconnect']) {
    assert.equal((await fetch(`${base}/api/promotions/gmail/${endpoint}`,{ method: 'POST' })).status,401);
  }
  const { registerGmailOAuthManagerRoutes }=require('../dist/routes/gmailOAuthRoutes');
  const worker=express(); worker.use((req,_res,next) => { req.ops={ role: 'worker' }; next(); }); registerGmailOAuthManagerRoutes(worker);
  const workerServer=worker.listen(0,'127.0.0.1'); await new Promise((resolve) => workerServer.once('listening',resolve));
  t.after(() => new Promise((resolve) => workerServer.close(resolve)));
  assert.equal((await fetch(`http://127.0.0.1:${workerServer.address().port}/api/promotions/gmail/connect`,{ method: 'POST' })).status,403);
  const response=await fetch(`${base}/api/promotions/gmail/oauth/callback?state=fake&code=secret-code`,{ redirect: 'manual' });
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'https://example.com/?gmail=failed');
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.match(response.headers.get('set-cookie'),/Secure/);
  assert.match(response.headers.get('set-cookie'),/SameSite=Lax/);
  assert.ok(!response.headers.get('location').includes('secret-code'));
  assert.deepEqual(calls[0],['fake','','secret-code']);
});
