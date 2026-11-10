import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Feedback, Modal } from '../../components/ui';
import { messageOf } from '../../shared/format';
import { DeliveriesMonthReport } from './DeliveriesMonthReport';
import type { DeliveryReceipt, DeliverySupplier, DeliverySupplierInput, Session, Shop } from '../../types';
import {
  addDaysToDateKey,
  buildDeliveryMonthReport,
  countDeliveryStatuses,
  deliveryAcceptedCount,
  deliveryProblemCount,
  deliveryStatus,
  formatClockMinutes,
  isDeliveryDay,
  moscowDateKey,
  moscowDateTimeToIso,
  moscowMinutes,
  parseClockMinutes,
  type DeliveryStatus,
} from '../../../../shared/delivery-status';

type Period = 'today' | 'month';

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  on_time: 'Вовремя',
  late: 'Опоздал поставщик',
  no_photo: 'Нет фото накладной',
  missed: 'Не отмечено',
  expected: 'Ожидается',
};

const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: 'Пн' },
  { day: 2, label: 'Вт' },
  { day: 3, label: 'Ср' },
  { day: 4, label: 'Чт' },
  { day: 5, label: 'Пт' },
  { day: 6, label: 'Сб' },
  { day: 0, label: 'Вс' },
];

const monthRange = (dateKey: string) => {
  const [year, month] = dateKey.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
};


const headerDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const text = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const monthTitle = (dateKey: string) => {
  const [year, month] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const receiptKey = (supplierId: string, date: string) => `${supplierId}|${date}`;

const clockOf = (iso: string) => formatClockMinutes(moscowMinutes(new Date(iso)));

const toTimeInput = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

type CardModel = {
  supplier: DeliverySupplier;
  status: DeliveryStatus;
  receipt?: DeliveryReceipt;
};

export const DeliveriesPanel = ({ session }: { session: Session }) => {
  const [period, setPeriod] = useState<Period>('today');
  const [today, setToday] = useState(() => moscowDateKey());
  const [shops, setShops] = useState<Shop[]>([]);
  const [suppliers, setSuppliers] = useState<DeliverySupplier[]>([]);
  const [receipts, setReceipts] = useState<DeliveryReceipt[]>([]);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receiptTarget, setReceiptTarget] = useState<{ supplier: DeliverySupplier; receipt?: DeliveryReceipt } | null>(null);
  const [supplierTarget, setSupplierTarget] = useState<{ shop: Shop; supplier?: DeliverySupplier } | null>(null);

  const load = async () => {
    const nowKey = moscowDateKey();
    setToday(nowKey);
    setLoading(true);
    setError('');
    try {
      const [shopList, board] = await Promise.all([
        api.shops.list(session.token),
        api.deliveries.board(session.token, monthRange(nowKey)),
      ]);
      setShops(shopList);
      setSuppliers(board.suppliers);
      setReceipts(board.receipts);
      setLoadedAt(new Date());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [session.token]);

  const receiptsByKey = useMemo(
    () => new Map(receipts.map((receipt) => [receiptKey(receipt.supplierId, receipt.date), receipt])),
    [receipts],
  );

  const sections = useMemo(() => {
    const now = loadedAt ?? new Date();
    return shops.map((shop) => {
      const shopSuppliers = suppliers
        .filter((supplier) => supplier.shopId === shop.id)
        .sort((a, b) => a.windowStartMinutes - b.windowStartMinutes || a.name.localeCompare(b.name, 'ru'));
      const cards: CardModel[] = [];
      const idle: DeliverySupplier[] = [];
      for (const supplier of shopSuppliers) {
        if (!isDeliveryDay(supplier, today)) {
          idle.push(supplier);
          continue;
        }
        const receipt = receiptsByKey.get(receiptKey(supplier.id, today));
        cards.push({ supplier, status: deliveryStatus(supplier, today, receipt, now), receipt });
      }
      return { shop, cards, idle, counts: countDeliveryStatuses(cards.map((card) => card.status)) };
    });
  }, [shops, suppliers, receiptsByKey, today, loadedAt]);

  const monthReport = useMemo(
    () => buildDeliveryMonthReport({ shops, suppliers, receipts, today, now: loadedAt ?? new Date() }),
    [shops, suppliers, receipts, today, loadedAt],
  );

  const total = useMemo(
    () => (period === 'today' ? countDeliveryStatuses(sections.flatMap((section) => section.cards.map((card) => card.status))) : monthReport.counts),
    [period, sections, monthReport],
  );

  const openCard = (card: CardModel) => {
    setReceiptTarget({ supplier: card.supplier, receipt: card.receipt });
  };

  const afterChange = async (message: string) => {
    setReceiptTarget(null);
    setSupplierTarget(null);
    setNotice(message);
    await load();
  };

  const updatedText = loadedAt ? ` · обновлено в ${formatClockMinutes(moscowMinutes(loadedAt))}` : '';

  return (
    <section className="page-section deliveries-page">
      <div className="deliveries-head">
        <small>{period === 'today' ? headerDate(today) : monthTitle(today)}{updatedText}</small>
        <div className="deliveries-title-row">
          <h2>Приёмка</h2>
          <div className="deliveries-period" role="tablist" aria-label="Период">
            <button type="button" role="tab" aria-selected={period === 'today'} className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')}>Сегодня</button>
            <button type="button" role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>За месяц</button>
          </div>
          <button type="button" className="secondary deliveries-refresh" onClick={() => void load()}>Обновить</button>
        </div>
      </div>
      <Feedback error={error} notice={notice} />
      <div className="deliveries-summary">
        <SummaryCard tone="ok" label="Принято вовремя" value={total.on_time} />
        <SummaryCard tone="late" label="Опоздания поставщиков" value={total.late} />
        <SummaryCard tone="bad" label="Не отмечено / без фото" value={total.missed + total.no_photo} />
        <SummaryCard tone="wait" label="Ожидается" value={total.expected} />
      </div>
      {loading && !loadedAt ? <p>Загружаем приёмку...</p> : period === 'month' ? <DeliveriesMonthReport report={monthReport} /> : (
        <div className="deliveries-shops">
          {sections.map(({ shop, cards, idle, counts }) => (
            <article key={shop.id} className="deliveries-shop">
              <header>
                <h3>{shop.name}</h3>
                <span className="deliveries-shop-stats">
                  {deliveryAcceptedCount(counts)} из {cards.length} принято · проблем: {deliveryProblemCount(counts)}
                </span>
                <button type="button" className="ghost deliveries-add" onClick={() => setSupplierTarget({ shop })}>+ Поставщик</button>
              </header>
              <div className="deliveries-cards">
                {cards.map((card) => (
                  <button
                    type="button"
                    key={card.supplier.id}
                    className={`delivery-card status-${card.status}`}
                    onClick={() => openCard(card)}
                    title={card.supplier.name}
                  >
                    <span className="delivery-card-top">
                      <strong>{card.supplier.name}</strong>
                      <span>{formatClockMinutes(card.supplier.windowStartMinutes)}–{formatClockMinutes(card.supplier.windowEndMinutes)}</span>
                    </span>
                    <span className="delivery-card-bottom">
                      <span className={`delivery-status status-${card.status}`}>{STATUS_LABELS[card.status]}</span>
                      {card.receipt && <span className="delivery-time">{clockOf(card.receipt.receivedAt)}</span>}
                    </span>
                  </button>
                ))}
                {!cards.length && (
                  <p className="deliveries-empty">
                    {suppliers.some((supplier) => supplier.shopId === shop.id) ? 'Сегодня поставок нет.' : 'Поставщики не добавлены.'}
                  </p>
                )}
              </div>
              {idle.length > 0 && (
                <p className="deliveries-idle">
                  Не сегодня:{' '}
                  {idle.map((supplier, index) => (
                    <React.Fragment key={supplier.id}>
                      {index > 0 && ', '}
                      <button type="button" className="link-button" onClick={() => setSupplierTarget({ shop, supplier })}>{supplier.name}</button>
                    </React.Fragment>
                  ))}
                </p>
              )}
            </article>
          ))}
          {!shops.length && <p className="deliveries-empty">Магазинов нет.</p>}
        </div>
      )}
      {receiptTarget && (
        <ReceiptModal
          session={session}
          date={today}
          supplier={receiptTarget.supplier}
          receipt={receiptTarget.receipt}
          onClose={() => setReceiptTarget(null)}
          onSaved={afterChange}
          onEditSupplier={() => {
            const shop = shops.find((item) => item.id === receiptTarget.supplier.shopId);
            setReceiptTarget(null);
            if (shop) setSupplierTarget({ shop, supplier: receiptTarget.supplier });
          }}
        />
      )}
      {supplierTarget && (
        <SupplierModal
          session={session}
          shop={supplierTarget.shop}
          supplier={supplierTarget.supplier}
          onClose={() => setSupplierTarget(null)}
          onSaved={afterChange}
        />
      )}
    </section>
  );
};

const SummaryCard = ({ tone, label, value }: { tone: 'ok' | 'late' | 'bad' | 'wait'; label: string; value: number }) => (
  <div className={`deliveries-summary-card tone-${tone}`}>
    <span><i aria-hidden="true" />{label}</span>
    <strong>{value}</strong>
  </div>
);

const ReceiptModal = ({
  session,
  date,
  supplier,
  receipt,
  onClose,
  onSaved,
  onEditSupplier,
}: {
  session: Session;
  date: string;
  supplier: DeliverySupplier;
  receipt?: DeliveryReceipt;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onEditSupplier: () => void;
}) => {
  const [time, setTime] = useState(() => toTimeInput(receipt ? moscowMinutes(new Date(receipt.receivedAt)) : moscowMinutes()));
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!receipt?.hasInvoicePhoto) return;
    let url = '';
    let cancelled = false;
    api.deliveries.invoicePhoto(session.token, supplier.id, date)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      })
      .catch((err) => !cancelled && setError(messageOf(err)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [receipt?.hasInvoicePhoto, supplier.id, date, session.token]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = parseClockMinutes(time);
    if (minutes === null) {
      setError('Укажите время приёмки.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.deliveries.saveReceipt(session.token, {
        supplierId: supplier.id,
        date,
        receivedAt: moscowDateTimeToIso(date, minutes),
        photo,
        removePhoto: removePhoto && !photo,
      });
      await onSaved(`Приёмка «${supplier.name}» сохранена.`);
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!window.confirm(`Снять отметку приёмки «${supplier.name}»?`)) return;
    setSaving(true);
    try {
      await api.deliveries.deleteReceipt(session.token, supplier.id, date);
      await onSaved(`Отметка «${supplier.name}» снята.`);
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  };

  return (
    <Modal title={`${supplier.name} · ${formatClockMinutes(supplier.windowStartMinutes)}–${formatClockMinutes(supplier.windowEndMinutes)}`} onClose={onClose}>
      <form className="deliveries-form" onSubmit={save}>
        <Feedback error={error} />
        <label>
          Время приёмки
          <input type="time" step={60} value={time} onChange={(event) => setTime(event.target.value)} required />
        </label>
        <label>
          Фото накладной
          <input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
        </label>
        {receipt?.hasInvoicePhoto && !photo && (
          <div className="deliveries-photo">
            {photoUrl && !removePhoto ? <a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt="Фото накладной" /></a> : null}
            <label className="deliveries-check">
              <input type="checkbox" checked={removePhoto} onChange={(event) => setRemovePhoto(event.target.checked)} />
              Удалить фото
            </label>
          </div>
        )}
        <div className="deliveries-form-actions">
          <button disabled={saving}>{receipt ? 'Сохранить' : 'Принято'}</button>
          {receipt && <button type="button" className="secondary" disabled={saving} onClick={() => void clear()}>Снять отметку</button>}
          <button type="button" className="ghost" onClick={onEditSupplier}>Изменить поставщика</button>
        </div>
      </form>
    </Modal>
  );
};

