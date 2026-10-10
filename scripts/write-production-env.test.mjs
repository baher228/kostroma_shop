import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deployment preserves ENV_FILE and overrides configured settings, including literal credential dollars and quotes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'analitika-env-test-'));
  try {
    const file = join(directory, 'production.env');
    const credential = 'test-$UNSET-${ALSO_UNSET}-"quoted"-slash\\-single\'';
    const env = { ...process.env,
      ENV_FILE: 'PERSONAL_POSTGRES_PASSWORD=test-db\nOPS_POSTGRES_PASSWORD=test-ops-db\nJWT_SECRET=test-jwt\nOPS_JWT_SECRET=test-ops\nCORS_ORIGIN=https://example.com\nQC_ENABLED=false\nS3_SECRET_KEY=old-value\nS3_BUCKET_AUDIO=preserved-bucket\nGMAIL_GLOBAL_DEDUPE_BY_HASH=false\n',
      DEPLOY_PERSONAL_POSTGRES_PASSWORD: credential,
      DEPLOY_CORS_ORIGIN: 'https://affera.co.uk', DEPLOY_QC_ENABLED: 'true', DEPLOY_S3_SECRET_KEY: credential, DEPLOY_S3_BUCKET_AUDIO: '',
      DEPLOY_GMAIL_CLIENT_SECRET: credential,DEPLOY_GMAIL_ENABLED: 'true',DEPLOY_GMAIL_GLOBAL_DEDUPE_BY_HASH: 'true',
    };
    for (const key of Object.keys(env)) {
      if (key.startsWith('DEPLOY_') && !['DEPLOY_PERSONAL_POSTGRES_PASSWORD', 'DEPLOY_CORS_ORIGIN', 'DEPLOY_QC_ENABLED', 'DEPLOY_S3_SECRET_KEY', 'DEPLOY_S3_BUCKET_AUDIO', 'DEPLOY_GMAIL_CLIENT_SECRET', 'DEPLOY_GMAIL_ENABLED', 'DEPLOY_GMAIL_GLOBAL_DEDUPE_BY_HASH'].includes(key)) delete env[key];
    }
    const output = execFileSync(process.execPath, ['scripts/write-production-env.mjs', file], { env, encoding: 'utf8' });
    assert.equal(output, '', 'the env writer must not print credentials');
    assert.ok(readFileSync(file, 'utf8').startsWith(env.ENV_FILE));
    assert.ok(readFileSync(file, 'utf8').includes(`GMAIL_CLIENT_SECRET=${JSON.stringify(credential).replace(/\$/gu, () => '$$')}`));
    assert.ok(readFileSync(file, 'utf8').includes('GMAIL_ENABLED="true"'));
    assert.ok(readFileSync(file, 'utf8').includes('GMAIL_GLOBAL_DEDUPE_BY_HASH="true"'));
    const composeEnv = { ...process.env };
    for (const key of ['PERSONAL_POSTGRES_PASSWORD', 'CORS_ORIGIN', 'QC_ENABLED', 'S3_SECRET_KEY', 'S3_BUCKET_AUDIO', 'GMAIL_GLOBAL_DEDUPE_BY_HASH']) delete composeEnv[key];
    const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', file, '-f', 'docker-compose.ru.yml',
      'config', '--format', 'json'], { env: composeEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    // Compose escapes dollars again when rendering a reusable config model.
    // --environment reports the actual values resolved from the env file.
    const resolved = execFileSync('docker', ['compose', '--env-file', file, '-f', 'docker-compose.ru.yml',
      'config', '--environment'], { env: composeEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(resolved.split(/\r?\n/u).find(line => line.startsWith('S3_SECRET_KEY=')), `S3_SECRET_KEY=${credential}`);
    assert.equal(config.services['backend-ru'].environment.S3_SECRET_KEY, credential.replace(/\$/gu, () => '$$'));
    assert.equal(config.services['postgres-ru'].environment.POSTGRES_PASSWORD, credential.replace(/\$/gu, () => '$$'));
    assert.equal(config.services['backend-ru'].environment.PERSONAL_POSTGRES_PASSWORD, credential.replace(/\$/gu, () => '$$'));
    assert.equal(config.services['backend-ru'].environment.S3_BUCKET_AUDIO, 'preserved-bucket');
    assert.equal(config.services['backend-ru'].environment.QC_ENABLED, 'true');
    assert.equal(config.services['backend-ru'].environment.CORS_ORIGIN, 'https://affera.co.uk');
    const dubaiConfig = JSON.parse(execFileSync('docker', ['compose', '--env-file', file, '-f', 'docker-compose.dubai.yml',
      'config', '--format', 'json'], { env: composeEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(String(dubaiConfig.services['backend-dubai'].environment.GMAIL_GLOBAL_DEDUPE_BY_HASH), 'true');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('deployment rejects multiline overrides before writing an env file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'analitika-env-test-'));
  try {
    const file = join(directory, 'production.env');
    const result = spawnSync(process.execPath, ['scripts/write-production-env.mjs', file], {
      env: { ...process.env, ENV_FILE: 'QC_ENABLED=true', DEPLOY_S3_SECRET_KEY: 'test\nINJECTED=value' }, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stderr.includes('INJECTED=value'));
    assert.throws(() => readFileSync(file), { code: 'ENOENT' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
