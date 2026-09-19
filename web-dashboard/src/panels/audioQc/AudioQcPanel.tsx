import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { Feedback, PageHeader, RefreshButton } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type {
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecording,
  QcOverview,
  QcTrendPoint,
  Session,
  Shop,
} from '../../types';
import { AudioQcHistory } from './AudioQcHistory';
import { AudioQcRecordingDetails } from './AudioQcRecordingDetails';
import { AudioQcSettings } from './AudioQcSettings';
import { AudioQcStatistics } from './AudioQcStatistics';

type PeriodKey = 'today' | '7d' | '30d' | 'all' | 'custom';
type DateRange = { from?: string; to?: string };
const PAGE_SIZE = 25;

const dateInMoscow = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Moscow',
}).format(date);

const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const toRange = (period: PeriodKey, customFrom: string, customTo: string): DateRange => {
  if (period === 'all') return {};
  const today = dateInMoscow();
  const fromDate = period === 'custom' ? customFrom : period === 'today' ? today : shiftDate(today, period === '7d' ? -6 : -29);
  const toDate = period === 'custom' ? customTo : today;
  return {
    from: fromDate ? `${fromDate}T00:00:00.000+03:00` : undefined,
    to: toDate ? `${shiftDate(toDate, 1)}T00:00:00.000+03:00` : undefined,
  };
};

const intervalFor = (range: DateRange): 'day' | 'week' | 'month' => {
  if (!range.from || !range.to) return 'month';
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  return days <= 45 ? 'day' : days <= 150 ? 'week' : 'month';
};

const emptyTrend = (date: string): QcTrendPoint => ({
  date, totalDialogs: 0, processedDialogs: 0, averageScore: null, good: 0, neutral: 0, bad: 0,
  conflicts: 0, complaints: 0, violations: 0, criticalViolations: 0,
});

const fillDailyTrends = (trends: QcTrendPoint[], range: DateRange, interval: 'day' | 'week' | 'month') => {
  if (interval !== 'day' || !range.from || !range.to) return trends;
  const first = range.from.slice(0, 10);
  const last = shiftDate(range.to.slice(0, 10), -1);
  const count = Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000) + 1;
  if (count < 1 || count > 62) return trends;
  const byDate = new Map(trends.map((point) => [point.date, point]));
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDate(first, index);
    return byDate.get(date) ?? emptyTrend(date);
  });
};

const defaultPolicy = (shopId: string): AudioQcPolicyWithHeartbeat => ({
  enabled: false,
  mode: 'manual',
  shopId,
  targetRole: 'store_tablet',
  maxSegmentDurationSec: 300,
  silenceToStopSec: 3,
  preRollSec: 5,
  uploadImmediately: true,
  updatedAt: new Date(0).toISOString(),
  heartbeat: null,
});

const editablePolicy = (policy: AudioQcPolicyWithHeartbeat): AudioQcPolicy => ({
  enabled: policy.enabled,
  mode: policy.mode,
  shopId: policy.shopId,
  targetRole: 'store_tablet',
  maxSegmentDurationSec: policy.maxSegmentDurationSec,
  silenceToStopSec: policy.silenceToStopSec,
  preRollSec: policy.preRollSec,
  uploadImmediately: policy.uploadImmediately,
  updatedAt: policy.updatedAt,
});

const policyKey = (policy: AudioQcPolicy | AudioQcPolicyWithHeartbeat | null) => policy ? JSON.stringify({
  enabled: policy.enabled,
  mode: policy.mode,
  maxSegmentDurationSec: policy.maxSegmentDurationSec,
  silenceToStopSec: policy.silenceToStopSec,
  preRollSec: policy.preRollSec,
  uploadImmediately: policy.uploadImmediately,
}) : '';

