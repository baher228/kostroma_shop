import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { personalDb } from '../db/personalDb';
import type { Database } from '../db/dbFactory';
import type { SessionUser } from '../domain/types';
import { classifyQuality, validateAnalysis } from '../quality-control/analysis';
import { qcConfig } from '../quality-control/config';
import { retentionForAnalysis } from '../quality-control/retention';
import { AnalysisResult, CreateSessionInput, DialogContext, DialogTranscript, ProviderMetadata, QcError, QcFilters, QcJob, QcMedia, QcSession, SttResult } from '../quality-control/types';

type Row = Record<string, any>;
type Queryable = Pick<Database, 'query'>;
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
const iso = (value: string | Date) => new Date(value).toISOString();
const mapSession = (r: Row): QcSession => ({
  id: r.id, shopId: r.shop_id, sellerId: r.seller_id, shiftId: r.shift_id, createdBy: r.created_by,
  externalSessionId: r.external_session_id, startedAt: iso(r.started_at), endedAt: r.ended_at ? iso(r.ended_at) : null,
  status: r.status, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});
const mapJob = (r: Row): QcJob => ({ id: r.id, sessionId: r.session_id, stage: r.stage, status: r.status,
  attempt: r.attempt, leaseToken: r.lease_token, transcriptId: r.transcript_id,
  errorCode: r.error_code, errorMessage: r.error_message, createdAt: iso(r.created_at) });
const mapMedia = (r: Row): QcMedia => ({ id: r.id, sessionId: r.session_id, type: r.type, storageKey: r.storage_key,
  storageBucket: r.storage_bucket, originalFilename: r.original_filename, mimeType: r.mime_type,
  size: Number(r.size), duration: r.duration, sha256: r.sha256,
  retentionClass: r.retention_class, retentionReason: r.retention_reason,
  expiresAt: r.expires_at ? iso(r.expires_at) : null, pinnedAt: r.pinned_at ? iso(r.pinned_at) : null,
  pinnedBy: r.pinned_by, deletedAt: r.deleted_at ? iso(r.deleted_at) : null });
const technicalMetadata = (m: ProviderMetadata) => ({ provider: m.provider, model: m.model,
  latencyMs: m.latencyMs, inputTokens: m.inputTokens, outputTokens: m.outputTokens, totalTokens: m.totalTokens });

// Managers are global in existing RU RBAC. Tablets only upload and inspect
// processing metadata for their assigned shop; workers only access their own QC.
export const assertQcScope = (user: SessionUser, session: Pick<QcSession, 'shopId' | 'sellerId'>, sensitive = false) => {
  if (user.role === 'manager') return;
  if (user.role === 'worker' && session.sellerId === user.id) return;
  if (!sensitive && user.role === 'store_tablet' && user.shopId && user.shopId === session.shopId) return;
  throw new QcError('FORBIDDEN', 'Not enough permissions for Quality Control.', 403);
};

const latestJoin = `LEFT JOIN LATERAL (SELECT * FROM qc_analysis_results ar
  WHERE ar.session_id=s.id ORDER BY ar.version DESC LIMIT 1) a ON TRUE`;

