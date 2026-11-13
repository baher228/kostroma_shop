import type { FormEvent } from 'react';
import type { AudioQcPolicy, AudioQcPolicyWithHeartbeat } from '../../types';
import { formatDateTime } from './qualityControlFormat';

const numberValue = (value: string, fallback: number) => {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) ? next : fallback;
};

type Props = {
  fleet?: boolean;
  saved: AudioQcPolicyWithHeartbeat;
  draft: AudioQcPolicy;
  dirty: boolean;
  saving: boolean;
  onChange: (draft: AudioQcPolicy) => void;
  onSave: (event: FormEvent) => void;
};

export const AudioQcSettings = ({ fleet = false, saved, draft, dirty, saving, onChange, onSave }: Props) => {
  const heartbeat = saved.heartbeat;
  const online = heartbeat?.online === true;

  return (
    <details className="audio-qc-settings">
      <summary className="audio-qc-settings-summary">
        <span>Настройки записи</span>
        <span className={`qc-state-chip ${saved.enabled ? 'active' : ''}`}>{saved.enabled ? 'включена' : 'выключена'}</span>
        <span className="qc-summary-meta">Авто по речи</span>
        {dirty && <span className="qc-unsaved">есть несохранённые изменения</span>}
      </summary>

      <form className="audio-qc-settings-form" onSubmit={onSave}>
        {fleet && <div className="audio-qc-toggle-row">
          <button type="button" className="secondary" onClick={() => onChange({ ...draft, enabled: true })}>Включить всем</button>
          <button type="button" className="secondary" onClick={() => onChange({ ...draft, enabled: false })}>Выключить всем</button>
        </div>}
        <div className="audio-qc-toggle-row">
          <label className="audio-qc-check">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => onChange({ ...draft, enabled: event.target.checked })} />
            Запись включена
          </label>
          <label className="audio-qc-check">
            <input type="checkbox" checked={draft.uploadImmediately} onChange={(event) => onChange({ ...draft, uploadImmediately: event.target.checked })} />
            Отправлять сразу после записи
          </label>
        </div>

        {draft.mode === 'vad_auto' && (
          <div className="audio-qc-number-grid">
            <label>Максимальная длина, сек
              <input type="number" min="30" max="1800" value={draft.maxSegmentDurationSec} onChange={(event) => onChange({ ...draft, maxSegmentDurationSec: numberValue(event.target.value, 300) })} />
            </label>
            <label>Тишина до остановки, сек
              <input type="number" min="1" max="30" value={draft.silenceToStopSec} onChange={(event) => onChange({ ...draft, silenceToStopSec: numberValue(event.target.value, 10) })} />
            </label>
            <label>Запас перед речью, сек
              <input type="number" min="0" max="30" value={draft.preRollSec} onChange={(event) => onChange({ ...draft, preRollSec: numberValue(event.target.value, 5) })} />
            </label>
          </div>
        )}

        <button disabled={saving || !dirty}>{saving ? 'Сохраняем...' : fleet ? 'Применить ко всем магазинам' : 'Применить настройки'}</button>

        {!fleet && <div className="audio-qc-device-status">
          <strong>Планшет магазина</strong>
          <span className={online ? 'online' : 'offline'}>{online ? 'Онлайн' : 'Офлайн'}</span>
          {online ? (
            <>
              <span>Режим: {heartbeat?.currentMode === 'vad_auto' ? 'Авто по речи' : heartbeat?.currentMode === 'manual' ? 'Ручной' : 'неизвестен'}</span>
              <span>Сейчас пишет: {heartbeat?.isRecording ? 'да' : 'нет'}</span>
              <span>Очередь: {heartbeat?.queueSize ?? 0}</span>
            </>
          ) : <span>Текущее состояние неизвестно</span>}
          <span>Последний сигнал: {formatDateTime(heartbeat?.lastSeenAt)}</span>
        </div>}
      </form>
    </details>
  );
};
