import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Feedback, Modal, NumberInput, PageHeader, RefreshButton } from '../../components/ui';
import {
  DASHBOARD_COLUMNS,
  MAX_ORDER_VALUE_LEN,
  PRODUCT_CATEGORIES,
  WEEK_DAYS,
  type DashboardColumnKey,
  type DashboardManualOrderKey,
} from '../../dashboardConfig';
import { addDays, formatDateLabel, getTwoWeeksEnd, startOfWeek } from '../../dateUtils';
import { buildCsv, safeFileName } from '../../export/csv';
import {
  buildDashboardRowValues,
  dashboardHeaderSubtitle,
  deriveDashboardWeeks,
  type DashboardWeeks,
  isManualOrderKey,
  isManualStockKey,
  productReferenceLabel,
  productToForm,
  sanitizeOrderValue,
  sanitizeStock,
} from '../../domain/inventory/dashboard';
import { intOrZero, messageOf, normalizeText, numberOrZero } from '../../shared/format';
import type { Product, ProductCategory, ProductPayload, Session, Shop, StockTable } from '../../types';

export const ProductsPanel = ({ session }: { session: Session }) => {
  const currentWeekStart = startOfWeek();
  const [shops, setShops] = useState<Shop[]>([]);
  const [table, setTable] = useState<StockTable | null>(null);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [query, setQuery] = useState('');
  const [windowStart, setWindowStart] = useState(currentWeekStart);
  const [orderValues, setOrderValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ProductPayload>(productToForm());
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ productId: string; date: string; productName: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (shopId = selectedShopId, nextWindowStart = windowStart) => {
    setLoading(true);
    setError('');
    try {
      const nextShops = await api.shops.list(session.token);
      setShops(nextShops);
      const resolvedShopId = shopId || nextShops[0]?.id || '';
      setSelectedShopId(resolvedShopId);
      if (!resolvedShopId) {
        setTable(null);
        return;
      }

      const dashboardFrom = addDays(nextWindowStart, -WEEK_DAYS);
      const from = dashboardFrom;
      const to = getTwoWeeksEnd(dashboardFrom);
      const nextTable = await api.stock.table(session.token, { shopId: resolvedShopId, from, to });
      setTable(nextTable);

      try {
        const loaded: Record<string, string> = {};
        const orderValuesTo = addDays(to, 2);
        const nextOrderValues = await api.stock.listShopOrderValues(session.token, resolvedShopId, from, orderValuesTo);
        for (const entry of nextOrderValues) {
          loaded[`${entry.productId}:${entry.orderDate}`] = String(entry.packs);
        }
        setOrderValues(loaded);
      } catch {
        setOrderValues({});
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token, selectedShopId, windowStart]);

  const visibleRows = useMemo(() => {
    const normalized = normalizeText(query);
    return (table?.rows ?? []).filter((row) => !normalized || normalizeText(row.name).includes(normalized));
  }, [query, table]);

  const rowsByCategory = useMemo(() => {
    const grouped = PRODUCT_CATEGORIES.reduce((acc, category) => {
      acc[category] = [] as Product[];
      return acc;
    }, {} as Record<ProductCategory, Product[]>);
    for (const row of visibleRows) {
      const category = PRODUCT_CATEGORIES.includes(row.category) ? row.category : PRODUCT_CATEGORIES[0];
      grouped[category].push(row);
    }
    return grouped;
  }, [visibleRows]);

  const dashboardWeeks: DashboardWeeks = useMemo(
    () => (table ? deriveDashboardWeeks(table.dates) : { current: {}, previous: null, currentStart: undefined, previousStart: undefined }),
    [table],
  );

  const orderDateForKey = (key: DashboardManualOrderKey): string | undefined => {
    if (key === 'orderPackThu') return dashboardWeeks.current.thu;
    if (key === 'orderPackSat') return dashboardWeeks.current.thu ? addDays(dashboardWeeks.current.thu, 2) : undefined;
    if (key === 'orderPackTue') return dashboardWeeks.current.sun ? addDays(dashboardWeeks.current.sun, 2) : undefined;
    return undefined;
  };

  const orderPacksForDate = (productId: string, date?: string): string => (date ? orderValues[`${productId}:${date}`] ?? '' : '');
  const orderCellValue = (productId: string, key: DashboardManualOrderKey): string => orderPacksForDate(productId, orderDateForKey(key));

  const rowValuesFor = (row: Product) =>
    buildDashboardRowValues({
      row,
      weeks: dashboardWeeks,
      orderPacks: orderPacksForDate,
    });

  const setOrderCellValue = (productId: string, key: DashboardManualOrderKey, value: string) => {
    const date = orderDateForKey(key);
    if (!date || !selectedShopId) {
      return;
    }
    const nextValue = sanitizeOrderValue(value);
    setOrderValues((current) => ({ ...current, [`${productId}:${date}`]: nextValue }));
    const packs = nextValue ? Number.parseInt(nextValue, 10) : 0;
    void api.stock.updateOrderValue(session.token, {
      shopId: selectedShopId,
      productId,
      orderDate: date,
      packs: Number.isNaN(packs) ? 0 : packs,
    }).catch((err) => setError(messageOf(err)));
  };

  const currentStockDateForColumn = (key: DashboardColumnKey): string | undefined => {
    if (key === 'currentTue') return dashboardWeeks.current.tue;
    if (key === 'currentWed') return dashboardWeeks.current.wed;
    if (key === 'currentThu') return dashboardWeeks.current.thu;
    if (key === 'currentFri') return dashboardWeeks.current.fri;
    if (key === 'currentSun') return dashboardWeeks.current.sun;
    if (key === 'currentMon') return dashboardWeeks.current.mon;
    return undefined;
  };

  const updateCalendarCell = (productId: string, date: string, value: string) => {
    setTable((current) => current
      ? { ...current, rows: current.rows.map((row) => row.productId === productId ? { ...row, values: { ...row.values, [date]: sanitizeStock(value) } } : row) }
      : current);
  };

  const saveStockCell = async (productId: string, date: string, value: string) => {
    if (!selectedShopId) {
      return;
    }
    try {
      const sanitized = sanitizeStock(value);
      await api.stock.updateValue(session.token, { shopId: selectedShopId, productId, date, value: sanitized });
      updateCalendarCell(productId, date, sanitized);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const openEditCell = (row: Product, date: string) => {
    setEditingCell({ productId: row.productId, date, productName: row.name });
    setEditingValue(row.values[date] ?? '');
  };

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.stock.createProduct(session.token, { ...form, name: form.name.trim(), packType: form.packType.trim() });
      setForm(productToForm());
      setIsAddProductOpen(false);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const removeProduct = async (product: Product) => {
    if (!window.confirm(`Удалить товар ${product.name}?`)) {
      return;
    }
    try {
      await api.stock.deleteProduct(session.token, product.productId);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const exportDashboard = () => {
    if (!table) {
      return;
    }
    const headers = [
      'Категория',
      'Товар',
      'Упаковка',
      'Количество в упаковке',
      'Вес упаковки, кг',
      'Срок годности, сут',
      'Цена в руб, с НДС',
      ...DASHBOARD_COLUMNS.map((column) => {
        const subtitle = dashboardHeaderSubtitle(dashboardWeeks, column).replace('\n', ' ');
        return subtitle ? `${column.title} (${subtitle})` : column.title;
      }),
    ];
    const rows = PRODUCT_CATEGORIES.flatMap((category) => rowsByCategory[category]).map((row) => {
      const values = rowValuesFor(row);
      return [
        row.category,
        row.name,
        row.packType ?? '',
        row.unitsInPack !== null ? String(row.unitsInPack) : '',
        row.packWeightKg !== null ? String(row.packWeightKg) : '',
        row.shelfLifeDays !== null ? String(row.shelfLifeDays) : '',
        row.unitPriceRubVat !== null && row.unitPriceRubVat !== undefined ? String(row.unitPriceRubVat) : '',
        ...DASHBOARD_COLUMNS.map((column) => values[column.key] ?? ''),
      ];
    });
    const blob = new Blob([`\uFEFF${buildCsv([headers, ...rows])}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`manager_dashboard_${table.shop.name}_${table.from}_${table.to}`)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderDashboardCategory = (category: ProductCategory, rows: Product[]) => (
    <section key={category} className="manager-category-block">
      <div className="manager-category-title">{category}</div>
      <div className="manager-table-scroll">
        <table className="manager-stock-table manager-dashboard-table">
          <colgroup>
            <col className="manager-name-col-width" />
            {DASHBOARD_COLUMNS.map((column) => (
              <col key={column.key} className="dashboard-data-col-width" />
            ))}
            <col className="manager-action-col-width" />
          </colgroup>
          <thead>
            <tr>
              <th className="manager-name-col dashboard-name-header">Товар</th>
              {DASHBOARD_COLUMNS.map((column) => (
                <th key={column.key} className={`dashboard-col-${column.kind} dashboard-tone-${column.tone}`}>
                  <span className={column.kind === 'stock' ? 'dashboard-title-stock' : ''}>{column.title}</span>
                  {dashboardHeaderSubtitle(dashboardWeeks, column) && <small>{dashboardHeaderSubtitle(dashboardWeeks, column)}</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={DASHBOARD_COLUMNS.length + 1} className="manager-empty-row">Нет товаров в этой таблице</td></tr>
            ) : rows.map((row) => {
              const values = rowValuesFor(row);
              return (
                <tr key={row.productId}>
                  <td className="manager-name-col">
                    <strong>{row.name}</strong>
                    <small>{productReferenceLabel(row)}</small>
                  </td>
                  {DASHBOARD_COLUMNS.map((column) => {
                    const value = values[column.key] ?? '';
                    if (column.kind === 'order' && isManualOrderKey(column.key)) {
                      const manualOrderKey = column.key;
                      return (
                        <td key={column.key} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                          <input
                            className="dashboard-order-input"
                            value={value}
                            maxLength={MAX_ORDER_VALUE_LEN}
                            placeholder="-"
                            onChange={(event) => setOrderCellValue(row.productId, manualOrderKey, event.target.value)}
                          />
                        </td>
                      );
                    }
                    if (column.kind === 'stock' && isManualStockKey(column.key)) {
                      const date = currentStockDateForColumn(column.key);
                      return (
                        <td key={column.key} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                          <button className="stock-cell-button" onClick={() => date && openEditCell(row, date)}>
                            {value || '-'}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={column.key} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                        <span className={column.kind === 'stock' ? 'dashboard-stock-value' : column.kind === 'order' ? 'dashboard-order-value' : ''}>
                          {value || '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section className="page-section stock-page-section">
      <PageHeader title="Остатки" subtitle="Менеджерская таблица остатков, заказов и продаж по магазину." action={<RefreshButton onClick={() => load()} />} />
      <Feedback error={error} />

      <div className="manager-controls">
        <input className="manager-search" placeholder="Поиск товара" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="manager-button-row">
          <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)}>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
          <button className="secondary" onClick={() => setWindowStart((current) => addDays(current, -WEEK_DAYS))}>-1 нед.</button>
          <button className="secondary" onClick={() => setWindowStart(startOfWeek())}>Текущая нед.</button>
          <button className="secondary" onClick={() => setWindowStart((current) => addDays(current, WEEK_DAYS))}>+1 нед.</button>
          <button onClick={() => setIsAddProductOpen(true)}>Добавить товар</button>
          <button className="secondary" onClick={exportDashboard}>Экспорт в Excel</button>
        </div>
      </div>

      <div className="manager-meta-row">
        <strong>Позиций: {visibleRows.length}</strong>
        <strong>{table ? `${windowStart} - ${addDays(windowStart, WEEK_DAYS - 1)}` : ''}</strong>
      </div>

      <div className="manager-table-wrap">
        {loading ? <p className="manager-loading">Загружаем остатки...</p> : PRODUCT_CATEGORIES.map((category) =>
          renderDashboardCategory(category, rowsByCategory[category]),
        )}
      </div>

      {isAddProductOpen && (
        <Modal title="Добавить товар" onClose={() => setIsAddProductOpen(false)}>
          <form className="modal-form product-modal-form" onSubmit={createProduct}>
            <input placeholder="Название товара" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ProductCategory })}>
              {PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <input placeholder="Тип упаковки" value={form.packType} onChange={(event) => setForm({ ...form, packType: event.target.value })} />
            <NumberInput label="Штук в упаковке" value={form.unitsInPack} onChange={(value) => setForm({ ...form, unitsInPack: intOrZero(value) })} />
            <NumberInput label="Вес упаковки, кг" value={form.packWeightKg} onChange={(value) => setForm({ ...form, packWeightKg: numberOrZero(value) })} />
            <NumberInput label="Срок годности, дней" value={form.shelfLifeDays} onChange={(value) => setForm({ ...form, shelfLifeDays: intOrZero(value) })} />
            <NumberInput label="Цена с НДС, руб" value={form.unitPriceRubVat} onChange={(value) => setForm({ ...form, unitPriceRubVat: numberOrZero(value) })} />
            <NumberInput label="Минимальный остаток" value={form.minStockUnits} onChange={(value) => setForm({ ...form, minStockUnits: intOrZero(value) })} />
            <NumberInput label="Максимальный остаток" value={form.maxStockUnits} onChange={(value) => setForm({ ...form, maxStockUnits: intOrZero(value) })} />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setIsAddProductOpen(false)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}

      {editingCell && (
        <Modal title="Изменить остаток" onClose={() => setEditingCell(null)}>
          <form className="modal-form" onSubmit={(event) => {
            event.preventDefault();
            void saveStockCell(editingCell.productId, editingCell.date, editingValue).then(() => setEditingCell(null));
          }}>
            <p className="modal-meta">{editingCell.productName} · {formatDateLabel(editingCell.date)}</p>
            <input autoFocus placeholder="0-15" value={editingValue} onChange={(event) => setEditingValue(sanitizeStock(event.target.value))} />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditingCell(null)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
};
