import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Feedback, Metric, PageHeader, RefreshButton, Table } from '../../components/ui';
import { addDays, startOfWeek } from '../../dateUtils';
import { formatDate, formatDateTime, formatMinutes, messageOf, statusLabel } from '../../shared/format';
import type { CheckInStats, Session, Shop, WorkerCheckInDay, WorkerCheckInEvent, WorkerCheckInSummary } from '../../types';

export const AttendancePanel = ({ session }: { session: Session }) => {
  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(addDays(startOfWeek(), 6));
  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextStats, nextShops] = await Promise.all([
        api.checkin.stats(session.token, from, to, shopId || undefined),
        api.shops.list(session.token),
      ]);
      setStats(nextStats);
      setShops(nextShops);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  return (
    <section className="page-section">
      <PageHeader title="Посещаемость" subtitle="Check-in работников, часы, опоздания и отсутствия." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} />
      <div className="toolbar hero-toolbar">
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select value={shopId} onChange={(event) => setShopId(event.target.value)}>
          <option value="">Все магазины</option>
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select>
        <button onClick={() => void load()}>Показать период</button>
      </div>
      {loading ? <p>Считаем посещаемость...</p> : stats && (
        <>
          <div className="metric-grid">
            <Metric label="На смене" value={stats.currentlyIn} hint="Сейчас" />
            <Metric label="Вне смены" value={stats.currentlyOut} hint="Сейчас" />
            <Metric label="Check-in" value={stats.totalCheckIns} hint={`${formatDate(stats.from)} - ${formatDate(stats.to)}`} />
            <Metric label="Часы" value={formatMinutes(stats.workedMinutes)} hint="Оценка по событиям" />
            <Metric label="Опоздания" value={stats.lateCount} hint={`Позже ${stats.expectedStartTime}`} />
            <Metric label="Отсутствия" value={stats.missingCount} hint="Нет check-in за день" />
            <Metric label="Без отметки ухода" value={stats.missingCheckOuts} hint="Часы считаются до конца дня" />
          </div>
          <div className="chart-grid">
            <BarChart title="Часы по работникам" items={stats.workers.map((worker) => ({ label: worker.workerDisplayName, value: Math.round(worker.workedMinutes / 60) }))} suffix="ч" />
            <BarChart title="Check-in по дням" items={stats.daily.map((day) => ({ label: `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}`, value: day.checkIns }))} suffix="" />
          </div>
          <div className="status-grid">
            {stats.workers.map((worker) => (
              <article key={worker.workerId} className="status-card">
                <span className={`status-dot ${worker.status}`} />
                <div>
                  <strong>{worker.workerDisplayName}</strong>
                  <p>{statusLabel(worker.status)} · {formatDateTime(worker.lastChangedAt)}</p>
                </div>
              </article>
            ))}
          </div>
          <Table>
            <thead><tr><th>Работник</th><th>Дней на смене</th><th>Часы</th><th>Средняя смена</th><th>Check-in</th><th>Опоздания</th><th>Отсутствия</th><th>Без ухода</th><th>Текущий статус</th></tr></thead>
            <tbody>
              {stats.workers.map((worker) => (
                <tr key={worker.workerId}>
                  <td>{worker.workerDisplayName}</td>
                  <td>{worker.daysPresent}</td>
                  <td>{formatMinutes(worker.workedMinutes)}</td>
                  <td>{averageShift(worker)}</td>
                  <td>{worker.totalCheckIns}</td>
                  <td>{worker.lateDays}</td>
                  <td>{worker.missingDays}</td>
                  <td>{worker.missingCheckOuts}</td>
                  <td><span className={`pill ${worker.status}`}>{statusLabel(worker.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </Table>
          <WorkerAnalytics
            workers={stats.workers}
            selectedWorkerId={selectedWorkerId}
            onSelectWorker={setSelectedWorkerId}
            expectedStartTime={stats.expectedStartTime}
          />
          <EventsTable events={stats.events} shops={shops} />
        </>
      )}
    </section>
  );
};

const formatTime = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-';

const averageShift = (worker: WorkerCheckInSummary): string =>
  worker.daysPresent > 0 ? formatMinutes(Math.round(worker.workedMinutes / worker.daysPresent)) : '-';

const averageArrival = (days: WorkerCheckInDay[]): string => {
  const arrivals = days.flatMap((day) => {
    if (!day.firstInAt) return [];
    const date = new Date(day.firstInAt);
    return [date.getHours() * 60 + date.getMinutes()];
  });
  if (arrivals.length === 0) return '-';
  const average = Math.round(arrivals.reduce((sum, value) => sum + value, 0) / arrivals.length);
  return `${String(Math.floor(average / 60)).padStart(2, '0')}:${String(average % 60).padStart(2, '0')}`;
};

const dayStatusLabel = (day: WorkerCheckInDay): string => {
  if (!day.present) return 'Отсутствие';
  const labels = [
    day.late ? 'Опоздание' : '',
    day.missingCheckOut ? 'Нет отметки ухода' : '',
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : 'Вовремя';
};

const WorkerAnalytics = ({
  workers,
  selectedWorkerId,
  onSelectWorker,
  expectedStartTime,
}: {
  workers: WorkerCheckInSummary[];
  selectedWorkerId: string;
  onSelectWorker: (workerId: string) => void;
  expectedStartTime: string;
}) => {
  const worker = workers.find((item) => item.workerId === selectedWorkerId) ?? workers[0];
  if (!worker) return null;
  return (
    <article className="chart-card">
      <h3>Аналитика по сотруднику</h3>
      <div className="toolbar">
        <select value={worker.workerId} onChange={(event) => onSelectWorker(event.target.value)}>
          {workers.map((item) => <option key={item.workerId} value={item.workerId}>{item.workerDisplayName}</option>)}
        </select>
      </div>
      <div className="metric-grid">
        <Metric label="Дней на смене" value={`${worker.daysPresent} из ${worker.days.length}`} hint="За период" />
        <Metric label="Часы" value={formatMinutes(worker.workedMinutes)} hint="Оценка по событиям" />
        <Metric label="Средняя смена" value={averageShift(worker)} hint="Часы / дни на смене" />
        <Metric label="Средний приход" value={averageArrival(worker.days)} hint="Первый check-in дня" />
        <Metric label="Опоздания" value={worker.lateDays} hint={`Позже ${expectedStartTime}`} />
        <Metric label="Без отметки ухода" value={worker.missingCheckOuts} hint="Часы считаются до конца дня" />
      </div>
      <Table>
        <thead><tr><th>Дата</th><th>Приход</th><th>Уход</th><th>Часы</th><th>Статус</th></tr></thead>
        <tbody>
          {worker.days.map((day) => (
            <tr key={day.date}>
              <td>{formatDate(day.date)}</td>
              <td>{formatTime(day.firstInAt)}</td>
              <td>{formatTime(day.lastOutAt)}</td>
              <td>{day.present ? formatMinutes(day.workedMinutes) : '-'}</td>
              <td>{dayStatusLabel(day)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </article>
  );
};

const EventsTable = ({ events, shops }: { events: WorkerCheckInEvent[]; shops: Shop[] }) => (
  <Table>
    <thead><tr><th>Время</th><th>Работник</th><th>Магазин</th><th>Источник</th><th>Планшет</th><th>Событие</th></tr></thead>
    <tbody>
      {events.slice(0, 80).map((event) => (
        <tr key={event.id}>
          <td>{formatDateTime(event.eventAt)}</td>
          <td>{event.workerDisplayName}</td>
          <td>{event.shopName ?? shops.find((shop) => shop.id === event.shopId)?.name ?? event.shopId ?? '-'}</td>
          <td>{event.source === 'tablet_qr' ? 'FOB QR' : 'Manual'}</td>
          <td>{event.scannedByTabletDisplayName ?? event.scannedByTabletId ?? '-'}</td>
          <td>{event.status === 'in' ? 'Пришел' : 'Ушел'}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

const BarChart = ({ title, items, suffix }: { title: string; items: Array<{ label: string; value: number }>; suffix: string }) => {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <article className="chart-card">
      <h3>{title}</h3>
      <div className="bars">
        {items.length === 0 ? <p>Нет данных</p> : items.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></div>
            <strong>{item.value}{suffix}</strong>
          </div>
        ))}
      </div>
    </article>
  );
};
