import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback, Modal, NumberInput, PageHeader, RefreshButton } from '../../components/ui';
import {
  BUSINESS_CATEGORIES,
  DASHBOARD_COLUMNS,
  DEFAULT_BUSINESS_CATEGORY,
  DEFAULT_PRODUCT_CATEGORY,
  MAX_ORDER_VALUE_LEN,
  PRODUCT_CATEGORIES,
  WEEK_DAYS,
  type DashboardColumnKey,
  type DashboardManualOrderKey,
} from '../../dashboardConfig';
import { addDays, formatDateLabel, formatDateShort, getTwoWeeksEnd, isDelicaciesOrderDate, nearestDelicaciesOrderDate, parseDateKey, startOfWeek } from '../../dateUtils';
import { buildCsv, safeFileName } from '../../export/csv';
import {
  buildDashboardRowValues,
  computeDashboardSold,
  computeSold,
  dashboardHeaderSubtitle,
  deriveDashboardWeeks,
  type DashboardWeeks,
  isManualOrderKey,
  isManualStockKey,
  orderUnitsFromPacks,
  productReferenceLabel,
  productToForm,
  sanitizeOrderValue,
  sanitizeStock,
} from '../../domain/inventory/dashboard';
import { intOrZero, messageOf, normalizeText, numberOrZero } from '../../shared/format';
import type { Product, ProductCategory, ProductPayload, Session, Shop, StockTable } from '../../types';
import type { BusinessCategory } from '../../types';
import { isBreadSectionBreakProduct, managerProductName } from '../../../../shared/product-display';
import { sortProductsLikeImage } from '../../productOrdering';

type LoadedWeekRange = {
  from: string;
  to: string;
};

const buildDateRange = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
};

const viewDatesForWindowStart = (weekStart: string): string[] => {
  const from = addDays(weekStart, -WEEK_DAYS);
  return buildDateRange(from, getTwoWeeksEnd(from));
};

const bufferedWeekStartsFor = (weekStart: string): string[] => [
  weekStart,
  addDays(weekStart, WEEK_DAYS),
];

const isTuesday = (date: string): boolean => parseDateKey(date).getDay() === 2;

const visibleStockRangeForWindowStart = (weekStart: string): LoadedWeekRange => ({
  from: addDays(weekStart, -WEEK_DAYS),
  to: addDays(weekStart, WEEK_DAYS * 2 - 1),
});

const rangeFromDates = (dates: Array<string | undefined>, fallback: LoadedWeekRange): LoadedWeekRange => {
  const sortedDates = dates.filter((date): date is string => Boolean(date)).sort();
  return {
    from: sortedDates[0] && sortedDates[0] < fallback.from ? sortedDates[0] : fallback.from,
    to: sortedDates[sortedDates.length - 1] && sortedDates[sortedDates.length - 1] > fallback.to
      ? sortedDates[sortedDates.length - 1]
      : fallback.to,
  };
};

const dashboardFormulaStockRangeForWindowStart = (weekStart: string): LoadedWeekRange => {
  const visibleRange = visibleStockRangeForWindowStart(weekStart);
  const formulaDates = bufferedWeekStartsFor(weekStart).flatMap((start) => {
    const weeks = deriveDashboardWeeks(viewDatesForWindowStart(start));
    const previousSundayBeforeWeek = weeks.previous?.mon ? addDays(weeks.previous.mon, -1) : undefined;
    return [
      previousSundayBeforeWeek,
      weeks.previous?.mon,
      weeks.previous?.tue,
      weeks.previous?.wed,
      weeks.previous?.thu,
      weeks.previous?.fri,
      weeks.previous?.sun,
      weeks.current.mon,
      weeks.current.tue,
      weeks.current.wed,
      weeks.current.thu,
      weeks.current.fri,
      weeks.current.sun,
    ];
  });
  return rangeFromDates(formulaDates, visibleRange);
};

