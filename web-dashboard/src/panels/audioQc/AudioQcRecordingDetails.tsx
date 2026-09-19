import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../api';
import type { AudioQcRecording, QcAnalysis, QcSession, QcStatus, QcTranscript, Session } from '../../types';
import { messageOf } from '../../shared/format';
import {
  criterionLabels,
  criterionStatusLabels,
  displaySpeaker,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatTimestamp,
  qcStatusLabels,
  qualityLabels,
  satisfactionLabels,
  sentimentLabels,
  severityLabels,
} from './qualityControlFormat';

const terminal = new Set(['completed', 'transcription_failed', 'analysis_failed']);

const unavailableMessage = (error: unknown, kind: 'transcript' | 'analysis' | 'session') => {
  if (error instanceof ApiError) {
    if (error.code === 'TRANSCRIPT_NOT_READY') return 'Расшифровка ещё готовится.';
    if (error.code === 'ANALYSIS_NOT_READY') return 'AI-анализ ещё готовится.';
    if (error.code === 'SESSION_NOT_FOUND' || error.status === 404 && kind === 'session') return 'Связанная AI-сессия не найдена.';
  }
  return messageOf(error);
};

export const AudioQcRecordingDetails = ({ recording, session, shopName, onClose, onDataChanged }: {
  recording: AudioQcRecording;
  session: Session;
  shopName: string;
  onClose: () => void;
  onDataChanged: () => void;
}) => {
  const sessionId = recording.qc?.sessionId ?? recording.mlSessionId;
  const [qcSession, setQcSession] = useState<QcSession | null>(null);
  const [status, setStatus] = useState<QcStatus | null>(null);
  const [transcript, setTranscript] = useState<QcTranscript | null>(null);
  const [analysis, setAnalysis] = useState<QcAnalysis | null>(null);
  const [errors, setErrors] = useState({ session: '', status: '', transcript: '', analysis: '' });
  const [loading, setLoading] = useState(Boolean(sessionId));
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inFlightRef = useRef(false);
  const analysisIdRef = useRef<string | null>(recording.qc?.latestAnalysis?.id ?? null);
  const onDataChangedRef = useRef(onDataChanged);
  onDataChangedRef.current = onDataChanged;

  const load = useCallback(async (showLoading = false) => {
    if (!sessionId || inFlightRef.current) return;
    inFlightRef.current = true;
    if (showLoading) setLoading(true);
    const [sessionResult, statusResult, transcriptResult, analysisResult] = await Promise.allSettled([
      api.qualityControl.session(session.token, sessionId),
      api.qualityControl.status(session.token, sessionId),
      api.qualityControl.transcript(session.token, sessionId),
      api.qualityControl.analysis(session.token, sessionId),
    ]);

    if (sessionResult.status === 'fulfilled') setQcSession(sessionResult.value);
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
    if (transcriptResult.status === 'fulfilled') setTranscript(transcriptResult.value);
    if (analysisResult.status === 'fulfilled') {
      setAnalysis(analysisResult.value);
      if (analysisIdRef.current && analysisIdRef.current !== analysisResult.value.id) onDataChangedRef.current();
      if (!analysisIdRef.current && !recording.qc?.latestAnalysis) onDataChangedRef.current();
      analysisIdRef.current = analysisResult.value.id;
    }
    setErrors({
      session: sessionResult.status === 'rejected' ? unavailableMessage(sessionResult.reason, 'session') : '',
      status: statusResult.status === 'rejected' ? messageOf(statusResult.reason) : '',
      transcript: transcriptResult.status === 'rejected' ? unavailableMessage(transcriptResult.reason, 'transcript') : '',
      analysis: analysisResult.status === 'rejected' ? unavailableMessage(analysisResult.reason, 'analysis') : '',
    });
    setLoading(false);
    inFlightRef.current = false;
  }, [recording.qc?.latestAnalysis, session.token, sessionId]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    setQcSession(null);
    setStatus(null);
    setTranscript(null);
    setAnalysis(null);
    setErrors({ session: '', status: '', transcript: '', analysis: '' });
    analysisIdRef.current = recording.qc?.latestAnalysis?.id ?? null;
    void load(true);
  }, [load, recording.qc?.latestAnalysis?.id]);

  useEffect(() => {
    if (!sessionId || (status && terminal.has(status.status))) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [load, sessionId, status]);

  const result = analysis?.structuredResult;
  const currentStatus = status?.status ?? qcSession?.status ?? recording.qc?.status;

  return (
    <div className="qc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="qc-modal-card" role="dialog" aria-modal="true" aria-labelledby="qc-record-title">
        <header>
          <div>
            <h3 id="qc-record-title">Разговор от {formatDateTime(recording.startedAt)}</h3>
            <p>{shopName} · {formatDuration(recording.durationSec)}</p>
          </div>
          <button ref={closeButtonRef} className="secondary" type="button" onClick={onClose}>Закрыть</button>
        </header>

        <div className="qc-modal-body">
          {!sessionId ? (
            <section className="qc-detail-section">
              <h4>Обработка AI</h4>
              <p>Запись ещё не передана в AI. Детали появятся после создания сессии.</p>
            </section>
          ) : loading && !qcSession && !status ? <p>Загружаем результаты разговора...</p> : (
            <>
              <section className="qc-detail-section qc-detail-facts">
                <div><span>Статус</span><strong>{currentStatus ? qcStatusLabels[currentStatus] : 'Нет данных'}</strong></div>
                <div><span>Итог</span>{analysis ? <strong className={`qc-quality-badge ${analysis.qualityClass}`}>{qualityLabels[analysis.qualityClass]}</strong> : <strong>Ожидается</strong>}</div>
                <div><span>Оценка</span><strong>{analysis ? `${Math.round(Number(analysis.overallScore))}/100` : '—'}</strong></div>
                <div><span>Режим</span><strong>{recording.recordingMode === 'vad_auto' ? 'Авто по речи' : 'Ручная запись'}</strong></div>
              </section>
              {(errors.session || errors.status) && <p className="error">{errors.session || errors.status}</p>}

              <section className="qc-detail-section">
                <h4>Краткий вывод AI</h4>
                {result ? (
                  <div className="qc-summary-box">
                    <p>{result.summary.short}</p>
                    <dl>
                      <div><dt>Цель клиента</dt><dd>{result.summary.customerIntent || 'Не определена'}</dd></div>
                      <div><dt>Результат</dt><dd>{result.summary.outcome || 'Не определён'}</dd></div>
                      <div><dt>Настроение клиента</dt><dd>{sentimentLabels[result.customer.sentiment]}</dd></div>
                      <div><dt>Удовлетворённость</dt><dd>{satisfactionLabels[result.customer.satisfaction]}</dd></div>
                    </dl>
                    <div className="qc-dialog-flags">
                      <span className={result.dialog.hasConflict ? 'alert' : ''}>Конфликт: {result.dialog.hasConflict ? 'да' : 'нет'}</span>
                      <span className={result.dialog.hasComplaint ? 'alert' : ''}>Жалоба: {result.dialog.hasComplaint ? 'да' : 'нет'}</span>
                      <span>Возражение: {result.dialog.hasObjection ? 'да' : 'нет'}</span>
                      <span>Намерение купить: {result.dialog.saleIntentDetected ? 'да' : 'нет'}</span>
                    </div>
                  </div>
                ) : <p>{errors.analysis || 'AI-анализ ещё готовится.'}</p>}
              </section>

              <section className="qc-detail-section">
                <h4>Расшифровка</h4>
                {transcript ? (
                  transcript.transcript.segments.length === 0 ? <p>В расшифровке нет реплик.</p> : (
                    <div className="qc-transcript">
                      {transcript.transcript.segments.map((segment, index) => (
                        <article key={`${segment.start ?? index}-${index}`}>
                          <header><strong>{displaySpeaker(segment.speaker, index)}</strong><span>{formatTimestamp(segment.start)}</span></header>
                          <p>{segment.text}</p>
                        </article>
                      ))}
                    </div>
                  )
                ) : <p>{errors.transcript || 'Расшифровка ещё готовится.'}</p>}
              </section>

              {result && (
                <>
                  <section className="qc-detail-section">
                    <h4>Оценка по критериям</h4>
                    <div className="qc-criteria-grid">
                      {Object.entries(result.quality.criteria).map(([key, criterion]) => (
                        <article key={key}>
                          <header><strong>{criterionLabels[key as keyof typeof criterionLabels] ?? key}</strong><b>{criterion.score}/{criterion.maxScore}</b></header>
                          <span className={`qc-criterion-status ${criterion.status}`}>{criterionStatusLabels[criterion.status]}</span>
                          <p>{criterion.comment}</p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <div className="qc-result-columns">
                    <section className="qc-detail-section"><h4>Сильные стороны</h4>{result.strengths.length ? <ul>{result.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>Не отмечены.</p>}</section>
                    <section className="qc-detail-section"><h4>Рекомендации</h4>{result.recommendations.length ? <ol>{result.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ol> : <p>Нет рекомендаций.</p>}</section>
                  </div>

                  {(result.problems.length > 0 || result.violations.length > 0) && (
                    <section className="qc-detail-section">
                      <h4>Проблемы и нарушения</h4>
                      <div className="qc-findings">
                        {[...result.problems, ...result.violations].map((finding, index) => (
                          <article key={`${finding.type}-${index}`}>
                            <header><strong>{finding.description}</strong><span className={`qc-severity ${finding.severity}`}>{severityLabels[finding.severity]}</span></header>
                            {finding.evidence && <blockquote>{finding.evidence}</blockquote>}
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              <details className="qc-technical-details">
                <summary>Техническая информация</summary>
                <dl>
                  <div><dt>AI-сессия</dt><dd>{sessionId}</dd></div>
                  <div><dt>ID записи</dt><dd>{recording.localRecordingId}</dd></div>
                  <div><dt>Устройство</dt><dd>{recording.deviceId}</dd></div>
                  <div><dt>Размер файла</dt><dd>{formatBytes(recording.fileSizeBytes)}</dd></div>
                  <div><dt>Версия приложения</dt><dd>{recording.appVersion}</dd></div>
                  {analysis && <><div><dt>Модель</dt><dd>{analysis.model ?? analysis.provider}</dd></div><div><dt>Анализ выполнен</dt><dd>{formatDateTime(analysis.analyzedAt)}</dd></div></>}
                </dl>
              </details>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
