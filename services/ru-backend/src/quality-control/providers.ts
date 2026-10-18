import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { rootCertificates } from 'node:tls';
import GigaChat, { type GigaChatClientConfig } from 'gigachat';
import { z } from 'zod';
import { ANALYSIS_SCHEMA_VERSION, SCORECARD_VERSION, dialogAnalysisJsonSchema, validateAnalysis } from './analysis';
import { DIALOG_ANALYSIS_PROMPT, PROMPT_VERSION } from './prompts/dialog-analysis';
import { QcError, type AnalysisResult, type DialogContext, type DialogNeighbor, type DialogTranscript, type LlmAnalysisProvider, type SttProvider, type SttResult, type TranscriptSegment } from './types';

export type NexaraConfig = { apiKey?: string; baseUrl?: string; model?: string; language?: string; timeoutMs?: number; diarization?: boolean; maxResponseBytes?: number };
export type GigaChatConfig = { credentials?: string; scope?: string; baseUrl?: string; authUrl?: string; model?: string; timeoutMs?: number; caBundlePath?: string; maxTranscriptChars?: number; maxTokens?: number };
export type GigaChatClient = { chat(payload: Record<string, unknown>): Promise<unknown> };
export type GigaChatClientFactory = (config: GigaChatClientConfig) => GigaChatClient;

function httpsBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new QcError('PROVIDER_CONFIG_INVALID', 'An AI provider endpoint is not a valid URL.', 503); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new QcError('PROVIDER_CONFIG_INVALID', 'An AI provider endpoint must be an HTTPS URL without embedded credentials or query parameters.', 503);
  }
  return value.replace(/\/+$/u, '');
}

function providerHttpError(provider: string, status: number): QcError {
  if (status === 401 || status === 403) return new QcError(`${provider}_AUTH_ERROR`, 'AI provider authentication failed. Check the configured credentials and access scope.', 502);
  if (status === 402) return new QcError(`${provider}_BALANCE_ERROR`, 'The AI provider account has insufficient balance.', 502);
  if (status === 429) return new QcError(`${provider}_RATE_LIMIT`, 'The AI provider rate limit was reached.', 502, true);
  if (status === 408 || status === 504) return new QcError(`${provider}_TIMEOUT`, 'The AI provider request timed out.', 502, true);
  return new QcError(`${provider}_ERROR`, 'The AI provider could not process the request.', 502, status >= 500);
}

// Never retain provider exception messages: SDK exceptions can contain an Axios
// request, Authorization headers, response bodies, or the original transcript.
export function safeProviderError(error: unknown, provider: 'NEXARA' | 'GIGACHAT'): QcError {
  if (error instanceof QcError) return error;
  const details = error as { name?: string; code?: string; response?: { status?: number }; status?: number; cause?: { code?: string } } | null;
  const status = details?.response?.status ?? details?.status;
  if (typeof status === 'number') return providerHttpError(provider, status);
  if (['AbortError', 'TimeoutError'].includes(details?.name ?? '') || ['ETIMEDOUT', 'ECONNABORTED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(details?.code ?? details?.cause?.code ?? '')) {
    return new QcError(`${provider}_TIMEOUT`, 'The AI provider request timed out.', 502, true);
  }
  return new QcError(`${provider}_UNAVAILABLE`, 'The AI provider is temporarily unavailable.', 502, true);
}

const providerSegmentSchema = z.object({
  start: z.number().finite().nonnegative().nullish(),
  end: z.number().finite().nonnegative().nullish(),
  text: z.string(),
  speaker: z.string().trim().min(1).max(128).nullish(),
  confidence: z.number().min(0).max(1).optional(),
}).passthrough();
const nexaraResponseSchema = z.object({
  text: z.string().optional(),
  language: z.string().trim().min(1).max(32).nullish(),
  duration: z.number().finite().nonnegative().nullish(),
  segments: z.array(providerSegmentSchema).max(100000).optional(),
}).passthrough();

export function mapNexaraTranscript(value: unknown, sessionId: string, fallbackDuration: number | null = null): DialogTranscript {
  const parsed = nexaraResponseSchema.safeParse(value);
  if (!parsed.success) throw new QcError('NEXARA_RESPONSE_INVALID', 'The transcription provider returned an invalid response.', 502, true);
  const raw = parsed.data;
  const segments: TranscriptSegment[] = (raw.segments ?? []).filter((segment) => segment.text.trim()).map((segment) => {
    const start = segment.start ?? null;
    const end = segment.end ?? null;
    if (start !== null && end !== null && end < start) throw new QcError('NEXARA_RESPONSE_INVALID', 'The transcription provider returned invalid segment times.', 502, true);
    return { start, end, speaker: segment.speaker ?? 'unknown', text: segment.text.trim(), ...(segment.confidence === undefined ? {} : { confidence: segment.confidence }) };
  });
  // Plain-text responses have no real timestamps or speaker assignments. Keep
  // those unknown instead of manufacturing a timeline from total duration.
  if (!segments.length && raw.text?.trim()) segments.push({ start: null, end: null, speaker: 'unknown', text: raw.text.trim() });
  if (!segments.length) throw new QcError('NEXARA_EMPTY_TRANSCRIPT', 'No speech was recognized in the audio.', 422);
  return { sessionId, language: raw.language ?? null, duration: raw.duration ?? fallbackDuration, segments };
}

async function boundedJson(response: Response, limit: number): Promise<unknown> {
  if (!response.body) throw new QcError('NEXARA_RESPONSE_INVALID', 'The transcription provider returned an empty response.', 502, true);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new QcError('NEXARA_RESPONSE_TOO_LARGE', 'The transcription provider response exceeded the configured limit.', 502);
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new QcError('NEXARA_RESPONSE_INVALID', 'The transcription provider returned invalid JSON.', 502, true); }
}