const dashboardFormulaOrderRangeForWindowStart = (weekStart: string): LoadedWeekRange => {
  const stockRange = dashboardFormulaStockRangeForWindowStart(weekStart);
  const formulaDates = bufferedWeekStartsFor(weekStart).flatMap((start) => {
    const weeks = deriveDashboardWeeks(viewDatesForWindowStart(start));
    return [
      weeks.previous?.tue,
      weeks.previous?.thu,
      weeks.previous?.thu ? addDays(weeks.previous.thu, 2) : undefined,
      weeks.current.tue,
      weeks.current.thu,
      weeks.current.thu ? addDays(weeks.current.thu, 2) : undefined,
      weeks.current.sun ? addDays(weeks.current.sun, 2) : undefined,
    ];
  });
  return rangeFromDates(formulaDates, stockRange);
};

const dailyFormulaStockRangeForWindowStart = (weekStart: string): LoadedWeekRange => {
  const range = visibleStockRangeForWindowStart(weekStart);
  return { ...range, from: addDays(range.from, -1) };
};

const dailyOrderDateForStockDate = (date: string, businessCategory: BusinessCategory): string =>
  businessCategory === 'Деликатесы' && !isDelicaciesOrderDate(date)
    ? nearestDelicaciesOrderDate(date)
    : date;

const orderHeaderDateForStockDate = (date: string, businessCategory: BusinessCategory): string =>
  addDays(dailyOrderDateForStockDate(date, businessCategory), 1);

const dailyFormulaOrderRangeForWindowStart = (weekStart: string, businessCategory: BusinessCategory): LoadedWeekRange => {
  const stockRange = dailyFormulaStockRangeForWindowStart(weekStart);
  const orderDates = buildDateRange(stockRange.from, stockRange.to).map((date) => dailyOrderDateForStockDate(date, businessCategory));
  return rangeFromDates(orderDates, stockRange);
};

const stockFetchRangeForWindowStart = (weekStart: string, businessCategory: BusinessCategory): LoadedWeekRange => {
  return businessCategory === 'Молоко'
    ? dashboardFormulaStockRangeForWindowStart(weekStart)
    : dailyFormulaStockRangeForWindowStart(weekStart);
};

const orderFetchRangeForWindowStart = (weekStart: string, businessCategory: BusinessCategory): LoadedWeekRange => {
  if (businessCategory === 'Молоко') {
    return dashboardFormulaOrderRangeForWindowStart(weekStart);
  }
  return dailyFormulaOrderRangeForWindowStart(weekStart, businessCategory);
};

const startsNewSubcategory = <T extends { category: string }>(rows: T[], index: number): boolean =>
  index > 0 && rows[index - 1]?.category !== rows[index]?.category;

const moveGridFocus = (input: HTMLInputElement, delta: number) => {
  const column = input.dataset.gridCol;
  const table = input.closest('table');
  if (!column || !table) return;
  const cells = Array.from(table.querySelectorAll<HTMLInputElement>('input[data-grid-col]'))
    .filter((cell) => cell.dataset.gridCol === column && !cell.disabled);
  const target = cells[cells.indexOf(input) + delta];
  if (target) {
    target.focus();
    target.select();
  } else if (delta > 0) {
    input.blur();
  }
};

const handleGridKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault();
    moveGridFocus(event.currentTarget, 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveGridFocus(event.currentTarget, -1);
  }
};

const StockCellInput = ({
  value,
  gridCol,
  label,
  onCommit,
}: {
  value: string;
  gridCol: string;
  label: string;
  onCommit: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const focused = useRef(false);

  useEffect(() => {
    committed.current = value;
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft === committed.current) return;
    committed.current = draft;
    onCommit(draft);
  };

  return (
    <input
      className="dashboard-order-input stock-cell-input"
      data-grid-col={gridCol}
      aria-label={label}
      inputMode="numeric"
      value={draft}
      placeholder="-"
      maxLength={2}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(event) => setDraft(sanitizeStock(event.target.value))}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(committed.current);
          return;
        }
        if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') commit();
        handleGridKeyDown(event);
      }}
    />
  );
};

