const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { registerQualityControlRoutes } = require('../dist/routes/qualityControlRoutes');

const manager = { id: 'manager', username: 'manager', firstName: 'Main', lastName: 'Manager', fullName: 'Main Manager', role: 'manager', shopId: null, shopName: null };
const worker = { id: 'worker', username: 'worker', firstName: 'Store', lastName: 'Worker', fullName: 'Store Worker', role: 'worker', shopId: 'shop_main', shopName: null };

async function withApp(user, enabled, callback) {
  const calls = [];
  const service = {
    maxAudioBytes: 1024,
    async createSession(_user, input) { calls.push(['create', input]); return { id: 'qc_test', ...input }; },
    async listSessions() { return [{ id: 'qc_test' }]; },
    async getSession() { return { id: 'qc_test', shopId: 'shop_main' }; },
    async uploadAudio(_user, id, file) { calls.push(['upload', id, file]); return { media: { id: 'media' }, job: { id: 'job', status: 'queued' } }; },
    async enqueue(_user, id, reanalyze, key) { calls.push(['enqueue', id, reanalyze, key]); return { id: 'job', status: 'queued' }; },
    async getStatus() { return { sessionId: 'qc_test', status: 'queued', jobs: [] }; },
    async getTranscript() { return { transcript: { segments: [] } }; },
    async getAnalysis() { return { overallScore: 80, qualityClass: 'good', structuredResult: { quality: { criteria: {} }, recommendations: ['Practice.'] } }; },
    async analytics(_user, kind, filters) { calls.push(['analytics', kind, filters]); return { kind }; },
  };
  const app = express();
  app.use(express.json());
  const auth = (req, _res, next) => { req.user = user; next(); };
  registerQualityControlRoutes(app, { service, auth, enabled });
  const server = await new Promise(resolve => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  const address = server.address();
  try { await callback(`http://127.0.0.1:${address.port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('QC HTTP routes expose async session/audio/status/result/analytics contracts', async () => {
  await withApp(manager, true, async (base, calls) => {
    const created = await fetch(`${base}/api/quality-control/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: 'shop_main', sellerId: 'worker', startedAt: '2026-08-01T10:00:00Z' }) });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).session.id, 'qc_test');

    const form = new FormData();
    form.append('file', new Blob([Buffer.from('RIFFxxxxWAVEaudio')], { type: 'audio/wav' }), 'dialog.wav');
    const uploaded = await fetch(`${base}/api/quality-control/sessions/qc_test/audio`, { method: 'POST', body: form });
    assert.equal(uploaded.status, 202, await uploaded.clone().text());
    assert.equal((await uploaded.json()).job.status, 'queued');
    assert.equal(calls.find(call => call[0] === 'upload')[2].originalname, 'dialog.wav');

    const started = await fetch(`${base}/api/quality-control/sessions/qc_test/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(started.status, 202);
    assert.equal((await started.json()).job.id, 'job');
    const status = await fetch(`${base}/api/quality-control/sessions/qc_test/status`);
    assert.equal((await status.json()).status, 'queued');
    assert.equal((await fetch(`${base}/api/quality-control/sessions/qc_test/transcript`)).status, 200);
    assert.equal((await fetch(`${base}/api/quality-control/sessions/qc_test/analysis`)).status, 200);
    assert.equal((await fetch(`${base}/api/quality-control/sessions/qc_test/scorecard`)).status, 200);
    assert.equal((await fetch(`${base}/api/quality-control/sessions/qc_test/recommendations`)).status, 200);

    const analytics = await fetch(`${base}/api/quality-control/analytics/trends?from=2026-08-01&to=2026-08-01&interval=week`);
    assert.equal(analytics.status, 200);
    const analyticsCall = calls.find(call => call[0] === 'analytics');
    assert.equal(analyticsCall[1], 'trends');
    assert.equal(analyticsCall[2].from, '2026-08-01T00:00:00.000Z');
    assert.equal(analyticsCall[2].to, '2026-08-02T00:00:00.000Z');

    const missingKey = await fetch(`${base}/api/quality-control/sessions/qc_test/reanalyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missingKey.status, 400);
    const reanalysis = await fetch(`${base}/api/quality-control/sessions/qc_test/reanalyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'analysis-v2' }, body: '{}' });
    assert.equal(reanalysis.status, 202);
    assert.deepEqual(calls.find(call => call[0] === 'enqueue' && call[2] === true).slice(1), ['qc_test', true, 'analysis-v2']);
  });
});

test('QC HTTP routes enforce role gates, feature flag and bounded validation', async () => {
  await withApp(worker, true, async base => {
    assert.equal((await fetch(`${base}/api/quality-control/analytics/overview`)).status, 403);
    assert.equal((await fetch(`${base}/api/quality-control/sessions/qc_test/reanalyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'v2' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${base}/api/quality-control/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId: '../escape', startedAt: 'not-a-date' }) })).status, 400);
    assert.equal((await fetch(`${base}/api/quality-control/sessions/qc_test/audio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
  });
  await withApp(manager, false, async base => {
    assert.equal((await fetch(`${base}/api/quality-control/sessions`)).status, 503);
  });
});
