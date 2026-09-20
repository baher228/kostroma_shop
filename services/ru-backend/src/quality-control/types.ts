import type { DialogAnalysis } from './analysis';

export type QualityClass = 'good' | 'neutral' | 'bad';
export type QcRetentionClass = 'standard' | 'bad' | 'interesting' | 'pinned';
export type SessionStatus = 'created' | 'queued' | 'transcribing' | 'analysis_queued' | 'analyzing' | 'completed' | 'transcription_failed' | 'analysis_failed';
export type QcSession = {
  id: string; shopId: string; sellerId: string | null; shiftId: string | null;
  createdBy: string; externalSessionId: string | null; startedAt: string; endedAt: string | null;
  status: SessionStatus; createdAt: string; updatedAt: string;
};
export type CreateSessionInput = {
  shopId: string; sellerId?: string | null; shiftId?: string | null;
  externalSessionId?: string | null; startedAt: string; endedAt?: string | null;
};
export type QcMedia = {
  id: string; sessionId: string; type: 'audio' | 'video'; storageKey: string; storageBucket: string;
  originalFilename: string; mimeType: string; size: number; duration: number | null; sha256: string;
  retentionClass: QcRetentionClass; retentionReason: string; expiresAt: string | null;
  pinnedAt: string | null; pinnedBy: string | null; deletedAt: string | null;
};
export type TranscriptSegment = {
  start: number | null; end: number | null; speaker: string; text: string; confidence?: number;
};
export type DialogTranscript = {
  sessionId: string; language: string | null; duration: number | null; segments: TranscriptSegment[];
};
export type ProviderMetadata = {
  provider: string; model: string | null; latencyMs?: number;
  inputTokens?: number; outputTokens?: number; totalTokens?: number;
};
export type SttResult = { transcript: DialogTranscript; metadata: ProviderMetadata; rawResult?: unknown };
export interface SttProvider {
  transcribe(input: { sessionId: string; audio: Buffer; mimeType: string; filename: string; duration: number | null }): Promise<SttResult>;
}
export type AnalysisResult = {
  analysis: DialogAnalysis; metadata: ProviderMetadata;
  promptVersion: string; scorecardVersion: string; schemaVersion: string;
};
export interface LlmAnalysisProvider { analyzeDialog(transcript: DialogTranscript): Promise<AnalysisResult> }
export interface QcStorage {
  put(key: string, audio: Buffer, mimeType: string): Promise<void>;
  get(key: string, bucket?: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  bucket: string;
}
export type QcJob = {
  id: string; sessionId: string; stage: 'transcription' | 'analysis'; status: 'queued' | 'running' | 'completed' | 'failed';
  attempt: number; leaseToken: string | null; transcriptId: string | null;
  errorCode: string | null; errorMessage: string | null; createdAt: string;
};
export type QcFilters = {
  from?: string; to?: string; shopId?: string; sellerId?: string; shiftId?: string;
  qualityClass?: QualityClass; interval?: 'day' | 'week' | 'month'; limit?: number; offset?: number;
};
export class QcError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) { super(message); }
}