export class QualityControlRepository {
  constructor(private readonly db: Database = personalDb) {}

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.db.withClient(async client => {
      await client.query('BEGIN');
      try { const result = await fn(client); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }

  private async session(user: SessionUser, sessionId: string, db: Queryable, lock = false, sensitive = false): Promise<QcSession> {
    const result = await db.query(`SELECT * FROM qc_sessions WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [sessionId]);
    if (!result.rows[0]) throw new QcError('SESSION_NOT_FOUND', 'QC session not found.', 404);
    const session = mapSession(result.rows[0]);
    assertQcScope(user, session, sensitive);
    return session;
  }

  async createSession(user: SessionUser, input: CreateSessionInput): Promise<QcSession> {
    const sellerId = input.sellerId ?? null;
    assertQcScope(user, { shopId: input.shopId, sellerId });
    if (user.role === 'worker' && user.shopId !== input.shopId) throw new QcError('INVALID_SHOP', 'Worker is not assigned to this shop.');
    return this.transaction(async client => {
      if (input.externalSessionId) {
        // Serialize a client recording's creation before checking relations; retries
        // may arrive after its shift closes. No duplicate is published on timeout.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`qc:${user.id}:${input.externalSessionId}`]);
        const existing = await client.query('SELECT * FROM qc_sessions WHERE created_by=$1 AND external_session_id=$2', [user.id, input.externalSessionId]);
        if (existing.rows[0]) {
          const old = mapSession(existing.rows[0]);
          assertQcScope(user, old);
          if (old.shopId !== input.shopId || old.sellerId !== sellerId || old.shiftId !== (input.shiftId ?? null) ||
            old.startedAt !== iso(input.startedAt) || old.endedAt !== (input.endedAt ? iso(input.endedAt) : null)) {
            throw new QcError('IDEMPOTENCY_CONFLICT', 'Recording key was already used for different session metadata.', 409);
          }
          return old;
        }
      }
      const shop = await client.query(`SELECT 1 FROM users WHERE shop_id=$1
        UNION ALL SELECT 1 FROM worker_checkin_events WHERE shop_id=$1 LIMIT 1`, [input.shopId]);
      if (!shop.rows.length) throw new QcError('INVALID_SHOP', 'Shop has no existing RU assignment or check-in.');
      if (sellerId) {
        const seller = await client.query('SELECT * FROM users WHERE id=$1 AND role=\'worker\'', [sellerId]);
        if (!seller.rows[0]) throw new QcError('INVALID_SELLER', 'Seller must be an existing employee.');
        if (!input.shiftId && seller.rows[0].shop_id !== input.shopId) throw new QcError('INVALID_SELLER_SHOP', 'Seller is not assigned to this shop.');
      }
      if (input.shiftId) {
        const shift = await client.query(`SELECT e.id FROM worker_checkin_events e
          WHERE e.id=$1 AND e.worker_id=$2 AND e.shop_id=$3 AND e.status='in' AND e.event_at <= $4::timestamptz
          AND NOT EXISTS (SELECT 1 FROM worker_checkin_events n WHERE n.worker_id=e.worker_id
            AND n.event_at>e.event_at AND n.event_at < COALESCE($5::timestamptz,$4::timestamptz))`,
        [input.shiftId, sellerId, input.shopId, input.startedAt, input.endedAt ?? null]);
        if (!shift.rows.length) throw new QcError('INVALID_SHIFT', 'Shift must be the matching employee check-in covering the recording.');
      }
      const result = await client.query(`INSERT INTO qc_sessions
        (id,shop_id,seller_id,shift_id,created_by,external_session_id,started_at,ended_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id('qc'), input.shopId, sellerId, input.shiftId ?? null, user.id, input.externalSessionId ?? null, input.startedAt, input.endedAt ?? null]);
      return mapSession(result.rows[0]);
    });
  }

  getSession(user: SessionUser, sessionId: string) { return this.session(user, sessionId, this.db); }

