import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../api';
import type { AudioQcRecording, QcAnalysis, QcAudioInfo, QcSession, QcStatus, QcTranscript, Session } from '../../types';
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
  const [audioInfo, setAudioInfo] = useState<QcAudioInfo | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBusy, setAudioBusy] = useState(false);
  const [errors, setErrors] = useState({ session: '', status: '', transcript: '', analysis: '', audio: '' });
  const [loading, setLoading] = useState(Boolean(sessionId));
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inFlightRef = useRef(false);
  const analysisIdRef = useRef<string | null>(recording.qc?.latestAnalysis?.id ?? null);
  const onDataChangedRef = useRef(onDataChanged);
  onDataChangedRef.current = onDataChanged;

  const load = useCallback(async (showLoading = false) => {
    if (!sessionId || inFlightRef.current) return;
    inFlightRef.current = true;
    if (showLoading) setLoading(true);
    const [sessionResult, statusResult, transcriptResult, analysisResult, audioResult] = await Promise.allSettled([
      api.qualityControl.session(session.token, sessionId),
      api.qualityControl.status(session.token, sessionId),
      api.qualityControl.transcript(session.token, sessionId),
      api.qualityControl.analysis(session.token, sessionId),
      api.qualityControl.audioInfo(session.token, sessionId),
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
    if (audioResult.status === 'fulfilled') setAudioInfo(audioResult.value);
    setErrors({
      session: sessionResult.status === 'rejected' ? unavailableMessage(sessionResult.reason, 'session') : '',
      status: statusResult.status === 'rejected' ? messageOf(statusResult.reason) : '',
      transcript: transcriptResult.status === 'rejected' ? unavailableMessage(transcriptResult.reason, 'transcript') : '',
      analysis: analysisResult.status === 'rejected' ? unavailableMessage(analysisResult.reason, 'analysis') : '',
      audio: audioResult.status === 'rejected' ? messageOf(audioResult.reason) : '',
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
    setAudioInfo(null);
    setErrors({ session: '', status: '', transcript: '', analysis: '', audio: '' });
    analysisIdRef.current = recording.qc?.latestAnalysis?.id ?? null;
    void load(true);
  }, [load, recording.qc?.latestAnalysis?.id]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  useEffect(() => {
    if (!sessionId || (status && terminal.has(status.status))) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [load, sessionId, status]);

  const result = analysis?.structuredResult;
  const currentStatus = status?.status ?? qcSession?.status ?? recording.qc?.status;

  const fetchAudio = async (download: boolean) => {
    if (!sessionId || audioBusy) return;
    setAudioBusy(true);
    try {
      const file = await api.qualityControl.audioDownload(session.token, sessionId);
      if (download) {
        const url = URL.createObjectURL(file.blob);
        const link = document.createElement('a');
        link.href = url; link.download = file.fileName; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      } else {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(file.blob));
      }
      setErrors(current => ({ ...current, audio: '' }));
    } catch (error) { setErrors(current => ({ ...current, audio: messageOf(error) })); }
    finally { setAudioBusy(false); }
  };

  const togglePinned = async () => {
    if (!sessionId || !audioInfo || audioBusy) return;
    setAudioBusy(true);
    try {
      setAudioInfo(await api.qualityControl.setAudioPinned(session.token, sessionId, audioInfo.retentionClass !== 'pinned'));
      setErrors(current => ({ ...current, audio: '' }));
    } catch (error) { setErrors(current => ({ ...current, audio: messageOf(error) })); }
    finally { setAudioBusy(false); }
  };

  const playFrom = async (seconds: number | null) => {
    if (seconds === null || seconds < 0) return;
    pendingSeekRef.current = seconds;
    if (!audioUrl) {
      await fetchAudio(false);
      return;
    }
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = seconds;
      await audioElementRef.current.play().catch(() => undefined);
      pendingSeekRef.current = null;
    }
  };

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

              <section className="qc-detail-section qc-audio-section">
                <div>
                  <h4>Аудиозапись</h4>
                  {audioInfo ? (
                    audioInfo.available ? <p>
                      {audioInfo.retentionClass === 'pinned' ? 'Хранится бессрочно.' : `Будет удалена ${audioInfo.expiresAt ? formatDateTime(audioInfo.expiresAt) : 'по политике хранения'}.`}
                      {' '}{audioInfo.retentionReason}
                    </p> : <p>Аудиофайл уже удалён по политике хранения. Расшифровка и анализ сохранены.</p>
                  ) : <p>{errors.audio || 'Получаем сведения о файле...'}</p>}
                </div>
                {audioInfo?.available && <div className="qc-audio-actions">
                  <button type="button" onClick={() => void fetchAudio(false)} disabled={audioBusy}>{audioUrl ? 'Обновить плеер' : 'Прослушать'}</button>
                  <button className="secondary" type="button" onClick={() => void fetchAudio(true)} disabled={audioBusy}>Скачать аудио</button>
                  <button className="secondary" type="button" onClick={() => void togglePinned()} disabled={audioBusy}>
                    {audioInfo.retentionClass === 'pinned' ? 'Вернуть автоудаление' : 'Хранить бессрочно'}
                  </button>
                </div>}
                {audioUrl && <audio ref={audioElementRef} className="qc-audio-player" controls preload="metadata" src={audioUrl}
                  onLoadedMetadata={(event) => {
                    if (pendingSeekRef.current === null) return;
                    event.currentTarget.currentTime = pendingSeekRef.current;
                    pendingSeekRef.current = null;
                    void event.currentTarget.play().catch(() => undefined);
                  }} />}
                {errors.audio && <p className="error">{errors.audio}</p>}
              </section>

              <section className="qc-detail-section">
                <h4>Краткий вывод AI</h4>
                {result ? (
                  <div className="qc-summary-box">
                    <p>{result.summary.short}</p>
                    {result.boundaries && <div className="qc-summary-box">
                      <strong>Границы диалога</strong>
                      <p>Начало: {{ starts_here: 'в этой записи', continues_previous: 'в предыдущей записи', unknown: 'не определено' }[result.boundaries.start]}.
                        {' '}Окончание: {{ ends_here: 'в этой записи', continues_next: 'в следующей записи', unknown: 'не определено' }[result.boundaries.end]}.</p>
                      <p>Уверенность: {{ high: 'высокая', medium: 'средняя', low: 'низкая' }[result.boundaries.confidence]}. {result.boundaries.explanation}</p>
                    </div>}
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
                          <header><strong>{displaySpeaker(segment.speaker, index)}</strong>
                            <button className="qc-transcript-seek" type="button" disabled={segment.start === null || audioInfo?.available === false}
                              onClick={() => void playFrom(segment.start)} title="Прослушать с этой реплики">
                              ▶ {formatTimestamp(segment.start)}
                            </button>
                          </header>
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
                            {typeof finding.evidence === 'string' && finding.evidence && <blockquote>{finding.evidence}</blockquote>}
                            {Array.isArray(finding.evidence) && finding.evidence.map((evidence, evidenceIndex) => (
                              <blockquote key={`${evidence.segmentIndex}-${evidenceIndex}`}>
                                {evidence.quote}
                                {transcript?.transcript.segments[evidence.segmentIndex]?.start != null && audioInfo?.available !== false && (
                                  <button className="qc-evidence-seek" type="button"
                                    onClick={() => void playFrom(transcript.transcript.segments[evidence.segmentIndex].start)}>
                                    ▶ Прослушать фрагмент
                                  </button>
                                )}
                              </blockquote>
                            ))}
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
