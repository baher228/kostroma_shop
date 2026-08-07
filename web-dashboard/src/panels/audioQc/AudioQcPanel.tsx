import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Feedback, PageHeader, RefreshButton, Table } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type {
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecording,
  AudioQcRecordingStatus,
  Session,
  Shop,
} from '../../types';

const defaultPolicy = (shopId: string): AudioQcPolicy => ({
  enabled: false,
  mode: 'manual',
  shopId,
  targetRole: 'store_tablet',
  maxSegmentDurationSec: 300,
  silenceToStopSec: 3,
  preRollSec: 5,
  uploadImmediately: true,
  updatedAt: new Date(0).toISOString(),
});

const statusLabels: Record<AudioQcRecordingStatus, string> = {
  recording: 'Записывается',
  recorded: 'Ждет отправки',
  waiting_network: 'Нет сети',
  creating_ml_session: 'Создание ML-сессии',
  uploading_audio: 'Отправка аудио',
  audio_uploaded: 'Аудио отправлено',
  starting_processing: 'Запуск AI',
  processing_started: 'AI обрабатывает',
  completed: 'Готово',
  failed_retryable: 'Повторная отправка',
  failed_permanent: 'Ошибка',
};

const formatDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  : '-';

const numberValue = (value: string, fallback: number) => {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) ? next : fallback;
};

