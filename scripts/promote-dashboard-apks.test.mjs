import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bash = process.env.BASH_PATH || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'Programs/Git/bin/bash.exe') : 'bash');
const script = fileURLToPath(new URL('./promote-dashboard-apks.sh', import.meta.url));
const sha = '123abcd';
const manifests = ['analitika-latest.json', 'analitika-worker-latest.json'];
const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'analitika-apk-release-'));
  const downloads = path.join(root, 'downloads');
  const staging = path.join(downloads, '.staging', 'test-run');
  mkdirSync(staging, { recursive: true });
  writeFileSync(path.join(downloads, 'previous.apk'), 'previous APK');
  const files = {};
  for (const [index, prefix] of ['analitika-tablet', 'analitika-fob'].entries()) {
    const name = `${prefix}-v1.0.0-${sha}.apk`;
    files[name] = Buffer.from(`${prefix} APK`);
    files[manifests[index]] = Buffer.from(JSON.stringify({ buildSha: sha, url: `/downloads/${name}` }, null, 2));
    writeFileSync(path.join(downloads, manifests[index]), 'previous manifest');
  }
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(staging, name), body);
  writeFileSync(path.join(staging, 'SHA256SUMS'), Object.entries(files).map(([name, body]) =>
    `${createHash('sha256').update(body).digest('hex')}  ${name}\n`).join(''));
  return { root, downloads, staging, files };
};
const publish = (f, commit = sha) => spawnSync(bash,
  [script, f.staging, f.downloads, commit].map(s => s.replaceAll('\\', '/')), { encoding: 'utf8' });
const unchanged = f => {
  for (const name of manifests) assert.equal(readFileSync(path.join(f.downloads, name), 'utf8'), 'previous manifest');
  assert.equal(readFileSync(path.join(f.downloads, 'previous.apk'), 'utf8'), 'previous APK');
};

test('publish both verified APKs, preserve previous downloads, remove only the empty staging directory', () => {
  const f = fixture();
  try {
    const result = publish(f);
    assert.equal(result.status, 0, result.stderr);
    for (const [name, body] of Object.entries(f.files)) assert.deepEqual(readFileSync(path.join(f.downloads, name)), body);
    assert.equal(readFileSync(path.join(f.downloads, 'previous.apk'), 'utf8'), 'previous APK');
    assert.equal(existsSync(f.staging), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
for (const problem of ['missing APK', 'corrupt APK', 'wrong commit']) {
  test(`refuse ${problem} before changing either public manifest`, () => {
    const f = fixture();
    try {
      const apk = path.join(f.staging, `analitika-fob-v1.0.0-${sha}.apk`);
      if (problem === 'missing APK') rmSync(apk);
      if (problem === 'corrupt APK') writeFileSync(apk, 'broken upload');
      const result = publish(f, problem === 'wrong commit' ? 'abcdef0' : sha);
      assert.notEqual(result.status, 0);
      unchanged(f);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}