  private filters(user: SessionUser, filter: QcFilters, sensitive = false) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    const add = (sql: string, value: unknown) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)); };
    if (user.role === 'worker') add('s.seller_id=?', user.id);
    else if (user.role === 'store_tablet' && user.shopId && !sensitive) add('s.shop_id=?', user.shopId);
    else if (user.role !== 'manager') throw new QcError('FORBIDDEN', 'Not enough permissions for Quality Control.', 403);
    if (filter.from) add('s.started_at>=?::timestamptz', filter.from);
    if (filter.to) add('s.started_at<?::timestamptz', filter.to);
    if (filter.shopId) add('s.shop_id=?', filter.shopId);
    if (filter.sellerId) add('s.seller_id=?', filter.sellerId);
    if (filter.shiftId) add('s.shift_id=?', filter.shiftId);
    if (filter.qualityClass) add('a.quality_class=?', filter.qualityClass);
    return { params, where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '' };
  }

  async listSessions(user: SessionUser, filter: QcFilters = {}) {
    const { params, where } = this.filters(user, filter);
    const result = await this.db.query(`SELECT s.* FROM qc_sessions s ${latestJoin} ${where}
      ORDER BY s.started_at DESC,s.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit ?? 50, filter.offset ?? 0]);
    return result.rows.map(mapSession);
  }

  private async insertJob(client: Queryable, sessionId: string, stage: QcJob['stage'], transcriptId: string | null, key: string): Promise<QcJob> {
    const result = await client.query(`INSERT INTO qc_processing_jobs(id,session_id,stage,transcript_id,idempotency_key)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [id('qcjob'), sessionId, stage, transcriptId, key]);
    await client.query('UPDATE qc_sessions SET status=$2,updated_at=NOW() WHERE id=$1', [sessionId, stage === 'transcription' ? 'queued' : 'analysis_queued']);
    return mapJob(result.rows[0]);
  }

  async attachAudio(user: SessionUser, sessionId: string, media: QcMedia) {
    return this.transaction(async client => {
      await this.session(user, sessionId, client, true);
      if (media.sessionId !== sessionId || media.type !== 'audio') throw new QcError('INVALID_MEDIA', 'Invalid media association.');
      const existing = await client.query("SELECT * FROM qc_media WHERE session_id=$1 AND type='audio'", [sessionId]);
      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== media.sha256) throw new QcError('AUDIO_EXISTS', 'Session audio is immutable; create another session.', 409);
        const jobs = await client.query('SELECT * FROM qc_processing_jobs WHERE session_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1', [sessionId]);
        return { media: mapMedia(existing.rows[0]), job: mapJob(jobs.rows[0]) };
      }
      await client.query(`INSERT INTO qc_media(id,session_id,type,storage_key,storage_bucket,original_filename,mime_type,size,duration,sha256,
        retention_class,retention_reason,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [media.id, sessionId, 'audio', media.storageKey, media.storageBucket,
        media.originalFilename, media.mimeType, media.size, media.duration, media.sha256, media.retentionClass, media.retentionReason, media.expiresAt]);
      const job = await this.insertJob(client, sessionId, 'transcription', null, 'transcription');
      return { media, job };
    });
  }

  async enqueue(user: SessionUser, sessionId: string, reanalyze = false, idempotencyKey?: string): Promise<QcJob> {
    if (reanalyze && user.role !== 'manager') throw new QcError('FORBIDDEN', 'Only managers can request a new analysis.', 403);
    if (reanalyze && !idempotencyKey) throw new QcError('IDEMPOTENCY_KEY_REQUIRED', 'Re-analysis requires an Idempotency-Key.');
    return this.transaction(async client => {
      await this.session(user, sessionId, client, true);
      const audio = await client.query("SELECT id FROM qc_media WHERE session_id=$1 AND type='audio'", [sessionId]);
      if (!audio.rows.length) throw new QcError('AUDIO_REQUIRED', 'Upload audio before processing.', 409);
      if (reanalyze) {
        const prior = await client.query('SELECT * FROM qc_processing_jobs WHERE session_id=$1 AND idempotency_key=$2', [sessionId, `reanalyze:${idempotencyKey}`]);
        if (prior.rows[0]) return mapJob(prior.rows[0]);
      }
      const active = await client.query("SELECT * FROM qc_processing_jobs WHERE session_id=$1 AND status IN ('queued','running')", [sessionId]);
      if (active.rows[0]) return mapJob(active.rows[0]);
      const transcripts = await client.query('SELECT id FROM qc_transcripts WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1', [sessionId]);
      if (reanalyze) {
        if (!transcripts.rows[0]) throw new QcError('TRANSCRIPT_REQUIRED', 'Transcript is not ready.', 409);
        return this.insertJob(client, sessionId, 'analysis', transcripts.rows[0].id, `reanalyze:${idempotencyKey}`);
      }
      const latest = await client.query('SELECT * FROM qc_processing_jobs WHERE session_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1', [sessionId]);
      if (latest.rows[0]?.status === 'failed') {
        const job = latest.rows[0];
        await client.query("UPDATE qc_processing_jobs SET status='queued',attempt=0,available_at=NOW(),lease_token=NULL,lease_expires_at=NULL,completed_at=NULL,updated_at=NOW() WHERE id=$1", [job.id]);
        await client.query('UPDATE qc_sessions SET status=$2,updated_at=NOW() WHERE id=$1', [sessionId, job.stage === 'analysis' ? 'analysis_queued' : 'queued']);
        return mapJob({ ...job, status: 'queued', attempt: 0, lease_token: null });
      }
      if (latest.rows[0]) return mapJob(latest.rows[0]);
      return this.insertJob(client, sessionId, 'transcription', null, 'transcription');
    });
  }

  async getStatus(user: SessionUser, sessionId: string) {
    const session = await this.getSession(user, sessionId);
    const result = await this.db.query('SELECT * FROM qc_processing_jobs WHERE session_id=$1 ORDER BY created_at DESC,id DESC', [sessionId]);
    // Fencing tokens are worker internals and must not be exposed to API callers.
    const jobs = result.rows.map((r: Row) => ({ ...mapJob(r), leaseToken: null }));
    return { sessionId, status: session.status, jobs, latestJob: jobs[0] ?? null };
  }

  async readTranscript(transcriptId: string, db: Queryable = this.db): Promise<DialogTranscript> {
    const result = await db.query('SELECT * FROM qc_transcripts WHERE id=$1', [transcriptId]);
    if (!result.rows[0]) throw new QcError('TRANSCRIPT_REQUIRED', 'Transcript not found.', 404);
    const r = result.rows[0];
    const segments = await db.query('SELECT * FROM qc_transcript_segments WHERE transcript_id=$1 ORDER BY position', [transcriptId]);
    return { sessionId: r.session_id, language: r.language, duration: r.duration,
      segments: segments.rows.map((s: Row) => ({ start: s.start_time, end: s.end_time, speaker: s.speaker, text: s.text,
        ...(s.confidence === null ? {} : { confidence: s.confidence }) })) };
  }

  async getTranscript(user: SessionUser, sessionId: string) {
    await this.session(user, sessionId, this.db, false, true);
    const result = await this.db.query('SELECT * FROM qc_transcripts WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1', [sessionId]);
    const r = result.rows[0];
    return r ? { id: r.id, transcript: await this.readTranscript(r.id), metadata: r.technical_metadata, createdAt: iso(r.created_at) } : null;
  }

  async readDialogContext(sessionId: string): Promise<{ context: DialogContext; waiting: boolean }> {
    const current = (await this.db.query(`SELECT s.*,r.device_id FROM qc_sessions s
      LEFT JOIN audio_qc_recordings r ON r.local_recording_id=s.external_session_id AND r.shop_id=s.shop_id
      WHERE s.id=$1`, [sessionId])).rows[0];
    if (!current) throw new QcError('SESSION_NOT_FOUND', 'QC session not found.', 404);
    const context: DialogContext = { previous: null, next: null };
    // The existing tablet recording registry supplies stable device identity.
    // An uploader account alone is insufficient when several tablets share it.
    if (!current.device_id) return { context, waiting: true };
    let waiting = false;
    for (const direction of ['previous', 'next'] as const) {
      const previous = direction === 'previous';
      // Select the immediate recording first. Never skip an untranscribed or
      // incompatible neighbor to borrow a more distant conversation instead.
      const result = await this.db.query(`SELECT s.*,r.device_id AS context_device_id,
        (SELECT t.id FROM qc_transcripts t WHERE t.session_id=s.id ORDER BY t.created_at DESC,t.id DESC LIMIT 1) AS transcript_id
        FROM qc_sessions s LEFT JOIN audio_qc_recordings r
          ON r.local_recording_id=s.external_session_id AND r.shop_id=s.shop_id
        WHERE s.shop_id=$1 AND s.created_by=$2
          AND (r.device_id=$5 OR r.device_id IS NULL)
          AND (s.started_at,s.id) ${previous ? '<' : '>'} ($3::timestamptz,$4::text)
        ORDER BY s.started_at ${previous ? 'DESC' : 'ASC'},s.id ${previous ? 'DESC' : 'ASC'} LIMIT 1`,
      [current.shop_id, current.created_by, current.started_at, current.id, current.device_id]);
      const neighbor = result.rows[0];
      if (!neighbor) { if (!previous) waiting = true; continue; }
      if (!neighbor.context_device_id) { waiting = true; continue; }
      if (neighbor.seller_id !== current.seller_id || neighbor.shift_id !== current.shift_id) continue;
      const end = previous ? neighbor.ended_at : current.ended_at;
      if (!end) continue;
      const gapSeconds = (new Date(previous ? current.started_at : neighbor.started_at).getTime() - new Date(end).getTime()) / 1000;
      // Permit the standard pre-roll overlap but never borrow distant audio.
      if (gapSeconds < -10 || gapSeconds > 120) continue;
      if (!neighbor.transcript_id) {
        if (!['transcription_failed','analysis_failed'].includes(neighbor.status)) waiting = true;
        continue;
      }
      const transcript = await this.readTranscript(neighbor.transcript_id);
      context[direction] = { language: transcript.language, gapSeconds, segments: transcript.segments };
    }
    return { context, waiting };
  }

  async deferAnalysisForContext(job: QcJob, delayMs: number): Promise<boolean> {
    return this.transaction(async client => {
      if (!await this.ownedJob(client, job)) return false;
      await client.query(`UPDATE qc_processing_jobs SET status='queued',attempt=GREATEST(0,attempt-1),
        available_at=NOW()+($2 * INTERVAL '1 millisecond'),lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
        WHERE id=$1`, [job.id, delayMs]);
      await client.query("UPDATE qc_sessions SET status='analysis_queued',updated_at=NOW() WHERE id=$1", [job.sessionId]);
      return true;
    });
  }

  async getAnalysis(user: SessionUser, sessionId: string, history = false) {
    await this.session(user, sessionId, this.db, false, true);
    const result = await this.db.query(`SELECT * FROM qc_analysis_results WHERE session_id=$1
      ORDER BY version DESC ${history ? '' : 'LIMIT 1'}`, [sessionId]);
    const mapped = result.rows.map((r: Row) => ({ id: r.id, sessionId: r.session_id, transcriptId: r.transcript_id,
      provider: r.provider, model: r.model, promptVersion: r.prompt_version, scorecardVersion: r.scorecard_version,
      schemaVersion: r.schema_version, overallScore: r.overall_score, qualityClass: r.quality_class,
      version: r.version,
      customerSentiment: r.customer_sentiment, customerSatisfaction: r.customer_satisfaction,
      structuredResult: r.structured_result, metadata: r.technical_metadata, analyzedAt: iso(r.analyzed_at) }));
    return history ? mapped : mapped[0] ?? null;
  }

  async getMedia(sessionId: string): Promise<QcMedia> {
    const result = await this.db.query("SELECT * FROM qc_media WHERE session_id=$1 AND type='audio'", [sessionId]);
    if (!result.rows[0]) throw new QcError('AUDIO_REQUIRED', 'Audio not found.', 409);
    return mapMedia(result.rows[0]);
  }

  async claimJob(maxAttempts: number, leaseMs: number): Promise<QcJob | null> {
    return this.transaction(async client => {
      const exhausted = await client.query(`UPDATE qc_processing_jobs SET status='failed',error_code='PROCESSING_LEASE_EXPIRED',
        error_message='Processing lease expired after the last attempt.',lease_token=NULL,lease_expires_at=NULL,completed_at=NOW(),updated_at=NOW()
        WHERE status='running' AND lease_expires_at<NOW() AND attempt >= $1 RETURNING session_id,stage`, [maxAttempts]);
      for (const r of exhausted.rows) {
        await client.query('UPDATE qc_sessions SET status=$2,updated_at=NOW() WHERE id=$1', [r.session_id, `${r.stage}_failed`]);
        await client.query(`UPDATE qc_media SET retention_class='bad',retention_reason='Failed processing retained for diagnosis.',
          expires_at=NOW()+($2 * INTERVAL '1 millisecond')
          WHERE session_id=$1 AND type='audio' AND pinned_at IS NULL AND deleted_at IS NULL`,
        [r.session_id, qcConfig.retentionBadHours * 60 * 60 * 1000]);
      }
      const result = await client.query(`SELECT * FROM qc_processing_jobs
        WHERE (status='queued' AND available_at<=NOW()) OR (status='running' AND lease_expires_at<NOW() AND attempt<$1)
        ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`, [maxAttempts]);
      if (!result.rows[0]) return null;
      const r = result.rows[0];
      const token = randomUUID();
      const updated = await client.query(`UPDATE qc_processing_jobs SET status='running',attempt=attempt+1,
        lease_token=$2,lease_expires_at=NOW()+($3 * INTERVAL '1 millisecond'),started_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`, [r.id, token, leaseMs]);
      await client.query('UPDATE qc_sessions SET status=$2,updated_at=NOW() WHERE id=$1', [r.session_id, r.stage === 'transcription' ? 'transcribing' : 'analyzing']);
      return mapJob(updated.rows[0]);
    });
  }

  private async ownedJob(client: Queryable, job: QcJob): Promise<boolean> {
    const result = await client.query(`SELECT id FROM qc_processing_jobs
      WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>NOW() FOR UPDATE`, [job.id, job.leaseToken]);
    return result.rows.length > 0;
  }

  async completeTranscription(job: QcJob, media: QcMedia, result: SttResult): Promise<boolean> {
    return this.transaction(async client => {
      if (!await this.ownedJob(client, job)) return false;
      if (job.stage !== 'transcription' || media.sessionId !== job.sessionId || result.transcript.sessionId !== job.sessionId) {
        throw new QcError('TRANSCRIPT_INVALID', 'Invalid transcript association.');
      }
      const transcriptId = id('qct');
      await client.query(`INSERT INTO qc_transcripts(id,session_id,media_id,provider,provider_model,language,duration,raw_result,technical_metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8::jsonb)`, [transcriptId, job.sessionId, media.id, result.metadata.provider, result.metadata.model,
        result.transcript.language, result.transcript.duration, JSON.stringify(technicalMetadata(result.metadata))]);
      for (const [position, segment] of result.transcript.segments.entries()) {
        await client.query(`INSERT INTO qc_transcript_segments(id,transcript_id,position,start_time,end_time,speaker,text,confidence)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id('qcs'), transcriptId, position, segment.start, segment.end, segment.speaker, segment.text, segment.confidence ?? null]);
      }
      await client.query("UPDATE qc_processing_jobs SET status='completed',lease_token=NULL,lease_expires_at=NULL,error_code=NULL,error_message=NULL,completed_at=NOW(),updated_at=NOW() WHERE id=$1", [job.id]);
      await this.insertJob(client, job.sessionId, 'analysis', transcriptId, `analysis:${transcriptId}`);
      return true;
    });
  }

  async completeAnalysis(job: QcJob, result: AnalysisResult): Promise<boolean> {
    return this.transaction(async client => {
      if (!await this.ownedJob(client, job)) return false;
      if (job.stage !== 'analysis' || !job.transcriptId) throw new QcError('PROCESSING_INTERNAL_ERROR', 'Invalid analysis job.', 500);
      const transcript = await this.readTranscript(job.transcriptId, client);
      const analysis = validateAnalysis(result.analysis, transcript);
      if (!result.promptVersion.trim() || !result.scorecardVersion.trim() || result.schemaVersion !== analysis.schemaVersion) {
        throw new QcError('ANALYSIS_VERSION_INVALID', 'Analysis version metadata is invalid.', 502, true);
      }
      const analysisId = id('qca');
      const nextVersion = await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM qc_analysis_results WHERE session_id=$1', [job.sessionId]);
      const qualityClass = classifyQuality(analysis.quality.overallScore, { good: qcConfig.qualityGoodThreshold, neutral: qcConfig.qualityNeutralThreshold });
      const retention = retentionForAnalysis(analysis, qualityClass, {
        standardMs: qcConfig.retentionStandardHours * 60 * 60 * 1000,
        badMs: qcConfig.retentionBadHours * 60 * 60 * 1000,
        interestingMs: qcConfig.retentionInterestingHours * 60 * 60 * 1000,
      });
      await client.query(`INSERT INTO qc_analysis_results(id,session_id,transcript_id,job_id,provider,model,prompt_version,scorecard_version,schema_version,
        version,overall_score,quality_class,customer_sentiment,customer_satisfaction,has_conflict,has_complaint,has_objection,violations_count,
        critical_violations_count,structured_result,technical_metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb)`,
      [analysisId, job.sessionId, job.transcriptId, job.id, result.metadata.provider, result.metadata.model, result.promptVersion,
        result.scorecardVersion, result.schemaVersion, Number(nextVersion.rows[0].version), analysis.quality.overallScore, qualityClass, analysis.customer.sentiment,
        analysis.customer.satisfaction, analysis.dialog.hasConflict, analysis.dialog.hasComplaint, analysis.dialog.hasObjection,
        analysis.violations.length, analysis.violations.filter(v => v.severity === 'critical').length,
        JSON.stringify(analysis), JSON.stringify(technicalMetadata(result.metadata))]);
      for (const [key, criterion] of Object.entries(analysis.quality.criteria)) {
        await client.query(`INSERT INTO qc_criterion_scores(id,analysis_id,criterion_key,score,max_score,status,comment)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [id('qcc'), analysisId, key, criterion.score, criterion.maxScore, criterion.status, criterion.comment]);
      }
      await client.query("UPDATE qc_processing_jobs SET status='completed',lease_token=NULL,lease_expires_at=NULL,error_code=NULL,error_message=NULL,completed_at=NOW(),updated_at=NOW() WHERE id=$1", [job.id]);
      await client.query("UPDATE qc_sessions SET status='completed',updated_at=NOW() WHERE id=$1", [job.sessionId]);
      await client.query(`UPDATE qc_media SET retention_class=$2,retention_reason=$3,
        expires_at=NOW()+($4 * INTERVAL '1 millisecond')
        WHERE session_id=$1 AND type='audio' AND pinned_at IS NULL AND deleted_at IS NULL`,
      [job.sessionId, retention.retentionClass, retention.retentionReason, retention.retentionMs]);
      return true;
    });
  }

  async failJob(job: QcJob, error: QcError, maxAttempts: number, retryBaseMs: number): Promise<boolean> {
    return this.transaction(async client => {
      if (!await this.ownedJob(client, job)) return false;
      const retry = error.retryable && job.attempt < maxAttempts;
      const backoff = Math.min(retryBaseMs * 2 ** (job.attempt - 1), 300_000);
      await client.query(`UPDATE qc_processing_jobs SET status=$2,error_code=$3,error_message=$4,
        available_at=NOW()+($5 * INTERVAL '1 millisecond'),lease_token=NULL,lease_expires_at=NULL,
        completed_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1`,
      [job.id, retry ? 'queued' : 'failed', error.code, error.message, backoff]);
      await client.query('UPDATE qc_sessions SET status=$2,updated_at=NOW() WHERE id=$1',
        [job.sessionId, retry ? (job.stage === 'transcription' ? 'queued' : 'analysis_queued') : `${job.stage}_failed`]);
      if (!retry) {
        await client.query(`UPDATE qc_media SET retention_class='bad',retention_reason='Failed processing retained for diagnosis.',
          expires_at=NOW()+($2 * INTERVAL '1 millisecond')
          WHERE session_id=$1 AND type='audio' AND pinned_at IS NULL AND deleted_at IS NULL`,
        [job.sessionId, qcConfig.retentionBadHours * 60 * 60 * 1000]);
      }
      return true;
    });
  }

  async getAudioInfo(user: SessionUser, sessionId: string): Promise<QcMedia> {
    await this.session(user, sessionId, this.db, false, true);
    const result = await this.db.query("SELECT * FROM qc_media WHERE session_id=$1 AND type='audio'", [sessionId]);
    if (!result.rows[0]) throw new QcError('AUDIO_REQUIRED', 'Audio not found.', 404);
    return mapMedia(result.rows[0]);
  }

  async setAudioPinned(user: SessionUser, sessionId: string, pinned: boolean): Promise<QcMedia> {
    if (user.role !== 'manager') throw new QcError('FORBIDDEN', 'Only managers can change audio retention.', 403);
    const session = await this.session(user, sessionId, this.db, false, true);
    let retentionClass = 'standard';
    let retentionReason = 'Routine dialog restored to the standard retention policy.';
    let retentionMs = qcConfig.retentionStandardHours * 60 * 60 * 1000;
    if (!pinned) {
      const latest = await this.db.query(`SELECT quality_class,structured_result
        FROM qc_analysis_results WHERE session_id=$1 ORDER BY version DESC LIMIT 1`, [sessionId]);
      const analysis = latest.rows[0];
      if (session.status === 'transcription_failed' || session.status === 'analysis_failed') {
        retentionClass = 'bad'; retentionReason = 'Failed processing retained for diagnosis.';
        retentionMs = qcConfig.retentionBadHours * 60 * 60 * 1000;
      } else if (analysis) {
        const policy = retentionForAnalysis(analysis.structured_result, analysis.quality_class, {
          standardMs: qcConfig.retentionStandardHours * 60 * 60 * 1000,
          badMs: qcConfig.retentionBadHours * 60 * 60 * 1000,
          interestingMs: qcConfig.retentionInterestingHours * 60 * 60 * 1000,
        });
        retentionClass = policy.retentionClass; retentionReason = policy.retentionReason;
        retentionMs = policy.retentionMs;
      }
    }
    const result = await this.db.query(`UPDATE qc_media SET
      retention_class=CASE WHEN $3 THEN 'pinned' ELSE $4 END,
      retention_reason=CASE WHEN $3 THEN 'Pinned by a manager.' ELSE $5 END,
      pinned_at=CASE WHEN $3 THEN NOW() ELSE NULL END,
      pinned_by=CASE WHEN $3 THEN $2 ELSE NULL END,
      expires_at=CASE WHEN $3 THEN NULL ELSE NOW()+($6 * INTERVAL '1 millisecond') END
      WHERE session_id=$1 AND type='audio' AND deleted_at IS NULL AND delete_claim_token IS NULL RETURNING *`,
    [sessionId, user.id, pinned, retentionClass, retentionReason, retentionMs]);
    if (!result.rows[0]) throw new QcError('AUDIO_EXPIRED', 'Audio has already been removed by the retention policy.', 410);
    return mapMedia(result.rows[0]);
  }

  async claimExpiredMedia(limit: number): Promise<{ media: QcMedia; claimToken: string }[]> {
    const claimToken = randomUUID();
    const result = await this.db.query(`WITH candidates AS (
        SELECT m.id FROM qc_media m
        WHERE m.deleted_at IS NULL AND m.pinned_at IS NULL AND m.expires_at<=NOW()
          AND (m.delete_claim_token IS NULL OR m.delete_claimed_at<NOW()-INTERVAL '15 minutes')
          AND NOT EXISTS (SELECT 1 FROM qc_processing_jobs j WHERE j.session_id=m.session_id AND j.status IN ('queued','running'))
        ORDER BY m.expires_at,m.id FOR UPDATE SKIP LOCKED LIMIT $1
      )
      UPDATE qc_media m SET delete_claim_token=$2,delete_claimed_at=NOW()
      FROM candidates c WHERE m.id=c.id RETURNING m.*`, [limit, claimToken]);
    return result.rows.map((row: Row) => ({ media: mapMedia(row), claimToken }));
  }

  async markMediaDeleted(mediaId: string, claimToken: string): Promise<void> {
    await this.db.query(`UPDATE qc_media SET deleted_at=NOW(),retention_reason=retention_reason || ' Audio object deleted.'
      ,delete_claim_token=NULL,delete_claimed_at=NULL
      WHERE id=$1 AND delete_claim_token=$2 AND deleted_at IS NULL AND pinned_at IS NULL AND expires_at<=NOW()`, [mediaId, claimToken]);
  }

  async releaseMediaDeleteClaim(mediaId: string, claimToken: string): Promise<void> {
    await this.db.query(`UPDATE qc_media SET delete_claim_token=NULL,delete_claimed_at=NULL
      WHERE id=$1 AND delete_claim_token=$2 AND deleted_at IS NULL`, [mediaId, claimToken]);
  }

  async analytics(user: SessionUser, kind: 'overview' | 'trends' | 'criteria' | 'sellers' | 'shops', filter: QcFilters = {}) {
    const { params, where } = this.filters(user, filter, true);
    const base = `FROM qc_sessions s ${latestJoin} ${where}`;
    const metrics = `COUNT(*)::int AS "totalDialogs",COUNT(a.id)::int AS "processedDialogs",AVG(a.overall_score) AS "averageScore",
      COUNT(*) FILTER(WHERE a.quality_class='good')::int AS good,COUNT(*) FILTER(WHERE a.quality_class='neutral')::int AS neutral,
      COUNT(*) FILTER(WHERE a.quality_class='bad')::int AS bad,
      COUNT(*) FILTER(WHERE a.has_conflict)::int AS conflicts,COUNT(*) FILTER(WHERE a.has_complaint)::int AS complaints,
      COALESCE(SUM(a.violations_count),0)::int AS violations,COALESCE(SUM(a.critical_violations_count),0)::int AS "criticalViolations"`;
    if (kind === 'overview') {
      const result = await this.db.query(`SELECT ${metrics} ${base}`, params);
      const r = result.rows[0];
      return { ...r, goodPercentage: r.processedDialogs ? r.good * 100 / r.processedDialogs : 0,
        neutralPercentage: r.processedDialogs ? r.neutral * 100 / r.processedDialogs : 0,
        badPercentage: r.processedDialogs ? r.bad * 100 / r.processedDialogs : 0 };
    }
    if (kind === 'criteria') {
      const result = await this.db.query(`SELECT c.criterion_key AS "criterionKey",AVG(c.score) FILTER(WHERE c.status<>'not_applicable') AS "averageScore",
        MAX(c.max_score) AS "maxScore",COUNT(*) FILTER(WHERE c.status<>'not_applicable')::int AS "evaluatedCount"
        FROM qc_sessions s ${latestJoin} JOIN qc_criterion_scores c ON c.analysis_id=a.id ${where} GROUP BY c.criterion_key ORDER BY c.criterion_key`, params);
      return result.rows;
    }
    if (kind === 'trends') {
      const interval = filter.interval ?? 'day';
      if (!['day','week','month'].includes(interval)) throw new QcError('INVALID_INTERVAL', 'Unsupported analytics interval.');
      const result = await this.db.query(`SELECT to_char(date_trunc($${params.length + 1},s.started_at AT TIME ZONE 'Europe/Moscow'),'YYYY-MM-DD') AS date,
        ${metrics} ${base} GROUP BY 1 ORDER BY 1`, [...params, interval]);
      return result.rows;
    }
    const group = kind === 'sellers' ? 'seller_id' : 'shop_id';
    const result = await this.db.query(`SELECT s.${group} AS id,${metrics} ${base} GROUP BY s.${group} ORDER BY s.${group}`, params);
    return result.rows;
  }
}
