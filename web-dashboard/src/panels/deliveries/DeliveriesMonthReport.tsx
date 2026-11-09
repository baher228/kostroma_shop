import React from 'react';
import type { DeliveryMonthReport, MonthCell } from '../../../../shared/delivery-status';

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null);

const minutesText = (value: number | null) => (value === null ? '—' : `${value.toFixed(1).replace('.', ',')} мин`);

const cellTone = (cell: MonthCell) => (cell.problems === null ? 'none' : cell.problems === 0 ? 'ok' : cell.problems === 1 ? 'warn' : 'bad');

const cellTitle = (shopName: string, cell: MonthCell) => {
  const [year, month, day] = cell.date.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (cell.problems === null) return `${shopName}, ${date}: поставок нет`;
  return [`${shopName}, ${date}`, ...(cell.details.length ? cell.details : ['без проблем'])].join('\n');
};

const ShareBar = ({ value, tone }: { value: number | null; tone: 'shop' | 'supplier' }) => (
  <span className="deliveries-share">
    <span className={`deliveries-share-track tone-${tone}`}>
      <span style={{ width: `${value ?? 0}%` }} />
    </span>
    <b>{value === null ? '—' : `${value}%`}</b>
  </span>
);

/** Red once a shop has this many unmarked / photo-less deliveries in the month. */
const SHOP_ALERT_COUNT = 5;
/** Red once more than this share of a supplier's deliveries were late. */
const SUPPLIER_ALERT_LATE_SHARE = 0.1;

export const DeliveriesMonthReport = ({ report }: { report: DeliveryMonthReport }) => (
  <div className="deliveries-month">
    <section className="deliveries-block">
      <header>
        <h3>Приёмка по дням: магазины</h3>
        <span className="deliveries-legend">
          <span><i className="tone-ok" />без проблем</span>
          <span><i className="tone-warn" />1 проблема</span>
          <span><i className="tone-bad" />2 и больше</span>
        </span>
      </header>
      <div className="deliveries-heatmap-scroll">
        <table className="deliveries-heatmap">
          <thead>
            <tr>
              <th aria-label="Магазин" />
              {report.days.map((day) => <th key={day.date} className={day.weekend ? 'weekend' : ''}>{day.day}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.shops.map((shop) => (
              <tr key={shop.shopId}>
                <th scope="row">{shop.name}</th>
                {shop.cells.map((cell) => (
                  <td key={cell.date}>
                    <span className={`deliveries-heat tone-${cellTone(cell)}`} title={cellTitle(shop.name, cell)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="deliveries-note">Проблема — поставка без отметки или без фото накладной. Наведите на клетку, чтобы увидеть детали. Жирным — выходные.</p>
    </section>

    <section className="deliveries-block">
      <header><h3>По магазинам</h3></header>
      <table className="deliveries-report-table">
        <thead>
          <tr><th>Магазин</th><th>Принято с фото</th><th>Не отмечено</th><th>Без фото</th><th>Задержка отметки</th></tr>
        </thead>
        <tbody>
          {report.shops.map((shop) => (
            <tr key={shop.shopId}>
              <th scope="row">{shop.name}</th>
              <td><ShareBar value={percent(shop.withPhoto, shop.due)} tone="shop" /></td>
              <td className={shop.missed >= SHOP_ALERT_COUNT ? 'alert' : ''}>{shop.missed}</td>
              <td className={shop.noPhoto >= SHOP_ALERT_COUNT ? 'alert' : ''}>{shop.noPhoto}</td>
              <td>{minutesText(shop.avgMarkDelayMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <section className="deliveries-block">
      <header><h3>По поставщикам</h3></header>
      <table className="deliveries-report-table">
        <thead>
          <tr><th>Поставщик</th><th>Поставок</th><th>Опозданий</th><th>Приезжает вовремя</th><th>Среднее опоздание</th></tr>
        </thead>
        <tbody>
          {report.suppliers.map((supplier) => (
            <tr key={supplier.name}>
              <th scope="row">{supplier.name}</th>
              <td>{supplier.due}</td>
              <td className={supplier.due && supplier.late / supplier.due > SUPPLIER_ALERT_LATE_SHARE ? 'alert' : ''}>{supplier.late}</td>
              <td><ShareBar value={supplier.onTimeShare === null ? null : Math.round(supplier.onTimeShare * 100)} tone="supplier" /></td>
              <td>{supplier.avgLateMinutes === null ? '—' : `${Math.round(supplier.avgLateMinutes)} мин`}</td>
            </tr>
          ))}
          {!report.suppliers.length && <tr><td colSpan={5} className="deliveries-note">За этот месяц поставок ещё не было.</td></tr>}
        </tbody>
      </table>
    </section>
  </div>
);
