const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { NexaraSttProvider, GigaChatAnalysisProvider, mapNexaraTranscript } = require('../dist/quality-control/providers');
const { validateAnalysis, classifyQuality, calculateOverallScore, criterionKeys, dialogAnalysisJsonSchema } = require('../dist/quality-control/analysis');
const { qcConfig, validateQcConfig } = require('../dist/quality-control/config');

test('QC production preflight accepts explicit standard DB names without opening DB or provider connections', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../dist/quality-control/preflight.js')], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'test-jwt', OPS_JWT_SECRET: 'test-ops',
      CORS_ORIGIN: 'https://example.com', PERSONAL_POSTGRES_HOST: 'postgres-ru', PERSONAL_POSTGRES_USER: 'analitika',
      PERSONAL_POSTGRES_DB: 'analitika_personal', PERSONAL_POSTGRES_PASSWORD: 'test-db-password',
      QC_ENABLED: 'true', QC_WORKER_ENABLED: 'true', S3_ENDPOINT_URL: 'http://minio.internal:9000',
      S3_ACCESS_KEY: 'test-key', S3_SECRET_KEY: 'test-secret', NEXARA_API_KEY: 'test-nexara', GIGACHAT_AUTH_KEY: 'test-giga',
      GIGACHAT_CA_BUNDLE_PATH: path.resolve(__dirname, '../certs/russian_trusted_ca_bundle.crt') },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('QC configuration valid enabled=true worker=true'));
  assert.ok(!result.stdout.includes('test-secret'));
});

test('QC startup rejects invalid endpoints, unsupported providers, missing certificates and short leases', () => {
  const original = { ...qcConfig };
  try {
    Object.assign(qcConfig, { enabled: true, workerEnabled: true, storageEndpoint: 'http://minio.internal:9000',
      storageAccessKey: 'test-key', storageSecretKey: 'test-secret', nexaraApiKey: 'test-nexara', gigachatAuthKey: 'test-giga',
      gigachatCaBundlePath: '', sttProvider: 'nexara', llmProvider: 'gigachat', leaseMs: 900000,
      nexaraTimeoutMs: 600000, storageTimeoutMs: 60000, gigachatTimeoutMs: 120000 });
    assert.doesNotThrow(validateQcConfig);
    for (const [key, value, message] of [
      ['storageEndpoint', 'http://minio.internal:9000/audio', /S3_ENDPOINT_URL/],
      ['nexaraBaseUrl', 'http://provider.internal/v1', /NEXARA_BASE_URL/],
      ['gigachatAuthUrl', 'https://user:private@example.com/oauth', /GIGACHAT_AUTH_URL/],
      ['gigachatCaBundlePath', 'missing-qc-ca-bundle.pem', /GIGACHAT_CA_BUNDLE_PATH/],
      ['sttProvider', 'unsupported', /Unsupported QC provider/],
      ['storageSecretKey', '   ', /S3_SECRET_KEY/],
      ['leaseMs', 600000, /QC_JOB_LEASE_MS/],
    ]) {
      const previous = qcConfig[key];
      qcConfig[key] = value;
      assert.throws(validateQcConfig, message);
      qcConfig[key] = previous;
    }
  } finally { Object.assign(qcConfig, original); }
});

const transcript = { sessionId: 'private-session-id', language: 'ru', duration: 12, segments: [
  { start: 0, end: 3, speaker: 'speaker_0', text: 'Здравствуйте! Чем могу помочь?' },
  { start: 3, end: 7, speaker: 'speaker_1', text: 'Хочу оформить возврат.' },
] };
const input = { sessionId: transcript.sessionId, audio: Buffer.from('fake audio'), mimeType: 'audio/wav', filename: 'employee-sensitive-name.wav', duration: 12 };

