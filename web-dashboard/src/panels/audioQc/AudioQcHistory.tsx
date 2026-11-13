import type { KeyboardEvent } from 'react';
import { Table } from '../../components/ui';
import type { AudioQcRecording, Shop } from '../../types';
import { formatDateTime, formatDuration, qcStatusLabels, qualityLabels, recordingStatusLabels } from './qualityControlFormat';

type Props = {
  shopName: string;
  shops: Shop[];
  showShop: boolean;
  recordings: AudioQcRecording[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onOpen: (recording: AudioQcRecording) => void;
};

export const AudioQcHistory = ({ shopName, shops, showShop, recordings, total, loading, page, pageSize, onPageChange, onOpen }: Props) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, recording: AudioQcRecording) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(recording);
    }
  };

  return (
    <details className="audio-qc-history" open>
      <summary>История записей · {shopName || 'магазин'} · {total}</summary>
      {loading ? <p>Загружаем записи...</p> : recordings.length === 0 ? <p>За выбранный период записей нет.</p> : (
        <Table>
          <thead>
            <tr>{showShop && <th>Магазин</th>}<th>Начало</th><th>Длительность</th><th>Режим</th><th>Обработка</th><th>Оценка</th><th>Результат</th><th /></tr>
          </thead>
          <tbody>
            {recordings.map((recording) => {
              const analysis = recording.qc?.latestAnalysis;
              const processing = recording.qc ? qcStatusLabels[recording.qc.status] : recordingStatusLabels[recording.status];
              return (
                <tr
                  className="qc-recording-row"
                  key={recording.localRecordingId}
                  tabIndex={0}
                  onClick={() => onOpen(recording)}
                  onKeyDown={(event) => openFromKeyboard(event, recording)}
                  aria-label={`Открыть запись от ${formatDateTime(recording.startedAt)}`}
                >
                  {showShop && <td>{shops.find(shop => shop.id === recording.shopId)?.name ?? recording.shopId}</td>}
                  <td>{formatDateTime(recording.startedAt)}</td>
                  <td>{formatDuration(recording.durationSec)}</td>
                  <td>{recording.recordingMode === 'vad_auto' ? 'Авто по речи' : 'Ручная'}</td>
                  <td title={recording.lastError ?? undefined}>{processing}</td>
                  <td>{analysis ? `${Math.round(Number(analysis.overallScore))}/100` : '—'}</td>
                  <td>{analysis ? <span className={`qc-quality-badge ${analysis.qualityClass}`}>{qualityLabels[analysis.qualityClass]}</span> : 'Ожидается'}</td>
                  <td><button className="secondary qc-open-button" type="button" onClick={(event) => { event.stopPropagation(); onOpen(recording); }}>Подробнее</button></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {total > pageSize && (
        <nav className="qc-pagination" aria-label="Страницы истории">
          <button className="secondary" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>Назад</button>
          <span>Страница {page} из {pages}</span>
          <button className="secondary" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)}>Далее</button>
        </nav>
      )}
    </details>
  );
};
