const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { createQcTestDatabase } = require('./quality-control.db-helper');
const { QualityControlRepository } = require('../dist/repositories/qualityControlRepository');
const { QualityControlService, validateQcAudio } = require('../dist/services/qualityControlService');
const { QualityControlWorker } = require('../dist/quality-control/worker');
const { QualityControlRetentionWorker } = require('../dist/quality-control/retentionWorker');
const { retentionForAnalysis } = require('../dist/quality-control/retention');
const { MinioQcStorage } = require('../dist/quality-control/storage');
const { QcError } = require('../dist/quality-control/types');
const { criterionKeys } = require('../dist/quality-control/analysis');

let db;
let migrate;
before(async () => {
  ({ db, migrate } = await createQcTestDatabase());
});
after(async () => { await db?.close(); });

test('all Russia migrations apply and the existing migration runner is repeatable', async () => {
  const first = await db.query('SELECT name FROM schema_migrations ORDER BY name');
  const migrationCount = readdirSync(path.resolve(__dirname, '../migrations')).filter(name => name.endsWith('.sql')).length;
  assert.equal(first.rows.length, migrationCount);
  assert.equal(first.rows.at(-1).name, '016_task_series_weekday_repeats.sql');
  await migrate();
  assert.deepEqual((await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows, first.rows);
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'qc_%'");
  assert.equal(tables.rows.length, 7);
  assert.ok((await db.query("SELECT id FROM users WHERE role = 'worker'")).rows.length);
});

test('QC migration enforces existing identities, valid timing, and media constraints', async () => {
  const base = ['migration-session', 'shop_main', 'u_worker_01', 'u_manager_01', '2026-08-01T10:00:00Z'];
  const insert = 'INSERT INTO qc_sessions(id,shop_id,seller_id,created_by,started_at) VALUES($1,$2,$3,$4,$5)';
  await assert.rejects(db.query(insert, ['missing-seller', 'shop_main', 'missing', base[3], base[4]]), { code: '23503' });
  await assert.rejects(db.query(insert, ['missing-creator', 'shop_main', base[2], 'missing', base[4]]), { code: '23503' });
  await db.query(insert, base);
  await assert.rejects(db.query('UPDATE qc_sessions SET ended_at = started_at - interval \'1 second\' WHERE id = $1', [base[0]]), { code: '23514' });
  await assert.rejects(db.query('UPDATE qc_sessions SET shift_id = $1 WHERE id = $2', ['missing-shift', base[0]]), { code: '23503' });
  const media = `INSERT INTO qc_media(id,session_id,type,storage_key,storage_bucket,original_filename,mime_type,size,sha256)
    VALUES($1,$2,'audio',$1,'ml-audio','sample.wav','audio/wav',$3,'test-hash')`;
  await assert.rejects(db.query(media, ['empty-audio', base[0], 0]), { code: '23514' });
  await db.query(media, ['migration-media', base[0], 42]);
  await assert.rejects(db.query(media, ['second-audio', base[0], 42]), { code: '23505' });
  await assert.rejects(db.query('DELETE FROM users WHERE id = $1', [base[2]]), error => ['23001', '23503'].includes(error.code));
  await db.query('DELETE FROM qc_sessions WHERE id = $1', [base[0]]);
});

const manager = { id: 'u_manager_01', username: 'manager', firstName: 'Main', lastName: 'Manager', fullName: 'Main Manager', role: 'manager', shopId: null, shopName: null };
const workerUser = { id: 'u_worker_01', username: 'worker', firstName: 'Store', lastName: 'Worker', fullName: 'Store Worker', role: 'worker', shopId: 'shop_main', shopName: null };
const otherWorker = { ...workerUser, id: 'other-worker' };
const makeAnalysis = (score, sentiment = 'negative') => ({
  schemaVersion: '1.1',
  summary: { short: 'Клиент выбрал товар.', customerIntent: 'Подобрать товар.', outcome: 'Товар подобран.' },
  quality: { overallScore: 0, criteria: Object.fromEntries(criterionKeys.map(key => [key, {
    score, maxScore: 10, status: score >= 8 ? 'good' : score >= 6 ? 'neutral' : 'needs_improvement', comment: 'Проверено по диалогу.',
  }])) },
  customer: { sentiment, satisfaction: 'satisfied' },
  dialog: { hasConflict: false, hasComplaint: false, hasObjection: true, saleIntentDetected: true,
    upsellDetected: false, crossSellDetected: false, purchaseCompleted: false },
  strengths: ['Вежливость.'], problems: [], violations: [], recommendations: ['Уточнять потребность клиента.'],
});
const wav = () => {
  const value = Buffer.alloc(64);
  value.write('RIFF', 0, 'ascii');
  value.write('WAVE', 8, 'ascii');
  return value;
};

test('QC session creation is scoped, relation-checked and idempotent', async () => {
  const repository = new QualityControlRepository(db);
  const input = { shopId: 'shop_main', sellerId: workerUser.id, externalSessionId: 'device-recording-1', startedAt: '2026-08-02T10:00:00.000Z', endedAt: '2026-08-02T10:01:00.000Z' };
  const session = await repository.createSession(workerUser, input);
  assert.equal(session.sellerId, workerUser.id);
  assert.equal((await repository.createSession(workerUser, input)).id, session.id);
  await assert.rejects(repository.createSession(workerUser, { ...input, endedAt: '2026-08-02T10:02:00.000Z' }), { code: 'IDEMPOTENCY_CONFLICT', status: 409 });
  await assert.rejects(repository.createSession(otherWorker, { ...input, externalSessionId: 'other' }), { code: 'FORBIDDEN', status: 403 });
  await assert.rejects(repository.createSession(manager, { ...input, sellerId: 'missing', externalSessionId: 'bad-seller' }), { code: 'INVALID_SELLER' });
  await db.query(`INSERT INTO worker_checkin_events(id,worker_id,worker_display_name,status,event_at,shop_id,source)
    VALUES('shift-open', 'u_worker_01', 'Store Worker', 'in', '2026-08-02T09:00:00Z', 'shop_main', 'manual')`);
  const shifted = await repository.createSession(manager, { ...input, shiftId: 'shift-open', externalSessionId: 'shifted' });
  assert.equal(shifted.shiftId, 'shift-open');
  await db.query(`INSERT INTO worker_checkin_events(id,worker_id,worker_display_name,status,event_at,shop_id,source)
    VALUES('shift-close', 'u_worker_01', 'Store Worker', 'out', '2026-08-02T10:00:30Z', 'shop_main', 'manual')`);
  await assert.rejects(repository.createSession(manager, { ...input, shiftId: 'shift-open', externalSessionId: 'after-close' }), { code: 'INVALID_SHIFT' });
});

test('QC audio MVP runs asynchronously end-to-end, preserves history and aggregates SQL analytics', async () => {
  const repository = new QualityControlRepository(db);
  const stored = new Map();
  const storage = {
    bucket: 'existing-private-minio',
    async put(key, value) { stored.set(key, Buffer.from(value)); },
    async get(key) { return stored.get(key); },
    async remove(key) { stored.delete(key); },
  };
  const service = new QualityControlService(repository, storage, 1024 * 1024);
  const session = await repository.createSession(manager, {
    shopId: 'shop_main', sellerId: workerUser.id, externalSessionId: 'e2e-recording-1',
    startedAt: '2026-08-03T10:00:00.000Z', endedAt: '2026-08-03T10:01:00.000Z',
  });
  const audio = wav();
  const accepted = await service.uploadAudio(manager, session.id, { originalname: '../private name.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length });
  assert.equal(accepted.job.stage, 'transcription');
  assert.equal(accepted.job.status, 'queued');
  assert.match(accepted.media.storageKey, /^quality-control\/shops\/shop_main\/sessions\/qc_[\w-]+\/audio\/[a-f0-9]{64}\.wav$/);
  assert.equal(accepted.media.originalFilename, 'private name.wav');
  assert.deepEqual(await storage.get(accepted.media.storageKey), audio);
  const duplicate = await service.uploadAudio(manager, session.id, { originalname: 'renamed.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length });
  assert.equal(duplicate.media.id, accepted.media.id);
  await assert.rejects(service.uploadAudio(manager, session.id, { originalname: 'different.wav', mimetype: 'audio/wav', buffer: Buffer.concat([audio, Buffer.from('x')]), size: audio.length + 1 }), { code: 'AUDIO_EXISTS', status: 409 });
  assert.equal(stored.size, 1, 'rejected replacement audio does not leave an orphan object');

  let analysisScore = 9;
  let sttCalls = 0;
  const worker = new QualityControlWorker({
    repository, storage,
    stt: { async transcribe(input) {
      sttCalls += 1;
      assert.equal(input.sessionId, session.id);
      assert.deepEqual(input.audio, audio);
      return { transcript: { sessionId: session.id, language: 'ru', duration: 60, segments: [
        { start: 0, end: 4, speaker: 'speaker_0', text: 'Здравствуйте, помогите выбрать товар.', confidence: 0.95 },
      ] }, metadata: { provider: 'nexara', model: 'test-model', latencyMs: 5 }, rawResult: { test: true } };
    } },
    analysis: { async analyzeDialog(transcript) {
      assert.equal(transcript.sessionId, session.id);
      return { analysis: makeAnalysis(analysisScore), metadata: { provider: 'gigachat', model: 'test-model', latencyMs: 8 },
        promptVersion: '1.1', scorecardVersion: '1.0', schemaVersion: '1.1' };
    } },
    maxAttempts: 3, retryBaseMs: 1, leaseMs: 60_000, pollIntervalMs: 50,
  });
  assert.equal(await worker.runOnce(), true);
  assert.equal(await worker.runOnce(), true);
  assert.equal(sttCalls, 1);
  assert.equal((await repository.getStatus(manager, session.id)).status, 'completed');
  const transcript = await repository.getTranscript(manager, session.id);
  assert.equal(transcript.transcript.segments[0].speaker, 'speaker_0');
  assert.equal((await db.query('SELECT raw_result FROM qc_transcripts WHERE session_id=$1', [session.id])).rows[0].raw_result, null,
    'canonical segments are retained without duplicating the raw provider payload');
  const first = await repository.getAnalysis(manager, session.id);
  assert.equal(first.overallScore, 90);
  assert.equal(first.qualityClass, 'good');
  assert.equal(first.customerSentiment, 'negative', 'customer mood remains separate from service quality');
  assert.equal(first.structuredResult.quality.overallScore, 90);
  assert.equal((await repository.getAudioInfo(manager, session.id)).retentionClass, 'standard');
  await assert.rejects(repository.getTranscript(otherWorker, session.id), { code: 'FORBIDDEN' });

  const overview = await repository.analytics(manager, 'overview', { shopId: 'shop_main', from: '2026-08-03T00:00:00Z', to: '2026-08-04T00:00:00Z' });
  assert.deepEqual({ total: overview.totalDialogs, processed: overview.processedDialogs, good: overview.good, neutral: overview.neutral, bad: overview.bad },
    { total: 1, processed: 1, good: 1, neutral: 0, bad: 0 });
  assert.equal(overview.averageScore, 90);
  assert.equal(overview.goodPercentage, 100);
  const trends = await repository.analytics(manager, 'trends', { interval: 'day', shopId: 'shop_main', from: '2026-08-03T00:00:00Z', to: '2026-08-04T00:00:00Z' });
  assert.equal(trends[0].date, '2026-08-03');
  const criteria = await repository.analytics(manager, 'criteria', { shopId: 'shop_main', from: '2026-08-03T00:00:00Z', to: '2026-08-04T00:00:00Z' });
  assert.equal(criteria.length, 7);
  assert.ok(criteria.every(item => item.averageScore === 9 && item.maxScore === 10));

  analysisScore = 4;
  const reanalysisJob = await repository.enqueue(manager, session.id, true, 'scorecard-v2');
  assert.equal((await repository.enqueue(manager, session.id, true, 'scorecard-v2')).id, reanalysisJob.id);
  assert.equal(await worker.runOnce(), true);
  const history = await repository.getAnalysis(manager, session.id, true);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(item => item.version), [2, 1]);
  assert.equal(history[0].qualityClass, 'bad');
  assert.equal(history[1].qualityClass, 'good');
  assert.equal(sttCalls, 1, 'intentional re-analysis reuses the canonical transcript');

  assert.equal((await repository.getAudioInfo(manager, session.id)).retentionClass, 'bad');
  assert.equal((await repository.setAudioPinned(manager, session.id, true)).retentionClass, 'pinned');
  assert.equal((await repository.claimExpiredMedia(10)).length, 0, 'pinned audio cannot be claimed for deletion');
  assert.equal((await repository.setAudioPinned(manager, session.id, false)).retentionClass, 'bad');
  await db.query("UPDATE qc_media SET expires_at=NOW()-INTERVAL '1 second' WHERE session_id=$1", [session.id]);
  const retentionWorker = new QualityControlRetentionWorker(repository, storage, 60_000, 10);
  assert.equal(await retentionWorker.runOnce(), 1);
  assert.equal(stored.size, 0);
  assert.ok((await repository.getAudioInfo(manager, session.id)).deletedAt);
  await assert.rejects(service.downloadAudio(manager, session.id), { code: 'AUDIO_EXPIRED', status: 410 });
});

test('QC unpin restores critical-problem retention from the canonical analysis', async () => {
  const repository = new QualityControlRepository(db);
  const session = await repository.createSession(manager, { shopId: 'shop_main', sellerId: workerUser.id,
    externalSessionId: 'unpin-critical-problem', startedAt: '2026-08-04T10:00:00Z' });
  const storage = { bucket: 'test', async put() {}, async get() { return wav(); }, async remove() {} };
  const service = new QualityControlService(repository, storage, 1024);
  const audio = wav();
  await service.uploadAudio(manager, session.id, { originalname: 'test.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length });
  const analysis = makeAnalysis(9);
  analysis.problems.push({ type: 'test-incident', severity: 'critical', description: 'Критическая проблема.',
    evidence: [{ segmentIndex: 0, quote: 'Тест.' }] });
  const worker = new QualityControlWorker({ repository, storage,
    stt: { async transcribe({ sessionId }) { return { transcript: { sessionId, language: 'ru', duration: 1,
      segments: [{ start: null, end: null, speaker: 'unknown', text: 'Тест.' }] }, metadata: { provider: 'nexara', model: 'test' } }; } },
    analysis: { async analyzeDialog() { return { analysis, metadata: { provider: 'gigachat', model: 'test' },
      promptVersion: '1.1', scorecardVersion: '1.0', schemaVersion: '1.1' }; } },
    maxAttempts: 2, retryBaseMs: 1, leaseMs: 60000, pollIntervalMs: 50 });
  await worker.runOnce();
  await worker.runOnce();
  assert.equal((await repository.getAudioInfo(manager, session.id)).retentionClass, 'bad');
  await repository.setAudioPinned(manager, session.id, true);
  assert.equal((await repository.setAudioPinned(manager, session.id, false)).retentionClass, 'bad');
});

test('QC retention keeps strong upsells longer and prioritizes incidents', () => {
  const durations = { standardMs: 3, badMs: 7, interestingMs: 7 };
  const routine = makeAnalysis(9, 'positive');
  assert.deepEqual(retentionForAnalysis(routine, 'good', durations).retentionClass, 'standard');
  routine.dialog.upsellDetected = true;
  assert.equal(retentionForAnalysis(routine, 'good', durations).retentionClass, 'interesting');
  routine.dialog.hasComplaint = true;
  assert.equal(retentionForAnalysis(routine, 'bad', durations).retentionClass, 'bad');
});

test('QC upload validation rejects empty, oversized and spoofed media before storage', () => {
  assert.throws(() => validateQcAudio(undefined, 100), { code: 'MEDIA_INVALID' });
  const audio = wav();
  assert.throws(() => validateQcAudio({ originalname: 'a.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length }, 10), { code: 'MEDIA_TOO_LARGE' });
  assert.throws(() => validateQcAudio({ originalname: 'a.wav', mimetype: 'audio/wav', buffer: Buffer.alloc(64), size: 64 }, 100), { code: 'MEDIA_UNSUPPORTED' });
});

test('QC worker retries transient stage errors and records safe terminal errors', async () => {
  const repository = new QualityControlRepository(db);
  const storage = { bucket: 'existing-private-minio', async put() {}, async get() { return wav(); }, async remove() {} };
  const service = new QualityControlService(repository, storage, 1024);
  const session = await repository.createSession(manager, { shopId: 'shop_main', sellerId: workerUser.id,
    externalSessionId: 'retry-recording-1', startedAt: '2026-08-05T10:00:00Z' });
  const audio = wav();
  await service.uploadAudio(manager, session.id, { originalname: 'retry.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length });
  const worker = new QualityControlWorker({ repository, storage,
    stt: { async transcribe() { throw new QcError('NEXARA_TIMEOUT', 'The provider timed out.', 502, true); } },
    analysis: { async analyzeDialog() { throw new Error('must not run'); } },
    maxAttempts: 2, retryBaseMs: 1, leaseMs: 60_000, pollIntervalMs: 50 });
  await worker.runOnce();
  let status = await repository.getStatus(manager, session.id);
  assert.equal(status.status, 'queued');
  assert.equal(status.latestJob.attempt, 1);
  assert.equal(status.latestJob.errorCode, 'NEXARA_TIMEOUT');
  assert.equal(status.latestJob.errorMessage, 'The provider timed out.');
  await db.query("UPDATE qc_processing_jobs SET available_at=NOW() WHERE session_id=$1", [session.id]);
  await worker.runOnce();
  status = await repository.getStatus(manager, session.id);
  assert.equal(status.status, 'transcription_failed');
  assert.equal(status.latestJob.status, 'failed');
  assert.equal(status.latestJob.attempt, 2);
  await repository.setAudioPinned(manager, session.id, true);
  assert.equal((await repository.setAudioPinned(manager, session.id, false)).retentionClass, 'bad');
});

test('QC exhausted lease keeps failed audio for diagnosis instead of deleting it immediately', async () => {
  const repository = new QualityControlRepository(db);
  const session = await repository.createSession(manager, { shopId: 'shop_main', sellerId: workerUser.id,
    externalSessionId: 'exhausted-lease', startedAt: '2026-08-07T10:00:00Z' });
  const service = new QualityControlService(repository, { bucket: 'test', async put() {}, async get() {}, async remove() {} }, 1024);
  const audio = wav();
  await service.uploadAudio(manager, session.id, { originalname: 'test.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length });
  const job = await repository.claimJob(1, 60000);
  await db.query("UPDATE qc_processing_jobs SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [job.id]);
  await db.query("UPDATE qc_media SET expires_at=NOW()-INTERVAL '1 second' WHERE session_id=$1", [session.id]);
  await repository.claimJob(1, 60000);
  assert.equal((await repository.getStatus(manager, session.id)).status, 'transcription_failed');
  const media = await repository.getAudioInfo(manager, session.id);
  assert.equal(media.retentionClass, 'bad');
  assert.ok(Date.parse(media.expiresAt) > Date.now() + 6 * 24 * 60 * 60 * 1000);
  assert.equal((await repository.claimExpiredMedia(10)).length, 0);
});

test('QC job lease token fences stale repeated delivery and creates one downstream job', async () => {
  const repository = new QualityControlRepository(db);
  const storage = { bucket: 'existing-private-minio', async put() {}, async get() { return wav(); }, async remove() {} };
  const service = new QualityControlService(repository, storage, 1024);
  const session = await repository.createSession(manager, { shopId: 'shop_main', sellerId: workerUser.id,
    externalSessionId: 'lease-recording-1', startedAt: '2026-08-06T10:00:00Z' });
  const audio = wav();
  const accepted = await service.uploadAudio(manager, session.id, { originalname: 'lease.wav', mimetype: 'audio/wav', buffer: audio, size: audio.length });
  const first = await repository.claimJob(3, 60_000);
  assert.equal(first.id, accepted.job.id);
  await db.query("UPDATE qc_processing_jobs SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [first.id]);
  const replacement = await repository.claimJob(3, 60_000);
  assert.equal(replacement.id, first.id);
  assert.notEqual(replacement.leaseToken, first.leaseToken);
  const result = { transcript: { sessionId: session.id, language: 'ru', duration: 1,
    segments: [{ start: 0, end: 1, speaker: 'unknown', text: 'Тест.' }] }, metadata: { provider: 'nexara', model: 'test' } };
  assert.equal(await repository.completeTranscription(first, accepted.media, result), false);
  assert.equal(await repository.completeTranscription(replacement, accepted.media, result), true);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM qc_transcripts WHERE session_id=$1', [session.id])).rows[0].count, 1);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM qc_processing_jobs WHERE session_id=$1 AND stage='analysis'", [session.id])).rows[0].count, 1);
});

test('QC MinIO adapter uses the existing private bucket with bounded S3 operations', async () => {
  const storage = new MinioQcStorage({ endpoint: 'http://minio.internal:9000', accessKey: 'key', secretKey: 'secret',
    bucket: 'existing-audio', region: 'us-east-1', maxAudioBytes: 10, timeoutMs: 25 });
  const calls = [];
  storage.client = { async send(command) {
    calls.push(command);
    if (command.constructor.name === 'GetObjectCommand') {
      return { Body: (async function* () { yield Buffer.from('abc'); yield Buffer.from('def'); })() };
    }
    return {};
  } };
  await storage.put('private/key.wav', Buffer.from('audio'), 'audio/wav');
  assert.deepEqual(await storage.get('private/key.wav'), Buffer.from('abcdef'));
  await storage.remove('private/key.wav');
  await storage.remove('old/key.wav', 'previous-audio-bucket');
  assert.deepEqual(calls.map(call => [call.constructor.name, call.input.Bucket, call.input.Key]), [
    ['PutObjectCommand', 'existing-audio', 'private/key.wav'],
    ['GetObjectCommand', 'existing-audio', 'private/key.wav'],
    ['DeleteObjectCommand', 'existing-audio', 'private/key.wav'],
    ['DeleteObjectCommand', 'previous-audio-bucket', 'old/key.wav'],
  ]);
  const oversized = new MinioQcStorage({ endpoint: 'http://minio.internal:9000', accessKey: 'key', secretKey: 'secret',
    bucket: 'existing-audio', region: 'us-east-1', maxAudioBytes: 2 });
  oversized.client = { async send() { return { Body: (async function* () { yield Buffer.from('abc'); })() }; } };
  await assert.rejects(oversized.get('too-big.wav'), { code: 'STORAGE_ERROR', status: 413 });
  const timeout = new MinioQcStorage({ endpoint: 'http://minio.internal:9000', accessKey: 'key', secretKey: 'secret',
    bucket: 'existing-audio', region: 'us-east-1', maxAudioBytes: 10, timeoutMs: 5 });
  timeout.client = { send(_command, options) { return new Promise((_resolve, reject) => options.abortSignal.addEventListener('abort',
    () => reject(Object.assign(new Error('private'), { name: 'AbortError' })), { once: true })); } };
  await assert.rejects(timeout.get('slow.wav'), { code: 'STORAGE_TIMEOUT', retryable: true });
});