export const ProductsPanel = ({ session }: { session: Session }) => {
  const currentWeekStart = startOfWeek();
  const [activeBusinessCategory, setActiveBusinessCategory] = useState<BusinessCategory>(DEFAULT_BUSINESS_CATEGORY);
  const [shops, setShops] = useState<Shop[]>([]);
  const [table, setTable] = useState<StockTable | null>(null);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [query, setQuery] = useState('');
  const [windowStart, setWindowStart] = useState(currentWeekStart);
  const [loadedRange, setLoadedRange] = useState<LoadedWeekRange | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [orderValues, setOrderValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ProductPayload>(productToForm());
  const [subcategories, setSubcategories] = useState<Record<BusinessCategory, string[]>>({
    Хлеб: [],
    Молоко: [...PRODUCT_CATEGORIES],
    Деликатесы: [],
    Сыр: [],
    Мороженое: [],
    Курица: [],
  });
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const centeredWeekRef = useRef('');

  const load = async (shopId = selectedShopId, nextWindowStart = windowStart, force = false) => {
    const cachedShopId = shopId || shops[0]?.id || '';
    const cachedLoadedKey = cachedShopId ? `${cachedShopId}:${activeBusinessCategory}` : '';
    const targetRange = stockFetchRangeForWindowStart(nextWindowStart, activeBusinessCategory);
    if (!force && cachedLoadedKey && table && loadedKey === cachedLoadedKey && loadedRange && loadedRange.from === targetRange.from && loadedRange.to === targetRange.to) {
      return;
    }

    const hasCurrentTable = Boolean(table);
    setLoading(!hasCurrentTable);
    setLoadingMore(hasCurrentTable);
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

      const nextLoadedKey = `${resolvedShopId}:${activeBusinessCategory}`;
      const canUseLoadedRange = loadedKey === nextLoadedKey;
      if (!force && table && canUseLoadedRange && loadedRange && loadedRange.from === targetRange.from && loadedRange.to === targetRange.to) {
        return;
      }

      const from = targetRange.from;
      const to = targetRange.to;
      const nextTable = await api.stock.table(session.token, { shopId: resolvedShopId, businessCategory: activeBusinessCategory, from, to });
      setTable(nextTable);
      setLoadedRange(targetRange);
      setLoadedKey(nextLoadedKey);
      const nextSubcategories = await api.stock.listSubcategories(session.token);
      setSubcategories(nextSubcategories);

      try {
        const loaded: Record<string, string> = {};
        const orderRange = orderFetchRangeForWindowStart(nextWindowStart, activeBusinessCategory);
        const nextOrderValues = await api.stock.listShopOrderValues(
          session.token,
          resolvedShopId,
          orderRange.from,
          orderRange.to,
          activeBusinessCategory,
        );
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
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(selectedShopId, windowStart);
  }, [session.token, selectedShopId, windowStart, activeBusinessCategory]);

  const loadedDates = useMemo(() => {
    const range = visibleStockRangeForWindowStart(windowStart);
    return buildDateRange(range.from, range.to);
  }, [windowStart]);
  const dashboardWeekStarts = useMemo(() => bufferedWeekStartsFor(windowStart), [windowStart]);
  const activeViewDates = useMemo(() => viewDatesForWindowStart(windowStart), [windowStart]);

  const visibleRows = useMemo(() => {
    const normalized = normalizeText(query);
    return (table?.rows ?? []).filter((row) => !normalized || normalizeText(row.name).includes(normalized));
  }, [query, table]);

  const orderedRows = useMemo(() => sortProductsLikeImage(visibleRows), [visibleRows]);

  const activeSubcategories = useMemo(
    () => table?.subcategories?.length ? table.subcategories : subcategories[activeBusinessCategory] ?? [DEFAULT_PRODUCT_CATEGORY],
    [activeBusinessCategory, subcategories, table?.subcategories],
  );

  const isMilkTable = activeBusinessCategory === 'Молоко';
  const usesEveningStockHeaders = activeBusinessCategory === 'Хлеб' || activeBusinessCategory === 'Деликатесы' || activeBusinessCategory === 'Сыр';

  const dashboardWeeks: DashboardWeeks = useMemo(
    () => (table ? deriveDashboardWeeks(activeViewDates) : { current: {}, previous: null, currentStart: undefined, previousStart: undefined }),
    [activeViewDates, table],
  );
  const dashboardWeeksForStart = (weekStart: string): DashboardWeeks => deriveDashboardWeeks(viewDatesForWindowStart(weekStart));

  useEffect(() => {
    const scroller = tableScrollRef.current;
    if (!scroller || !table || centeredWeekRef.current === windowStart) {
      return;
    }
    const currentWeekCell = scroller.querySelector<HTMLElement>(`[data-week-start="${windowStart}"]`);
    if (currentWeekCell) {
      scroller.scrollLeft = Math.max(0, currentWeekCell.offsetLeft - 160);
      centeredWeekRef.current = windowStart;
    }
  }, [table, windowStart]);

  useEffect(() => {
    const scroller = tableScrollRef.current;
    const tableElement = scroller?.querySelector('table');
    if (!scroller || !tableElement) {
      setTableScrollWidth(0);
      return;
    }

    const updateScrollWidth = () => setTableScrollWidth(tableElement.scrollWidth);
    updateScrollWidth();

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollWidth);
    resizeObserver?.observe(tableElement);
    resizeObserver?.observe(scroller);
    window.addEventListener('resize', updateScrollWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateScrollWidth);
    };
  }, [activeBusinessCategory, dashboardWeekStarts, loadedDates, orderedRows, table]);

  const syncScrollLeft = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (!source || !target || source.scrollLeft === target.scrollLeft) {
      return;
    }
    target.scrollLeft = source.scrollLeft;
  };

  const renderTopScrollbar = () => (
    <div
      aria-hidden="true"
      className="manager-table-top-scroll"
      onScroll={() => syncScrollLeft(topScrollRef.current, tableScrollRef.current)}
      ref={topScrollRef}
    >
      <div className="manager-table-top-spacer" style={{ width: tableScrollWidth || '100%' }} />
    </div>
  );

  const shiftWeek = (direction: -1 | 1) => {
    setWindowStart((current) => addDays(current, direction * WEEK_DAYS));
  };

  const orderDateForKey = (key: DashboardManualOrderKey, weeks = dashboardWeeks): string | undefined => {
    if (key === 'orderPackThu') return weeks.current.thu;
    if (key === 'orderPackSat') return weeks.current.thu ? addDays(weeks.current.thu, 2) : undefined;
    if (key === 'orderPackTue') return weeks.current.sun ? addDays(weeks.current.sun, 2) : undefined;
    return undefined;
  };

  const orderPacksForDate = (productId: string, date?: string): string => (date ? orderValues[`${productId}:${date}`] ?? '' : '');

  const rowValuesFor = (row: Product, weeks = dashboardWeeks) =>
    buildDashboardRowValues({
      row,
      weeks,
      orderPacks: orderPacksForDate,
    });

  const setOrderCellValue = (productId: string, key: DashboardManualOrderKey, value: string, weeks = dashboardWeeks) => {
    const date = orderDateForKey(key, weeks);
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

  const currentStockDateForColumn = (key: DashboardColumnKey, weeks = dashboardWeeks): string | undefined => {
    if (key === 'currentTue') return weeks.current.tue;
    if (key === 'currentWed') return weeks.current.wed;
    if (key === 'currentThu') return weeks.current.thu;
    if (key === 'currentFri') return weeks.current.fri;
    if (key === 'currentSun') return weeks.current.sun;
    if (key === 'currentMon') return weeks.current.mon;
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

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.stock.createProduct(session.token, {
        ...form,
        businessCategory: activeBusinessCategory,
        category: form.category || activeSubcategories[0] || DEFAULT_PRODUCT_CATEGORY,
        name: form.name.trim(),
        packType: form.packType.trim(),
      });
      setForm({ ...productToForm(), businessCategory: activeBusinessCategory, category: activeSubcategories[0] || DEFAULT_PRODUCT_CATEGORY });
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
      ...(isMilkTable
        ? dashboardWeekStarts.flatMap((weekStart) => {
          const weeks = dashboardWeeksForStart(weekStart);
          return DASHBOARD_COLUMNS.map((column) => {
            const subtitle = dashboardHeaderSubtitle(weeks, column).replace('\n', ' ');
            return subtitle ? `${column.title} (${subtitle})` : column.title;
          });
        })
        : loadedDates.flatMap((date) => {
          const stockDateLabel = usesEveningStockHeaders ? formatDateShort(date) : formatDateLabel(date);
          const orderDate = dailyOrderDateForStockDate(date, activeBusinessCategory);
          const orderDateLabel = usesEveningStockHeaders
            ? formatDateShort(orderHeaderDateForStockDate(date, activeBusinessCategory))
            : formatDateLabel(orderDate);
          return [
            `${usesEveningStockHeaders ? 'Остаток вечер' : 'Остаток'} (${stockDateLabel})`,
            `${usesEveningStockHeaders ? 'Заказ на' : 'Заказ'} (${orderDateLabel})`,
            `Продано (${stockDateLabel})`,
          ];
        })),
    ];
    const rows = orderedRows.map((row) => {
      return [
        row.category,
        row.name,
        row.packType ?? '',
        row.unitsInPack !== null ? String(row.unitsInPack) : '',
        row.packWeightKg !== null ? String(row.packWeightKg) : '',
        row.shelfLifeDays !== null ? String(row.shelfLifeDays) : '',
        row.unitPriceRubVat !== null && row.unitPriceRubVat !== undefined ? String(row.unitPriceRubVat) : '',
        ...(isMilkTable
          ? dashboardWeekStarts.flatMap((weekStart) => {
            const values = rowValuesFor(row, dashboardWeeksForStart(weekStart));
            return DASHBOARD_COLUMNS.map((column) => values[column.key] ?? '');
          })
          : loadedDates.flatMap((date) => {
            const orderDate = dailyOrderDateForStockDate(date, activeBusinessCategory);
            return [row.values[date] ?? '', orderPacksForDate(row.productId, orderDate), soldFor(row, date)];
          })),
      ];
    });
    const blob = new Blob([`\uFEFF${buildCsv([headers, ...rows])}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`manager_dashboard_${table.shop.name}_${loadedDates[0]}_${loadedDates[loadedDates.length - 1]}`)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const addSubcategory = async () => {
    const name = newSubcategoryName.trim();
    if (!name) {
      return;
    }
    try {
      const next = await api.stock.createSubcategory(session.token, { businessCategory: activeBusinessCategory, name });
      setSubcategories(next);
      setNewSubcategoryName('');
      if (!form.category) {
        setForm((current) => ({ ...current, category: name }));
      }
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const removeSubcategory = async (name: string) => {
    try {
      await api.stock.deleteSubcategory(session.token, { businessCategory: activeBusinessCategory, name });
      const next = await api.stock.listSubcategories(session.token);
      setSubcategories(next);
      setForm((current) => current.category === name ? { ...current, category: next[activeBusinessCategory]?.[0] ?? DEFAULT_PRODUCT_CATEGORY } : current);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const renderDashboardTable = (rows: Product[]) => (
    <section className="manager-category-block">
      {renderTopScrollbar()}
      <div className="manager-table-scroll" onScroll={() => syncScrollLeft(tableScrollRef.current, topScrollRef.current)} ref={tableScrollRef}>
        <table className="manager-stock-table manager-dashboard-table">
          <colgroup>
            <col className="manager-name-col-width" />
            {dashboardWeekStarts.map((weekStart) => (
              <React.Fragment key={weekStart}>
                <col className="dashboard-tuesday-separator-width" />
                {DASHBOARD_COLUMNS.map((column) => (
                  <col key={`${weekStart}:${column.key}`} className={`dashboard-col-${column.kind}-width`} />
                ))}
              </React.Fragment>
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="manager-name-col dashboard-name-header">Товар</th>
              {dashboardWeekStarts.flatMap((weekStart) => {
                const weeks = dashboardWeeksForStart(weekStart);
                return [
                  <th
                    key={`${weekStart}:tuesday-separator`}
                    aria-hidden="true"
                    className="dashboard-tuesday-separator"
                    data-week-start={weekStart}
                  />,
                  ...DASHBOARD_COLUMNS.map((column) => (
                    <th
                      key={`${weekStart}:${column.key}`}
                      className={`dashboard-col-${column.kind} dashboard-tone-${column.tone}`}
                    >
                      <span className={column.kind === 'stock' ? 'dashboard-title-stock' : ''}>{column.title}</span>
                      {dashboardHeaderSubtitle(weeks, column) && <small>{dashboardHeaderSubtitle(weeks, column)}</small>}
                    </th>
                  )),
                ];
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={dashboardWeekStarts.length * (DASHBOARD_COLUMNS.length + 1) + 1} className="manager-empty-row">Нет товаров в этой таблице</td></tr>
            ) : rows.map((row, index) => {
              return (
                <tr
                  key={row.productId}
                  className={[
                    startsNewSubcategory(rows, index) ? 'subcategory-start-row' : '',
                    isBreadSectionBreakProduct(row) ? 'bread-section-end-row' : '',
                  ].filter(Boolean).join(' ') || undefined}
                >
                  <td className="manager-name-col">
                    <strong>{managerProductName(row.name)}</strong>
                    <small>{productReferenceLabel(row)}</small>
                  </td>
                  {dashboardWeekStarts.flatMap((weekStart) => {
                    const weeks = dashboardWeeksForStart(weekStart);
                    const values = rowValuesFor(row, weeks);
                    return [
                      <td key={`${weekStart}:tuesday-separator`} aria-hidden="true" className="dashboard-tuesday-separator" />,
                      ...DASHBOARD_COLUMNS.map((column) => {
                    const value = values[column.key] ?? '';
                    if (column.kind === 'order' && isManualOrderKey(column.key)) {
                      const manualOrderKey = column.key;
                      return (
                        <td key={`${weekStart}:${column.key}`} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                          <input
                            className="dashboard-order-input"
                            data-grid-col={`${weekStart}:${column.key}`}
                            value={value}
                            maxLength={MAX_ORDER_VALUE_LEN}
                            placeholder="-"
                            onFocus={(event) => event.currentTarget.select()}
                            onKeyDown={handleGridKeyDown}
                            onChange={(event) => setOrderCellValue(row.productId, manualOrderKey, event.target.value, weeks)}
                          />
                        </td>
                      );
                    }
                    if (column.kind === 'stock' && isManualStockKey(column.key)) {
                      const date = currentStockDateForColumn(column.key, weeks);
                      return (
                        <td key={`${weekStart}:${column.key}`} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                          {date ? (
                            <StockCellInput
                              value={value}
                              gridCol={`${weekStart}:${column.key}`}
                              label={`${row.name}, ${formatDateLabel(date)}`}
                              onCommit={(nextValue) => void saveStockCell(row.productId, date, nextValue)}
                            />
                          ) : (
                            <span className="dashboard-cell-value dashboard-stock-value">{value || '-'}</span>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={`${weekStart}:${column.key}`} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                        <span className={`dashboard-cell-value ${column.kind === 'stock' ? 'dashboard-stock-value' : column.kind === 'order' ? 'dashboard-order-value' : ''}`}>
                          {value || '-'}
                        </span>
                      </td>
                    );
                    }),
                    ];
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const stockFor = (row: Product, date: string): number | null => {
    const raw = row.values[date];
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const soldFor = (row: Product, date: string): string => {
    if (activeBusinessCategory === 'Хлеб') {
      const previousDate = addDays(date, -1);
      const deliveryUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, previousDate), row.unitsInPack ?? 1);
      return computeDashboardSold(row.values[previousDate], deliveryUnits, row.values[date]);
    }
    if (activeBusinessCategory === 'Деликатесы') {
      const deliveryUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, date), row.unitsInPack ?? 1);
      return computeSold(row.values[addDays(date, -1)], deliveryUnits, row.values[date]);
    }
    const previous = stockFor(row, addDays(date, -1));
    const current = stockFor(row, date);
    if (previous === null || current === null) return '';
    return String(Math.max(0, previous - current));
  };

  const renderDailyTable = (rows: Product[]) => (
    <section className="manager-category-block">
      {renderTopScrollbar()}
      <div className="manager-table-scroll" onScroll={() => syncScrollLeft(tableScrollRef.current, topScrollRef.current)} ref={tableScrollRef}>
        <table className="manager-stock-table manager-dashboard-table">
          <colgroup>
            <col className="manager-name-col-width" />
            {loadedDates.flatMap((date) => (
              <React.Fragment key={date}>
                <col className="dashboard-col-stock-width" />
                <col className="dashboard-col-order-width" />
                <col className="dashboard-col-metric-width" />
              </React.Fragment>
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="manager-name-col dashboard-name-header">Товар</th>
              {loadedDates.map((date) => (
                <React.Fragment key={date}>
                  <th data-week-start={date === windowStart ? windowStart : undefined}>
                    {usesEveningStockHeaders ? 'Остаток вечер' : formatDateLabel(date)}
                    <small>{usesEveningStockHeaders ? formatDateShort(date) : 'Остаток'}</small>
                  </th>
                  <th>
                    {usesEveningStockHeaders ? 'Заказ на' : formatDateLabel(dailyOrderDateForStockDate(date, activeBusinessCategory))}
                    <small>{usesEveningStockHeaders ? formatDateShort(orderHeaderDateForStockDate(date, activeBusinessCategory)) : 'Заказ'}</small>
                  </th>
                  <th>
                    {usesEveningStockHeaders ? 'Продано' : formatDateLabel(date)}
                    <small>{usesEveningStockHeaders ? formatDateShort(date) : 'Продано'}</small>
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={loadedDates.length * 3 + 1} className="manager-empty-row">Нет товаров в этой таблице</td></tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.productId}
                className={[
                  startsNewSubcategory(rows, index) ? 'subcategory-start-row' : '',
                  isBreadSectionBreakProduct(row) ? 'bread-section-end-row' : '',
                ].filter(Boolean).join(' ') || undefined}
              >
                <td className="manager-name-col"><strong>{managerProductName(row.name)}</strong><small>{productReferenceLabel(row)}</small></td>
                {loadedDates.map((date) => {
                  const orderDate = dailyOrderDateForStockDate(date, activeBusinessCategory);
                  return (
                    <React.Fragment key={`${row.productId}:${date}`}>
                      <td>
                        <StockCellInput
                          value={row.values[date] ?? ''}
                          gridCol={`stock:${date}`}
                          label={`${row.name}, ${formatDateLabel(date)}`}
                          onCommit={(nextValue) => void saveStockCell(row.productId, date, nextValue)}
                        />
                      </td>
                      <td>
                        <input
                          className="dashboard-order-input"
                          data-grid-col={`order:${date}`}
                          value={orderPacksForDate(row.productId, orderDate)}
                          maxLength={MAX_ORDER_VALUE_LEN}
                          placeholder="-"
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={handleGridKeyDown}
                          onChange={(event) => {
                            const nextValue = sanitizeOrderValue(event.target.value);
                            setOrderValues((current) => ({ ...current, [`${row.productId}:${orderDate}`]: nextValue }));
                            const packs = nextValue ? Number.parseInt(nextValue, 10) : 0;
                            void api.stock.updateOrderValue(session.token, {
                              shopId: selectedShopId,
                              productId: row.productId,
                              orderDate,
                              packs: Number.isNaN(packs) ? 0 : packs,
                            }).catch((err) => setError(messageOf(err)));
                          }}
                        />
                      </td>
                      <td>{soldFor(row, date) || '-'}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section className="page-section stock-page-section">
      <PageHeader title="Остатки" subtitle="Менеджерская таблица остатков, заказов и продаж по магазину." action={<RefreshButton onClick={() => load(selectedShopId, windowStart, true)} />} />
      <Feedback error={error} />

      <div className="manager-controls">
        <div className="category-tabs">
          {BUSINESS_CATEGORIES.map((category) => (
            <button
              key={category}
              className={activeBusinessCategory === category ? 'active' : ''}
              onClick={() => {
                setActiveBusinessCategory(category);
                setForm({ ...productToForm(), businessCategory: category, category: subcategories[category]?.[0] ?? DEFAULT_PRODUCT_CATEGORY });
              }}
            >
              {category}
            </button>
          ))}
        </div>
        <input className="manager-search" placeholder="Поиск товара" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="manager-button-row">
          <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)}>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
          <button className="secondary" onClick={() => shiftWeek(-1)} disabled={loadingMore}>Прогрузить назад</button>
          <button className="secondary" onClick={() => setWindowStart(startOfWeek())} disabled={loadingMore}>Текущая неделя</button>
          <button className="secondary" onClick={() => shiftWeek(1)} disabled={loadingMore}>Прогрузить дальше</button>
          <button onClick={() => setIsAddProductOpen(true)}>Добавить товар</button>
          <button className="secondary" onClick={exportDashboard}>Экспорт в Excel</button>
        </div>
      </div>

      <div className="manager-meta-row">
        <strong>Позиций: {visibleRows.length}</strong>
        <strong>{loadedRange ? `${activeBusinessCategory}: ${activeViewDates[0]} - ${activeViewDates[activeViewDates.length - 1]}` : ''}</strong>
        {loadingMore && <strong>Подгружаем период...</strong>}
      </div>

      <div className="manager-table-wrap">
        {loading
          ? <p className="manager-loading">Загружаем остатки...</p>
          : isMilkTable
            ? renderDashboardTable(orderedRows)
            : renderDailyTable(orderedRows)}
      </div>

      {isAddProductOpen && (
        <Modal title="Добавить товар" onClose={() => setIsAddProductOpen(false)}>
          <form className="modal-form product-modal-form" onSubmit={createProduct}>
            <input placeholder="Название товара" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ProductCategory })}>
              {activeSubcategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <div className="manager-button-row">
              <input placeholder="Новая подкатегория" value={newSubcategoryName} onChange={(event) => setNewSubcategoryName(event.target.value)} />
              <button type="button" className="secondary" onClick={() => void addSubcategory()}>Добавить подкатегорию</button>
            </div>
            <div className="manager-button-row">
              {activeSubcategories.map((category) => (
                <button key={category} type="button" className="secondary" onClick={() => void removeSubcategory(category)}>
                  Удалить {category}
                </button>
              ))}
            </div>
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

    </section>
  );
};