function validAnalysis(score = 8) {
  return {
    schemaVersion: '1.2',
  boundaries: { start: 'starts_here', end: 'ends_here', confidence: 'high', explanation: 'Explicit greeting and goodbye.' },
    summary: { short: 'Клиент обратился за возвратом.', customerIntent: 'Оформить возврат.', outcome: 'Результат в записи отсутствует.' },
    quality: { overallScore: 42, criteria: Object.fromEntries(criterionKeys.map((key) => [key, { score, maxScore: 10, status: 'good', comment: 'Оценка по записи.' }])) },
    customer: { sentiment: 'negative', satisfaction: 'unknown' },
    dialog: { hasConflict: false, hasComplaint: false, hasObjection: false, saleIntentDetected: false,
      upsellDetected: false, crossSellDetected: false, purchaseCompleted: false },
    strengths: ['Вежливое приветствие.'], problems: [], violations: [], recommendations: [],
  };
}
function completion(analysis = validAnalysis(), finishReason = 'stop') {
  return { model: 'GigaChat-2-Max:revision', choices: [{ finish_reason: finishReason, message: { role: 'assistant', content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } };
}
function fakeGiga(result, config = {}) {
  return new GigaChatAnalysisProvider({ credentials: 'test-auth-key', ...config }, () => ({ chat: async () => typeof result === 'function' ? result() : result }));
}

test('QC Nexara sends verified multipart fields and maps real speaker segments without domain metadata', async () => {
  const raw = { task: 'diarize', text: 'Здравствуйте!', language: 'ru', duration: 3.4, segments: [{ start: 0, end: 2.5, text: 'Здравствуйте!', speaker: 'speaker_0', confidence: 0.8, arbitrary: 'provider-only' }] };
  const provider = new NexaraSttProvider({ apiKey: 'test-nexara-key', diarization: true }, async (url, request) => {
    assert.equal(url, 'https://api.nexara.ru/v1/audio/transcriptions');
    assert.equal(request.headers.Authorization, 'Bearer test-nexara-key');
    assert.equal(request.redirect, 'error');
    assert.equal(request.body.get('task'), 'diarize');
    assert.equal(request.body.get('response_format'), 'verbose_json');
    assert.equal(request.body.get('timestamp_granularities[]'), 'segment');
    assert.equal(request.body.get('file').name, 'dialog.wav');
    assert.deepEqual(Buffer.from(await request.body.get('file').arrayBuffer()), input.audio);
    return Response.json(raw);
  });
  const result = await provider.transcribe(input);
  assert.deepEqual(result.transcript, { sessionId: input.sessionId, language: 'ru', duration: 3.4, segments: [{ start: 0, end: 2.5, text: 'Здравствуйте!', speaker: 'speaker_0', confidence: 0.8 }] });
  assert.equal(result.metadata.provider, 'nexara');
  assert.deepEqual(result.rawResult, raw);
});

test('QC canonical transcript retains unknown timing and speakers for plain-text Nexara response', () => {
  const result = mapNexaraTranscript({ text: ' Текст. ' }, 'session', 45);
  assert.deepEqual(result, { sessionId: 'session', language: null, duration: 45, segments: [{ start: null, end: null, speaker: 'unknown', text: 'Текст.' }] });
});

test('QC rejects empty, malformed and inverted transcription timestamps', () => {
  for (const value of [{ text: ' ' }, { segments: [] }]) assert.throws(() => mapNexaraTranscript(value, 'session'), { code: 'NEXARA_EMPTY_TRANSCRIPT' });
  for (const value of [{ text: 123 }, { segments: [{ start: 8, end: 1, text: 'Текст' }] }, { segments: [{ start: -1, end: 1, text: 'Текст' }] }]) {
    assert.throws(() => mapNexaraTranscript(value, 'session'), { code: 'NEXARA_RESPONSE_INVALID' });
  }
});

test('QC Nexara aborts timed-out network requests', async () => {
  const provider = new NexaraSttProvider({ apiKey: 'key', timeoutMs: 5 }, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('secret diagnostic'), { name: 'AbortError' })), { once: true });
  }));
  await assert.rejects(provider.transcribe(input), { code: 'NEXARA_TIMEOUT', retryable: true });
});

test('QC Nexara classifies failures without preserving provider bodies or credentials', async () => {
  for (const [status, code, retryable] of [[401, 'NEXARA_AUTH_ERROR', false], [403, 'NEXARA_AUTH_ERROR', false], [429, 'NEXARA_RATE_LIMIT', true], [500, 'NEXARA_ERROR', true], [400, 'NEXARA_ERROR', false]]) {
    const provider = new NexaraSttProvider({ apiKey: 'secret' }, async () => new Response('private transcript and token', { status }));
    await assert.rejects(provider.transcribe(input), (error) => error.code === code && error.retryable === retryable && !JSON.stringify(error).includes('private'));
  }
  await assert.rejects(new NexaraSttProvider({}).transcribe(input), { code: 'NEXARA_NOT_CONFIGURED' });
  await assert.rejects(new NexaraSttProvider({ apiKey: 'key' }, async () => new Response('<bad>')).transcribe(input), { code: 'NEXARA_RESPONSE_INVALID' });
  await assert.rejects(new NexaraSttProvider({ apiKey: 'key', maxResponseBytes: 5 }, async () => Response.json({ text: 'too long' })).transcribe(input), { code: 'NEXARA_RESPONSE_TOO_LARGE' });
});

