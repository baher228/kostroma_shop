import { Metric } from '../../components/ui';
import type { QcOverview, QcTrendPoint } from '../../types';

const amount = (value: number | string | null | undefined) => Number(value ?? 0);
const percent = (value: number, total: number) => total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
const score = (value: number | string | null) => value === null ? '—' : `${Math.round(amount(value))}/100`;

const trendLabel = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' });
};

export const AudioQcStatistics = ({ overview, trends, loading, error }: {
  overview: QcOverview | null;
  trends: QcTrendPoint[];
  loading: boolean;
  error: string;
}) => {
  if (loading && !overview) return <section className="qc-statistics"><h3>Общая статистика</h3><p>Считаем показатели...</p></section>;
  if (error && !overview) return <section className="qc-statistics"><h3>Общая статистика</h3><p className="error">{error}</p></section>;
  if (!overview) return null;

  const processed = amount(overview.processedDialogs);
  const good = amount(overview.good);
  const neutral = amount(overview.neutral);
  const bad = amount(overview.bad);
  const maxDay = Math.max(1, ...trends.map((point) => amount(point.good) + amount(point.neutral) + amount(point.bad)));

  return (
    <section className="qc-statistics">
      <div className="qc-section-title">
        <h3>Общая статистика</h3>
        {loading && <span>Обновляем...</span>}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="qc-metrics-grid">
        <Metric label="Разговоров" value={amount(overview.totalDialogs)} hint="за выбранный период" />
        <Metric label="Обработано AI" value={processed} hint="с готовой оценкой" />
        <Metric label="Хорошо" value={good} hint={`${Math.round(percent(good, processed))}% обработанных`} />
        <Metric label="Нейтрально" value={neutral} hint={`${Math.round(percent(neutral, processed))}% обработанных`} />
        <Metric label="Плохо" value={bad} hint={`${Math.round(percent(bad, processed))}% обработанных`} />
        <Metric label="Средняя оценка" value={score(overview.averageScore)} hint="по обработанным" />
      </div>

      <div className="qc-secondary-metrics">
        <span>Конфликты <strong>{amount(overview.conflicts)}</strong></span>
        <span>Жалобы <strong>{amount(overview.complaints)}</strong></span>
        <span>Нарушения <strong>{amount(overview.violations)}</strong></span>
        <span>Критические <strong>{amount(overview.criticalViolations)}</strong></span>
      </div>

      <div className="qc-chart-grid">
        <article className="qc-chart-card">
          <h4>Распределение результатов</h4>
          {processed === 0 ? <p>Готовых оценок пока нет.</p> : (
            <>
              <div className="qc-distribution" aria-label="Распределение результатов">
                <span className="good" style={{ width: `${percent(good, processed)}%` }} />
                <span className="neutral" style={{ width: `${percent(neutral, processed)}%` }} />
                <span className="bad" style={{ width: `${percent(bad, processed)}%` }} />
              </div>
              <div className="qc-legend">
                <span><i className="good" /> Хорошо · {good}</span>
                <span><i className="neutral" /> Нейтрально · {neutral}</span>
                <span><i className="bad" /> Плохо · {bad}</span>
              </div>
            </>
          )}
        </article>

        <article className="qc-chart-card">
          <h4>Динамика разговоров</h4>
          {trends.length === 0 ? <p>Для графика пока нет данных.</p> : (
            <div className="qc-chart-scroll">
              <div className="qc-trend-chart">
                {trends.map((point) => {
                  const pointGood = amount(point.good);
                  const pointNeutral = amount(point.neutral);
                  const pointBad = amount(point.bad);
                  const total = pointGood + pointNeutral + pointBad;
                  return (
                    <div className="qc-trend-column" key={point.date} title={`${trendLabel(point.date)}: ${total}`}>
                      <div className="qc-trend-stack" style={{ height: `${Math.max(4, total / maxDay * 170)}px` }}>
                        {pointBad > 0 && <span className="bad" style={{ height: `${percent(pointBad, total)}%` }} />}
                        {pointNeutral > 0 && <span className="neutral" style={{ height: `${percent(pointNeutral, total)}%` }} />}
                        {pointGood > 0 && <span className="good" style={{ height: `${percent(pointGood, total)}%` }} />}
                      </div>
                      <strong>{total}</strong>
                      <small>{trendLabel(point.date)}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
};