export const AudioQcPanel = ({ session }: { session: Session }) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [policies, setPolicies] = useState<AudioQcPolicyWithHeartbeat[]>([]);
  const [activeShopId, setActiveShopId] = useState('');
  const [draft, setDraft] = useState<AudioQcPolicy | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [customFrom, setCustomFrom] = useState(dateInMoscow());
  const [customTo, setCustomTo] = useState(dateInMoscow());
  const [page, setPage] = useState(1);
  const [recordings, setRecordings] = useState<AudioQcRecording[]>([]);
  const [recordingsTotal, setRecordingsTotal] = useState(0);
  const [overview, setOverview] = useState<QcOverview | null>(null);
  const [trends, setTrends] = useState<QcTrendPoint[]>([]);
  const [selected, setSelected] = useState<AudioQcRecording | null>(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseError, setBaseError] = useState('');
  const [recordingsError, setRecordingsError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [notice, setNotice] = useState('');
  const dataRequestRef = useRef(0);
  const refreshInFlightRef = useRef(false);

  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? null;
  const activePolicy = useMemo(() => policies.find((policy) => policy.shopId === activeShopId) ?? (activeShopId ? defaultPolicy(activeShopId) : null), [activeShopId, policies]);
  const dirty = Boolean(draft && activePolicy && policyKey(draft) !== policyKey(activePolicy));
  const range = useMemo(() => toRange(period, customFrom, customTo), [period, customFrom, customTo]);

  const loadBase = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingBase(true);
    setBaseError('');
    try {
      const [nextShops, nextPolicies] = await Promise.all([
        api.shops.list(session.token),
        api.audioQc.policies(session.token),
      ]);
      setShops(nextShops);
      setPolicies(nextPolicies);
      setActiveShopId((current) => nextShops.some((shop) => shop.id === current) ? current : nextShops[0]?.id ?? '');
    } catch (error) {
      setBaseError(messageOf(error));
    } finally {
      if (showLoading) setLoadingBase(false);
    }
  }, [session.token]);

  const loadData = useCallback(async (silent = false) => {
    if (!activeShopId) {
      setRecordings([]);
      setRecordingsTotal(0);
      setOverview(null);
      setTrends([]);
      return;
    }
    const requestId = ++dataRequestRef.current;
    if (!silent) {
      setLoadingRecordings(true);
      setLoadingStats(true);
    }
    const interval = intervalFor(range);
    const [recordingsResult, overviewResult, trendsResult] = await Promise.allSettled([
      api.audioQc.recordings(session.token, { shopId: activeShopId, ...range, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      api.qualityControl.overview(session.token, { shopId: activeShopId, ...range }),
      api.qualityControl.trends(session.token, { shopId: activeShopId, ...range, interval }),
    ]);
    if (requestId !== dataRequestRef.current) return;
    if (recordingsResult.status === 'fulfilled') {
      setRecordings(recordingsResult.value.recordings);
      setRecordingsTotal(recordingsResult.value.total);
      setRecordingsError('');
    } else setRecordingsError(messageOf(recordingsResult.reason));
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    if (trendsResult.status === 'fulfilled') setTrends(fillDailyTrends(trendsResult.value, range, interval));
    const statsFailures = [overviewResult, trendsResult].filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    setStatsError(statsFailures.length ? messageOf(statsFailures[0].reason) : '');
    setLoadingRecordings(false);
    setLoadingStats(false);
  }, [activeShopId, page, range, session.token]);

  useEffect(() => { void loadBase(true); }, [loadBase]);
  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!activePolicy) {
      setDraft(null);
      return;
    }
    if (!draft || draft.shopId !== activePolicy.shopId || (!dirty && draft.updatedAt !== activePolicy.updatedAt)) {
      setDraft(editablePolicy(activePolicy));
    }
  }, [activePolicy, dirty, draft]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible' || refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      await Promise.allSettled([loadBase(), loadData(true)]);
      refreshInFlightRef.current = false;
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadBase, loadData]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setBaseError('');
    setNotice('');
    try {
      const saved = await api.audioQc.savePolicy(session.token, draft.shopId, draft);
      setPolicies((current) => [saved, ...current.filter((item) => item.shopId !== saved.shopId)]);
      setDraft(editablePolicy(saved));
      setNotice(`Настройки записи для «${activeShop?.name ?? draft.shopId}» сохранены.`);
    } catch (error) {
      setBaseError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const selectShop = (nextShopId: string) => {
    if (dirty && !window.confirm('Изменения настроек не сохранены. Перейти к другому магазину?')) return;
    setActiveShopId(nextShopId);
    setPage(1);
    setNotice('');
  };

  const selectPeriod = (nextPeriod: PeriodKey) => {
    setPeriod(nextPeriod);
    setPage(1);
  };

  const refresh = async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    await Promise.allSettled([loadBase(), loadData()]);
    refreshInFlightRef.current = false;
  };

  const handleDetailDataChanged = useCallback(() => { void loadData(true); }, [loadData]);
  const closeDetails = useCallback(() => setSelected(null), []);

  return (
    <section className="page-section audio-qc-page">
      <PageHeader
        title="AI QC"
        subtitle="Записи разговоров, результаты AI-анализа и общая динамика по магазинам."
        action={<RefreshButton onClick={refresh} />}
      />
      <Feedback error={baseError} notice={notice} />

      <div className="qc-toolbar">
        <label>
          Магазин
          <select value={activeShopId} onChange={(event) => selectShop(event.target.value)} disabled={loadingBase || shops.length === 0}>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
        </label>
        <fieldset className="qc-period-control">
          <legend>Период</legend>
          <div className="qc-period-buttons">
            {([['today', 'Сегодня'], ['7d', '7 дней'], ['30d', '30 дней'], ['all', 'Всё время'], ['custom', 'Свой период']] as const).map(([key, label]) => (
              <button key={key} type="button" className={period === key ? '' : 'secondary'} onClick={() => selectPeriod(key)}>{label}</button>
            ))}
          </div>
        </fieldset>
        {period === 'custom' && (
          <div className="qc-custom-dates">
            <label>С<input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => { setCustomFrom(event.target.value); setPage(1); }} /></label>
            <label>По<input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => { setCustomTo(event.target.value); setPage(1); }} /></label>
          </div>
        )}
      </div>

      {loadingBase && shops.length === 0 ? <p>Загружаем настройки AI QC...</p> : activePolicy && draft ? (
        <AudioQcSettings saved={activePolicy} draft={draft} dirty={dirty} saving={saving} onChange={setDraft} onSave={save} />
      ) : <p>Нет доступных магазинов.</p>}

      {recordingsError && <p className="error">История записей: {recordingsError}</p>}
      <AudioQcHistory
        shopName={activeShop?.name ?? ''}
        recordings={recordings}
        total={recordingsTotal}
        loading={loadingRecordings}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onOpen={setSelected}
      />
      <AudioQcStatistics overview={overview} trends={trends} loading={loadingStats} error={statsError} />

      {selected && (
        <AudioQcRecordingDetails
          recording={selected}
          session={session}
          shopName={shops.find((shop) => shop.id === selected.shopId)?.name ?? selected.shopId}
          onClose={closeDetails}
          onDataChanged={handleDetailDataChanged}
        />
      )}
    </section>
  );
};
