const test = require('node:test');
const assert = require('node:assert/strict');
const { NexaraSttProvider, GigaChatAnalysisProvider, mapNexaraTranscript } = require('../dist/quality-control/providers');
const { validateAnalysis, classifyQuality, calculateOverallScore, criterionKeys, dialogAnalysisJsonSchema } = require('../dist/quality-control/analysis');

const transcript = { sessionId: 'private-session-id', language: 'ru', duration: 12, segments: [
  { start: 0, end: 3, speaker: 'speaker_0', text: 'Здравствуйте! Чем могу помочь?' },
  { start: 3, end: 7, speaker: 'speaker_1', text: 'Хочу оформить возврат.' },
] };
const input = { sessionId: transcript.sessionId, audio: Buffer.from('fake audio'), mimeType: 'audio/wav', filename: 'employee-sensitive-name.wav', duration: 12 };

function validAnalysis(score = 8) {
  return {
    schemaVersion: '1.1',
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
  assert.deepEqual([result.promptVersion, result.scorecardVersion, result.schemaVersion], ['1.1', '1.0', '1.1']);
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