const SupplierModal = ({
  session,
  shop,
  supplier,
  onClose,
  onSaved,
}: {
  session: Session;
  shop: Shop;
  supplier?: DeliverySupplier;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) => {
  const [name, setName] = useState(supplier?.name ?? '');
  const [start, setStart] = useState(toTimeInput(supplier?.windowStartMinutes ?? 7 * 60));
  const [end, setEnd] = useState(toTimeInput(supplier?.windowEndMinutes ?? 8 * 60));
  const [weekdays, setWeekdays] = useState<number[]>(supplier?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (day: number) =>
    setWeekdays((days) => (days.includes(day) ? days.filter((item) => item !== day) : [...days, day]));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const windowStartMinutes = parseClockMinutes(start);
    const windowEndMinutes = parseClockMinutes(end);
    if (windowStartMinutes === null || windowEndMinutes === null || windowEndMinutes <= windowStartMinutes) {
      setError('Окно доставки должно заканчиваться позже, чем начинается.');
      return;
    }
    if (!weekdays.length) {
      setError('Выберите хотя бы один день недели.');
      return;
    }
    const payload: DeliverySupplierInput = { name: name.trim(), windowStartMinutes, windowEndMinutes, weekdays };
    setSaving(true);
    setError('');
    try {
      if (supplier) await api.deliveries.updateSupplier(session.token, supplier.id, payload);
      else await api.deliveries.createSupplier(session.token, { ...payload, shopId: shop.id });
      await onSaved(`Поставщик «${payload.name}» сохранён.`);
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!supplier || !window.confirm(`Удалить поставщика «${supplier.name}» из магазина ${shop.name}? Отметки приёмки тоже удалятся.`)) return;
    setSaving(true);
    try {
      await api.deliveries.deleteSupplier(session.token, supplier.id);
      await onSaved(`Поставщик «${supplier.name}» удалён.`);
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  };

  return (
    <Modal title={`${supplier ? 'Поставщик' : 'Новый поставщик'} · ${shop.name}`} onClose={onClose}>
      <form className="deliveries-form" onSubmit={save}>
        <Feedback error={error} />
        <label>
          Поставщик
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Например, Молочный двор" required />
        </label>
        <div className="deliveries-window">
          <label>
            Окно с
            <input type="time" step={300} value={start} onChange={(event) => setStart(event.target.value)} required />
          </label>
          <label>
            до
            <input type="time" step={300} value={end} onChange={(event) => setEnd(event.target.value)} required />
          </label>
        </div>
        <div className="deliveries-weekdays" role="group" aria-label="Дни поставки">
          {WEEKDAYS.map(({ day, label }) => (
            <label key={day} className={weekdays.includes(day) ? 'active' : ''}>
              <input type="checkbox" checked={weekdays.includes(day)} onChange={() => toggleDay(day)} />
              {label}
            </label>
          ))}
        </div>
        <div className="deliveries-form-actions">
          <button disabled={saving}>{supplier ? 'Сохранить' : 'Добавить'}</button>
          {supplier && <button type="button" className="danger" disabled={saving} onClick={() => void remove()}>Удалить</button>}
        </div>
      </form>
    </Modal>
  );
};
