const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseGoogleServiceAccountJson,
  readGoogleServiceAccount,
} = require('../dist/services/googleServiceAccountCredentials');

const credentials = {
  client_email: 'poster-reader@example.test',
  private_key: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://oauth2.googleapis.com/token',
};

test('Google service account accepts inline JSON in GOOGLE_APPLICATION_CREDENTIALS', async () => {
  const parsed = await readGoogleServiceAccount({
    applicationCredentials: JSON.stringify(credentials),
  });

  assert.deepEqual(parsed, credentials);
});

test('Google service account accepts dedicated JSON and base64 env values', async () => {
  const raw = JSON.stringify(credentials);

  assert.deepEqual(
    await readGoogleServiceAccount({ serviceAccountJson: raw }),
    credentials,
  );
  assert.deepEqual(
    await readGoogleServiceAccount({ serviceAccountJsonBase64: Buffer.from(raw).toString('base64') }),
    credentials,
  );
});

test('Google service account accepts double JSON encoding and escaped PEM newlines', () => {
  const escapedCredentials = {
    ...credentials,
    private_key: credentials.private_key.replace(/\n/g, '\\n'),
  };

  const parsed = parseGoogleServiceAccountJson(JSON.stringify(JSON.stringify(escapedCredentials)));
  assert.equal(parsed.private_key, credentials.private_key);
});

test('GOOGLE_APPLICATION_CREDENTIALS keeps file-path compatibility', async () => {
  const calls = [];
  const parsed = await readGoogleServiceAccount(
    { applicationCredentials: 'secrets/service-account.json' },
    {
      baseDirectory: '/application',
      readFile: async (filePath, encoding) => {
        calls.push({ filePath, encoding });
        return JSON.stringify(credentials);
      },
    },
  );

  assert.deepEqual(parsed, credentials);
  assert.deepEqual(calls, [{
    filePath: require('node:path').resolve('/application', 'secrets/service-account.json'),
    encoding: 'utf8',
  }]);
});

test('invalid or incomplete credential JSON produces a configuration error', async () => {
  await assert.rejects(
    readGoogleServiceAccount({ applicationCredentials: '{invalid' }),
    /invalid JSON/,
  );
  await assert.rejects(
    readGoogleServiceAccount({ serviceAccountJson: JSON.stringify({ client_email: 'only@example.test' }) }),
    /missing client_email or private_key/,
  );
});