export class NexaraSttProvider implements SttProvider {
  constructor(private readonly config: NexaraConfig, private readonly request: typeof fetch = fetch) {}

  async transcribe(input: Parameters<SttProvider['transcribe']>[0]): Promise<SttResult> {
    if (!this.config.apiKey) throw new QcError('NEXARA_NOT_CONFIGURED', 'Nexara credentials are not configured.', 503);
    const started = Date.now();
    const model = this.config.model ?? 'whisper-1';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 600000);
    try {
      // Contract: https://docs.nexara.ru/api-reference/create_transcription_audio_transcriptions_post
      const form = new FormData();
      const extension = ({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac' } as Record<string, string>)[input.mimeType] ?? 'audio';
      form.append('file', new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), `dialog.${extension}`);
      form.append('model', model);
      form.append('task', this.config.diarization ? 'diarize' : 'transcribe');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
      if (this.config.language) form.append('language', this.config.language);
      const response = await this.request(`${httpsBaseUrl(this.config.baseUrl ?? 'https://api.nexara.ru/v1')}/audio/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: form,
        signal: controller.signal, redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw providerHttpError('NEXARA', response.status);
      }
      const rawResult = await boundedJson(response, this.config.maxResponseBytes ?? 16 * 1024 * 1024);
      return { transcript: mapNexaraTranscript(rawResult, input.sessionId, input.duration), metadata: { provider: 'nexara', model, latencyMs: Date.now() - started }, rawResult };
    } catch (error) { throw safeProviderError(error, 'NEXARA'); }
    finally { clearTimeout(timer); }
  }
}

const gigachatResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({ content: z.string(), role: z.string().optional() }),
  })).min(1),
  usage: z.object({ prompt_tokens: z.number().nonnegative().optional(), completion_tokens: z.number().nonnegative().optional(), total_tokens: z.number().nonnegative().optional() }).optional(),
});

export class GigaChatAnalysisProvider implements LlmAnalysisProvider {
  private client?: GigaChatClient;
  constructor(private readonly config: GigaChatConfig, private readonly createClient: GigaChatClientFactory = (settings) => new GigaChat(settings)) {}

  private getClient(): GigaChatClient {
    if (this.client) return this.client;
    if (!this.config.credentials) throw new QcError('GIGACHAT_NOT_CONFIGURED', 'GigaChat credentials are not configured.', 503);
    try {
      this.client = this.createClient({
        credentials: this.config.credentials,
        scope: this.config.scope ?? 'GIGACHAT_API_B2B',
        baseUrl: `${httpsBaseUrl(this.config.baseUrl ?? 'https://api.giga.chat/v1')}/`,
        authUrl: httpsBaseUrl(this.config.authUrl ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'),
        model: this.config.model ?? 'GigaChat-3-Pro',
        timeout: (this.config.timeoutMs ?? 120000) / 1000,
        verbose: false,
        // Install the approved CA bundle or NODE_EXTRA_CA_CERTS. Never disable TLS verification.
        httpsAgent: new Agent({ rejectUnauthorized: true, ...(this.config.caBundlePath ? { ca: [...rootCertificates, readFileSync(this.config.caBundlePath)] } : {}) }),
      });
    } catch (error) {
      if (error instanceof QcError) throw error;
      throw new QcError('GIGACHAT_CONFIG_INVALID', 'GigaChat client or certificate configuration is invalid.', 503);
    }
    // One SDK client owns token acquisition and renewal. There is no application
    // access-token cache, scheduler or token database.
    return this.client;
  }

  async analyzeDialog(transcript: DialogTranscript, context?: DialogContext): Promise<AnalysisResult> {
    // Deliberately construct the outbound projection; sessionId and any future
    // database/storage fields on the domain object cannot cross this boundary.
    const dialog = { language: transcript.language, segments: transcript.segments.map(({ speaker, text }, segmentIndex) => ({ segmentIndex, speaker, text })) };
    const maxChars = this.config.maxTranscriptChars ?? 100000;
    const mainContent = JSON.stringify(dialog);
    const neighborBudget = Math.min(6000, Math.max(0, Math.floor((maxChars - mainContent.length - 200) / 2)));
    const projectNeighbor = (neighbor: DialogNeighbor | null, tail: boolean) => {
      if (!neighbor || neighborBudget < 200) return null;
      const segments = [];
      const source = tail ? [...neighbor.segments].reverse() : neighbor.segments;
      let used = 100;
      for (const segment of source.slice(0, 30)) {
        const entry = { speaker: segment.speaker, text: segment.text };
        const size = JSON.stringify(entry).length + 1;
        if (used + size > neighborBudget) break;
        segments.push(entry); used += size;
      }
      if (!segments.length) return null;
      if (tail) segments.reverse();
      return { language: neighbor.language, gapSeconds: neighbor.gapSeconds, segments };
    };
    const projectedContext = context && maxChars - mainContent.length >= 60
      ? { previous: projectNeighbor(context.previous, true), next: projectNeighbor(context.next, false) } : undefined;
    const content = JSON.stringify({ ...dialog, ...(projectedContext ? { context: projectedContext } : {}) });
    if (!transcript.segments.some((segment) => segment.text.trim())) throw new QcError('ANALYSIS_EMPTY_TRANSCRIPT', 'An empty transcript cannot be analyzed.', 422);
    if (content.length > maxChars) throw new QcError('ANALYSIS_INPUT_TOO_LARGE', 'The transcript exceeds the configured model input limit.', 422);
    const started = Date.now();
    try {
      const response = await this.getClient().chat({
        model: this.config.model ?? 'GigaChat-3-Pro',
        messages: [{ role: 'system', content: DIALOG_ANALYSIS_PROMPT }, { role: 'user', content }],
        temperature: 0.1,
        max_tokens: this.config.maxTokens ?? 4096,
        // Official v1 contract uses schema directly, not OpenAI's json_schema envelope.
        // https://developers.sber.ru/docs/ru/gigachat/guides/structured-output
        response_format: { type: 'json_schema', schema: dialogAnalysisJsonSchema, strict: true },
      });
      const parsed = gigachatResponseSchema.safeParse(response);
      if (!parsed.success) throw new QcError('GIGACHAT_RESPONSE_INVALID', 'GigaChat returned an invalid response.', 502, true);
      const choice = parsed.data.choices[0];
      if (choice.finish_reason !== 'stop') throw new QcError('GIGACHAT_RESPONSE_INCOMPLETE', 'GigaChat did not finish a complete structured analysis.', 502, true);
      let data: unknown;
      try { data = JSON.parse(choice.message.content); }
      catch { throw new QcError('GIGACHAT_JSON_INVALID', 'GigaChat returned invalid structured JSON.', 502, true); }
      const analysis = validateAnalysis(data, transcript, projectedContext ?? { previous: null, next: null });
      const usage = parsed.data.usage;
      return {
        analysis,
        metadata: { provider: 'gigachat', model: parsed.data.model ?? this.config.model ?? 'GigaChat-3-Pro', latencyMs: Date.now() - started,
          inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens, totalTokens: usage?.total_tokens },
        promptVersion: PROMPT_VERSION, scorecardVersion: SCORECARD_VERSION, schemaVersion: ANALYSIS_SCHEMA_VERSION,
      };
    } catch (error) { throw safeProviderError(error, 'GIGACHAT'); }
  }
}