test('QC GigaChat uses strict native JSON schema, verified TLS and excludes internal identifiers', async () => {
  let factoryCalls = 0;
  let capturedConfig;
  let capturedRequest;
  const provider = new GigaChatAnalysisProvider({ credentials: 'test-auth', timeoutMs: 2000 }, (config) => {
    factoryCalls += 1;
    capturedConfig = config;
    return { chat: async (request) => { capturedRequest = request; return completion(); } };
  });
  const result = await provider.analyzeDialog({ ...transcript, sellerId: 'private-seller-id', userId: 'private-user-id' });
  await provider.analyzeDialog(transcript);
  assert.equal(factoryCalls, 1, 'SDK instance and its own token lifecycle are reused');
  assert.equal(capturedConfig.credentials, 'test-auth');
  assert.equal(capturedConfig.accessToken, undefined);
  assert.equal(capturedConfig.timeout, 2);
  assert.equal(capturedConfig.baseUrl, 'https://api.giga.chat/v1/');
  assert.equal(capturedConfig.authUrl, 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth');
  assert.equal(capturedConfig.model, 'GigaChat-3-Pro');
  assert.equal(capturedConfig.httpsAgent.options.rejectUnauthorized, true);
  assert.equal(capturedRequest.response_format.strict, true);
  assert.equal(capturedRequest.response_format.type, 'json_schema');
  assert.equal(capturedRequest.response_format.schema, dialogAnalysisJsonSchema);
  assert.equal(capturedRequest.response_format.json_schema, undefined);
  assert.equal(JSON.stringify(capturedRequest).includes('private-'), false);
  assert.deepEqual(JSON.parse(capturedRequest.messages[1].content), { language: 'ru',
    segments: transcript.segments.map(({ speaker, text }, segmentIndex) => ({ segmentIndex, speaker, text })) });
  assert.equal(result.analysis.quality.overallScore, 80);
  assert.equal(result.analysis.customer.sentiment, 'negative');
  assert.equal(result.metadata.model, 'GigaChat-2-Max:revision');
  assert.equal(result.metadata.totalTokens, 300);
  assert.deepEqual([result.promptVersion, result.scorecardVersion, result.schemaVersion], ['1.2', '1.0', '1.2']);
});

test('QC GigaChat rejects invalid JSON, schema violations and incomplete responses', async () => {
  const invalidJson = completion();
  invalidJson.choices[0].message.content = '```json\n{}\n```';
  await assert.rejects(fakeGiga(invalidJson).analyzeDialog(transcript), { code: 'GIGACHAT_JSON_INVALID', retryable: true });
  await assert.rejects(fakeGiga(completion({ summary: 'invalid' })).analyzeDialog(transcript), { code: 'ANALYSIS_SCHEMA_INVALID', retryable: true });
  await assert.rejects(fakeGiga(completion(validAnalysis(), 'length')).analyzeDialog(transcript), { code: 'GIGACHAT_RESPONSE_INCOMPLETE' });
  await assert.rejects(fakeGiga({ choices: [] }).analyzeDialog(transcript), { code: 'GIGACHAT_RESPONSE_INVALID' });
});

test('QC GigaChat sanitizes timeout, rate-limit, auth and upstream failures', async () => {
  for (const [source, code, retryable] of [
    [{ code: 'ECONNABORTED' }, 'GIGACHAT_TIMEOUT', true],
    [{ response: { status: 429 } }, 'GIGACHAT_RATE_LIMIT', true],
    [{ response: { status: 401 } }, 'GIGACHAT_AUTH_ERROR', false],
    [{ response: { status: 503 } }, 'GIGACHAT_ERROR', true],
    [{ code: 'ECONNRESET' }, 'GIGACHAT_UNAVAILABLE', true],
  ]) {
    await assert.rejects(fakeGiga(() => { throw { ...source, message: 'secret transcript', config: { headers: { Authorization: 'secret' } } }; }).analyzeDialog(transcript), (error) => error.code === code && error.retryable === retryable && !JSON.stringify(error).includes('secret'));
  }
  await assert.rejects(new GigaChatAnalysisProvider({}).analyzeDialog(transcript), { code: 'GIGACHAT_NOT_CONFIGURED' });
  await assert.rejects(fakeGiga(completion(), { maxTranscriptChars: 1 }).analyzeDialog(transcript), { code: 'ANALYSIS_INPUT_TOO_LARGE' });
  await assert.rejects(fakeGiga(completion()).analyzeDialog({ ...transcript, segments: [] }), { code: 'ANALYSIS_EMPTY_TRANSCRIPT' });
});

test('QC full response schema rejects bounds, extra keys, missing criteria and fake evidence', () => {
  for (const score of [-1, 11, NaN, Infinity]) assert.throws(() => validateAnalysis(validAnalysis(score)), { code: 'ANALYSIS_SCHEMA_INVALID' });
  const extra = validAnalysis(); extra.quality.qualityClass = 'good';
  assert.throws(() => validateAnalysis(extra), { code: 'ANALYSIS_SCHEMA_INVALID' });
  const missing = validAnalysis(); delete missing.quality.criteria.closing;
  assert.throws(() => validateAnalysis(missing), { code: 'ANALYSIS_SCHEMA_INVALID' });
  const evidence = validAnalysis(); evidence.violations.push({ type: 'conflict', severity: 'low', description: 'Комментарий', evidence: [{ segmentIndex: 1, quote: 'Придуманная реплика.' }] });
  assert.throws(() => validateAnalysis(evidence, transcript), { code: 'ANALYSIS_EVIDENCE_INVALID' });
  evidence.violations[0].evidence = [{ segmentIndex: 1, quote: 'Хочу оформить возврат.' }];
  assert.equal(validateAnalysis(evidence, transcript).violations[0].evidence[0].quote, 'Хочу оформить возврат.');
  evidence.violations[0].evidence = [{ segmentIndex: 1, quote: '«Хочу оформить возврат.»' }];
  assert.equal(validateAnalysis(evidence, transcript).violations[0].evidence[0].quote, '«Хочу оформить возврат.»',
    'outer model-added quotes do not invalidate otherwise exact evidence');
  evidence.violations[0].evidence = [];
  assert.deepEqual(validateAnalysis(evidence, transcript).violations[0].evidence, []);
});

test('QC score and quality class are deterministic, configurable and distinct from sentiment', () => {
  assert.equal(calculateOverallScore(validAnalysis(8).quality.criteria), 80);
  const canonical = validAnalysis(8).quality.criteria;
  canonical.greeting.status = 'neutral';
  assert.equal(calculateOverallScore(canonical), 80);
  assert.equal(canonical.greeting.status, 'good', 'derived labels are canonicalized without another LLM request');
  const criteria = validAnalysis(8).quality.criteria;
  criteria.scriptCompliance = { score: 0, maxScore: 10, status: 'not_applicable', comment: 'Нет скрипта.' };
  assert.equal(calculateOverallScore(criteria), 80);
  assert.equal(classifyQuality(0), 'bad');
  assert.equal(classifyQuality(59.99), 'bad');
  assert.equal(classifyQuality(60), 'neutral');
  assert.equal(classifyQuality(79.99), 'neutral');
  assert.equal(classifyQuality(80), 'good');
  assert.equal(classifyQuality(100), 'good');
  assert.equal(classifyQuality(80, { good: 90, neutral: 50 }), 'neutral');
  assert.throws(() => classifyQuality(101), { code: 'INVALID_SCORE' });
  assert.throws(() => classifyQuality(50, { good: 50, neutral: 60 }), { code: 'INVALID_THRESHOLDS' });
  for (const key of criterionKeys) criteria[key] = { score: 0, maxScore: 10, status: 'not_applicable', comment: 'Недостаточно данных.' };
  assert.throws(() => calculateOverallScore(criteria), { code: 'INVALID_SCORE' });
});

test('QC actual official GigaChat SDK gets credentials token and renews rejected token through mocked transport', async () => {
  const GigaChat = require('gigachat').default;
  const credentials = Buffer.from('test-client:test-secret').toString('base64');
  let authCalls = 0;
  let chatCalls = 0;
  const provider = new GigaChatAnalysisProvider({ credentials }, (config) => {
    const sdk = new GigaChat(config);
    sdk._authClient.defaults.adapter = async (request) => {
      authCalls += 1;
      assert.equal(request.headers.Authorization, `Basic ${credentials}`);
      return { status: 200, statusText: 'OK', config: request, headers: {}, data: { access_token: `test-token-${authCalls}`, expires_at: Date.now() + 1800000 } };
    };
    sdk._client.defaults.adapter = async (request) => {
      chatCalls += 1;
      if (chatCalls === 2) return { status: 401, statusText: 'Unauthorized', config: request, headers: {}, data: { message: 'expired' } };
      assert.equal(request.headers.Authorization, `Bearer test-token-${authCalls}`);
      assert.equal(JSON.parse(request.data).response_format.strict, true);
      return { status: 200, statusText: 'OK', config: request, headers: {}, data: completion() };
    };
    return sdk;
  });
  await provider.analyzeDialog(transcript);
  await provider.analyzeDialog(transcript);
  assert.equal(authCalls, 2);
  assert.equal(chatCalls, 3);
});

test('QC sends the tail/head of two neighbors without identifiers, within the model budget', async () => {
  let payload;
  const provider = new GigaChatAnalysisProvider({ credentials: 'test', maxTranscriptChars: 3000 }, () => ({
    chat: async request => { payload = request; return completion(); },
  }));
  const segments = Array.from({length: 80}, (_, i) => ({speaker: 'speaker_0', text: `utterance-${i} ${'x'.repeat(80)}`}));
  const neighbor = { sessionId: 'private-neighbor', sellerId: 'private-seller', language: 'ru', gapSeconds: 10, segments };
  await provider.analyzeDialog(transcript, { previous: neighbor, next: neighbor });
  const content = payload.messages[1].content;
  assert.ok(content.length <= 3000);
  assert.ok(!content.includes('private-'));
  const input = JSON.parse(content);
  assert.ok(input.context.previous.segments.at(-1).text.startsWith('utterance-79 '));
  assert.ok(input.context.next.segments[0].text.startsWith('utterance-0 '));
  assert.deepEqual(input.segments, transcript.segments.map(({speaker,text},segmentIndex)=>({speaker,text,segmentIndex})));
});

test('QC unavailable neighbors cannot be claimed as a confirmed continuation', async () => {
  const analysis = validAnalysis();
  analysis.boundaries = { start: 'continues_previous', end: 'continues_next', confidence: 'high', explanation: 'Possible continuation.' };
  const result = await fakeGiga(completion(analysis)).analyzeDialog(transcript, { previous: null, next: null });
  assert.equal(result.analysis.boundaries.start, 'unknown');
  assert.equal(result.analysis.boundaries.end, 'unknown');
  assert.equal(result.analysis.boundaries.confidence, 'low');
  assert.equal(result.analysis.quality.criteria.greeting.status, 'not_applicable');
  assert.equal(result.analysis.quality.criteria.closing.status, 'not_applicable');
});

test('QC keeps context edges when plain-text STT returns one oversized utterance', async () => {
  let payload;
  const provider = new GigaChatAnalysisProvider({credentials:'test',maxTranscriptChars:3000},()=>({
    chat:async request=>{payload=request;return completion();},
  }));
  const neighbor={language:'ru',gapSeconds:10,segments:[{speaker:'unknown',text:`head ${'x'.repeat(20000)} tail`}]};
  await provider.analyzeDialog(transcript,{previous:neighbor,next:neighbor});
  assert.ok(payload.messages[1].content.length<=3000);
  const context=JSON.parse(payload.messages[1].content).context;
  assert.ok(context.previous.segments[0].text.endsWith(' tail'));
  assert.ok(context.next.segments[0].text.startsWith('head '));
});

test('QC incomplete boundaries exclude missing greeting and closing from the score', () => {
  const analysis = validAnalysis(8);
  analysis.boundaries.start = 'continues_previous';
  analysis.boundaries.end = 'unknown';
  analysis.quality.criteria.greeting.score = 0;
  analysis.quality.criteria.closing.score = 0;
  const result = validateAnalysis(analysis, transcript);
  assert.equal(result.quality.overallScore, 80);
  assert.equal(result.quality.criteria.greeting.status, 'not_applicable');
  assert.equal(result.quality.criteria.closing.status, 'not_applicable');
});

test('QC neighbor context cannot supply evidence for the current recording', async () => {
  const analysis = validAnalysis();
  analysis.violations = [{type:'rudeness',severity:'high',description:'Only in the neighbor',evidence:[{segmentIndex:0,quote:'neighbor-only phrase'}]}];
  const neighbor = { language:'ru',gapSeconds:10,segments:[{speaker:'speaker_0',text:'neighbor-only phrase'}] };
  await assert.rejects(fakeGiga(completion(analysis)).analyzeDialog(transcript,{previous:neighbor,next:neighbor}),{code:'ANALYSIS_EVIDENCE_INVALID'});
});