export const AudioQcPanel = ({ session }: { session: Session }) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [policies, setPolicies] = useState<AudioQcPolicyWithHeartbeat[]>([]);
  const [recordings, setRecordings] = useState<AudioQcRecording[]>([]);
  const [activeShopId, setActiveShopId] = useState('');
  const [draft, setDraft] = useState<AudioQcPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? null;
  const activePolicy = useMemo(
    () => policies.find((policy) => policy.shopId === activeShopId) ?? (activeShopId ? { ...defaultPolicy(activeShopId), heartbeat: null } : null),
    [activeShopId, policies],
  );

  const loadBase = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextShops, nextPolicies] = await Promise.all([
        api.shops.list(session.token),
        api.audioQc.policies(session.token),
      ]);
      setShops(nextShops);
      setPolicies(nextPolicies);
      setActiveShopId((current) => current || nextShops[0]?.id || '');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const loadRecordings = async (shopId: string) => {
    if (!shopId) {
      setRecordings([]);
      return;
    }
    try {
      setRecordings(await api.audioQc.recordings(session.token, shopId));
    } catch (err) {
      setError(messageOf(err));
    }
  };

  useEffect(() => {
    void loadBase();
  }, [session.token]);

  useEffect(() => {
    if (!activePolicy) {
      setDraft(null);
      return;
    }
    setDraft({
      enabled: activePolicy.enabled,
      mode: activePolicy.mode,
      shopId: activePolicy.shopId,
      targetRole: 'store_tablet',
      maxSegmentDurationSec: activePolicy.maxSegmentDurationSec,
      silenceToStopSec: activePolicy.silenceToStopSec,
      preRollSec: activePolicy.preRollSec,
      uploadImmediately: activePolicy.uploadImmediately,
      updatedAt: activePolicy.updatedAt,
    });
  }, [activePolicy]);

  useEffect(() => {
    void loadRecordings(activeShopId);
  }, [activeShopId, session.token]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.audioQc.savePolicy(session.token, draft.shopId, draft);
      setPolicies((current) => [saved, ...current.filter((item) => item.shopId !== saved.shopId)]);
      setNotice(`Настройки записи для «${activeShop?.name ?? draft.shopId}» сохранены.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const heartbeat = activePolicy?.heartbeat ?? null;

  return (
    <section className="page-section audio-qc-page">
      <PageHeader
        title="AI QC"
        subtitle="Управление записью продавца и общая история по магазинам. Настройки одинаковы на телефоне и компьютере."
        action={<RefreshButton onClick={async () => {
          await loadBase();
          await loadRecordings(activeShopId);
        }} />}
      />
      <Feedback error={error} notice={notice} />

      {loading ? <p>Загружаем настройки AI QC...</p> : !draft ? <p>Нет доступных магазинов.</p> : (
        <form className="audio-qc-settings" onSubmit={save}>
          <label className="audio-qc-shop-select">
            Магазин для записи
            <select value={activeShopId} onChange={(event) => setActiveShopId(event.target.value)}>
              {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
          </label>

          <div className="audio-qc-toggle-row">
            <label className="audio-qc-check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              Запись включена
            </label>
            <label className="audio-qc-check">
              <input
                type="checkbox"
                checked={draft.uploadImmediately}
                onChange={(event) => setDraft({ ...draft, uploadImmediately: event.target.checked })}
              />
              Отправлять сразу после записи
            </label>
          </div>

          <div className="audio-qc-mode-row">
            <button type="button" className={draft.mode === 'manual' ? '' : 'secondary'} onClick={() => setDraft({ ...draft, mode: 'manual' })}>
              Ручная запись
            </button>
            <button type="button" className={draft.mode === 'vad_auto' ? '' : 'secondary'} onClick={() => setDraft({ ...draft, mode: 'vad_auto' })}>
              Авто по речи
            </button>
          </div>

          {draft.mode === 'vad_auto' && (
            <div className="audio-qc-number-grid">
              <label>Максимальная длина, сек
                <input type="number" min="30" max="1800" value={draft.maxSegmentDurationSec} onChange={(event) => setDraft({ ...draft, maxSegmentDurationSec: numberValue(event.target.value, 300) })} />
              </label>
              <label>Тишина до остановки, сек
                <input type="number" min="1" max="30" value={draft.silenceToStopSec} onChange={(event) => setDraft({ ...draft, silenceToStopSec: numberValue(event.target.value, 3) })} />
              </label>
              <label>Запас перед речью, сек
                <input type="number" min="0" max="30" value={draft.preRollSec} onChange={(event) => setDraft({ ...draft, preRollSec: numberValue(event.target.value, 5) })} />
              </label>
            </div>
          )}

          <button disabled={saving}>{saving ? 'Сохраняем...' : 'Применить настройки'}</button>

          <div className="audio-qc-device-status">
            <strong>Планшет магазина</strong>
            <span>{heartbeat?.online ? 'Онлайн' : 'Офлайн'}</span>
            <span>Режим: {heartbeat?.currentMode === 'vad_auto' ? 'Авто по речи' : heartbeat?.currentMode === 'manual' ? 'Ручной' : '-'}</span>
            <span>Сейчас пишет: {heartbeat?.isRecording ? 'да' : 'нет'}</span>
            <span>Очередь: {heartbeat?.queueSize ?? 0}</span>
            <span>Последний сигнал: {formatDateTime(heartbeat?.lastSeenAt ?? null)}</span>
          </div>
        </form>
      )}

      <details className="audio-qc-history">
        <summary>История записей · {activeShop?.name ?? 'магазин'} · {recordings.length}</summary>
        {recordings.length === 0 ? <p>Для выбранного магазина записей пока нет.</p> : (
          <Table>
            <thead>
              <tr><th>Магазин</th><th>Начало</th><th>Длительность</th><th>Режим</th><th>Статус</th><th>Устройство</th><th>ML-сессия</th></tr>
            </thead>
            <tbody>
              {recordings.map((recording) => (
                <tr key={recording.localRecordingId}>
                  <td>{shops.find((shop) => shop.id === recording.shopId)?.name ?? recording.shopId}</td>
                  <td>{formatDateTime(recording.startedAt)}</td>
                  <td>{recording.durationSec === null ? '-' : `${recording.durationSec} сек`}</td>
                  <td>{recording.recordingMode === 'vad_auto' ? 'Авто по речи' : 'Ручной'}</td>
                  <td title={recording.lastError ?? undefined}>{statusLabels[recording.status]}</td>
                  <td>{recording.deviceId}</td>
                  <td>{recording.mlSessionId?.slice(0, 8) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </details>
    </section>
  );
};
