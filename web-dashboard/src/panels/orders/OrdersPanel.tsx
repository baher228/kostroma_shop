import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback, PageHeader, RefreshButton } from '../../components/ui';
import { BUSINESS_CATEGORIES, DEFAULT_BUSINESS_CATEGORY, MACHINE_NUMBERS, PRODUCT_CATEGORIES, type MachineGroup } from '../../dashboardConfig';
import {
  formatDateLabel,
  formatWeekdayLabel,
  addDays,
  isDelicaciesOrderDate,
  isAllowedOrderDate,
  nearestDelicaciesOrderDate,
  nearestAllowedOrderDate,
  shiftToDelicaciesOrderDate,
  shiftToAllowedOrderDate,
  todayDateKey,
} from '../../dateUtils';
import { safeFileName } from '../../export/csv';
import { makeXlsxBlob, xlsxColumnName, type XlsxCell } from '../../export/xlsx';
import { sortProductsLikeImage } from '../../productOrdering';
import { formatWeight, messageOf } from '../../shared/format';
import type { BusinessCategory, OrderSheet, OrderSheetRow, ProductCategory, Session, Shop } from '../../types';

const nextOrderDateForCategory = (category: BusinessCategory): string => {
  const today = todayDateKey();
  if (category === 'Молоко') return nearestAllowedOrderDate(today);
  if (category === 'Деликатесы') return isDelicaciesOrderDate(today) ? today : nearestDelicaciesOrderDate(today);
  return today;
};

const orderLabelDate = (date: string): string => addDays(date, 1);

const startsNewSubcategory = <T extends { category: string }>(rows: T[], index: number): boolean =>
  index > 0 && rows[index - 1]?.category !== rows[index]?.category;

export const OrdersPanel = ({ session }: { session: Session }) => {
  const initialDate = nextOrderDateForCategory(DEFAULT_BUSINESS_CATEGORY);
  const [activeBusinessCategory, setActiveBusinessCategory] = useState<BusinessCategory>(DEFAULT_BUSINESS_CATEGORY);
  const [date, setDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(initialDate);
  const [sheet, setSheet] = useState<OrderSheet | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);

  const load = async (targetDate = date): Promise<OrderSheet | null> => {
    setLoading(true);
    setError('');
    try {
      const nextSheet = await api.orders.sheet(session.token, targetDate, activeBusinessCategory);
      setSheet(nextSheet);
      setDate(targetDate);
      setInputDate(targetDate);
      return nextSheet;
    } catch (err) {
      setError(messageOf(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(nextOrderDateForCategory(activeBusinessCategory));
  }, [session.token, activeBusinessCategory]);

  const handleLoadDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('Формат даты: YYYY-MM-DD');
      return;
    }
    if (activeBusinessCategory === 'Молоко' && !isAllowedOrderDate(inputDate)) {
      setError('Лист заказа доступен только во вторник, четверг и субботу.');
      return;
    }
    if (activeBusinessCategory === 'Деликатесы' && !isDelicaciesOrderDate(inputDate)) {
      setError('По воскресеньям поставки деликатесов нет.');
      return;
    }
    void load(inputDate);
  };

  const shiftDate = (direction: 1 | -1) => {
    const next = activeBusinessCategory === 'Молоко'
      ? shiftToAllowedOrderDate(date, direction)
      : activeBusinessCategory === 'Деликатесы'
        ? shiftToDelicaciesOrderDate(date, direction)
        : addDays(date, direction);
    void load(next);
  };

  const getVisibleRows = (targetSheet: OrderSheet | null) => {
    if (!targetSheet) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();
    const rows: OrderSheetRow[] = [];
    for (const row of targetSheet.rows) {
      if (normalizedQuery && !row.productName.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      rows.push(row);
    }
    return sortProductsLikeImage(
      rows.map((row) => ({ ...row, name: row.productName, category: row.category as ProductCategory })),
    ).map(({ name: _name, ...row }) => row as OrderSheetRow);
  };

  const groupShopsByMachine = (targetSheet: OrderSheet | null): MachineGroup[] => {
    if (!targetSheet) {
      return [];
    }
    return MACHINE_NUMBERS.map((machineNumber) => ({
      machineNumber,
      shops: targetSheet.shops.filter((shop) => shop.machineNumber === machineNumber),
    })).filter((group) => group.shops.length > 0);
  };

  const visibleRows = useMemo(() => getVisibleRows(sheet), [query, sheet]);

  const machineGroups = useMemo<MachineGroup[]>(() => {
    return groupShopsByMachine(sheet);
  }, [sheet]);

  useEffect(() => {
    const scrollArea = tableScrollRef.current;
    if (!scrollArea) return;
    const updateScrollWidth = () => setTableScrollWidth(scrollArea.scrollWidth);
    updateScrollWidth();
    const observer = new ResizeObserver(updateScrollWidth);
    observer.observe(scrollArea);
    const table = scrollArea.querySelector('table');
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [sheet]);

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (target && target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft;
    }
  };

  const rowValue = (row: OrderSheetRow, shopId: string): number => row.shopValues[shopId] ?? 0;
  const machineTotal = (row: OrderSheetRow, shops: Shop[]): number =>
    shops.reduce((sum, shop) => sum + rowValue(row, shop.id), 0);
  const machineWeight = (rows: OrderSheetRow[], shops: Shop[]): number =>
    Math.round(rows.reduce((sum, row) => sum + machineTotal(row, shops) * (row.packWeightKg ?? 0), 0) * 100) / 100;

  const downloadSheet = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('Формат даты: YYYY-MM-DD');
      return;
    }
    if (activeBusinessCategory === 'Молоко' && !isAllowedOrderDate(inputDate)) {
      setError('Лист заказа доступен только во вторник, четверг и субботу.');
      return;
    }
    if (activeBusinessCategory === 'Деликатесы' && !isDelicaciesOrderDate(inputDate)) {
      setError('По воскресеньям поставки деликатесов нет.');
      return;
    }

    const targetSheet = sheet?.date === inputDate ? sheet : await load(inputDate);
    if (!targetSheet) {
      return;
    }

    const targetGroups = groupShopsByMachine(targetSheet);
    const targetRows = getVisibleRows(targetSheet);
    const rows: XlsxCell[][] = [
      [
        { value: '', style: 1 },
        ...targetGroups.flatMap((group) => [
          { value: `МАШИНА ${group.machineNumber}`, style: 1 },
          ...Array.from({ length: group.shops.length + 1 }, () => ({ value: '', style: 1 })),
        ]),
      ],
      [
        { value: 'Номенклатура', style: 1 },
        ...targetGroups.flatMap((group) => [
          ...group.shops.map((shop) => ({ value: shop.name, style: 1 })),
          { value: 'ИТОГО', style: 1 },
          { value: 'ВЕС', style: 1 },
        ]),
      ],
    ];
    const merges: string[] = [];
    let currentColumn = 2;
    for (const group of targetGroups) {
      const endColumn = currentColumn + group.shops.length + 1;
      merges.push(`${xlsxColumnName(currentColumn)}1:${xlsxColumnName(endColumn)}1`);
      currentColumn = endColumn + 1;
    }

    for (const row of targetRows) {
      rows.push([
        { value: row.productName },
        ...targetGroups.flatMap((group) => {
          const total = machineTotal(row, group.shops);
          return [
            ...group.shops.map((shop) => {
              const value = rowValue(row, shop.id);
              return { value: value || '', style: 3, type: value ? 'number' as const : 'string' as const };
            }),
            { value: total || '', style: 3, type: total ? 'number' as const : 'string' as const },
            { value: formatWeight(total, row.packWeightKg), style: 3 },
          ];
        }),
      ]);
    }

    rows.push([
      { value: 'ОБЩИЙ ВЕС ПО МАШИНАМ', style: 2 },
      ...targetGroups.flatMap((group) => [
        ...group.shops.map(() => ({ value: '', style: 2 })),
        { value: 'ОБЩИЙ ВЕС, КГ', style: 2 },
        { value: machineWeight(targetRows, group.shops), style: 2, type: 'number' as const },
      ]),
    ]);

    const blob = makeXlsxBlob(`Заказ ${orderLabelDate(targetSheet.date)}`, rows, merges);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`zakaz_${orderLabelDate(targetSheet.date)}`)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page-section">
      <PageHeader
        title="Заказ"
        subtitle="Сводная таблица заказов по товарам, магазинам и машинам."
        action={<RefreshButton onClick={() => load()} />}
      />
      <Feedback error={error} />
      <div className="category-tabs">
        {BUSINESS_CATEGORIES.map((category) => (
          <button
            key={category}
            className={activeBusinessCategory === category ? 'active' : ''}
            onClick={() => {
              setActiveBusinessCategory(category);
            }}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="toolbar hero-toolbar">
        <button className="secondary date-step" onClick={() => shiftDate(-1)} aria-label="Предыдущая дата заказа">‹</button>
        <input type="date" value={inputDate} onChange={(event) => setInputDate(event.target.value)} />
        <button className="secondary date-step" onClick={() => shiftDate(1)} aria-label="Следующая дата заказа">›</button>
        <button onClick={() => void downloadSheet()}>Скачать</button>
        <input
          className="search-field"
          placeholder="Поиск по названию"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading && !sheet ? <p>Загружаем заказ...</p> : sheet && (
        <div className="order-sheet-wrap">
          <div className="order-sheet-meta">
            <span className="weekday-badge">{formatWeekdayLabel(orderLabelDate(sheet.date))}</span>
            <strong>Заказ на {formatDateLabel(orderLabelDate(sheet.date))}</strong>
            <span>Магазинов: {sheet.shops.length}</span>
          </div>
          <div
            ref={topScrollRef}
            className="order-sheet-top-scroll"
            aria-label="Горизонтальная прокрутка таблицы заказов"
            tabIndex={0}
            onScroll={(event) => syncHorizontalScroll(event.currentTarget, tableScrollRef.current)}
          >
            <div style={{ width: tableScrollWidth }} />
          </div>
          <div
            ref={tableScrollRef}
            className="order-sheet-scroll"
            onScroll={(event) => syncHorizontalScroll(event.currentTarget, topScrollRef.current)}
          >
            <table className="order-sheet-table">
              <thead>
                <tr className="machine-row">
                  <th className="sticky order-name-col" />
                  {machineGroups.map((group) => (
                    <th key={group.machineNumber} colSpan={group.shops.length + 2} className="machine-title">
                      МАШИНА {group.machineNumber}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="sticky order-name-col">Номенклатура</th>
                  {machineGroups.flatMap((group) => [
                    ...group.shops.map((shop) => (
                      <th key={`${group.machineNumber}:${shop.id}`} className="shop-col">{shop.name}</th>
                    )),
                    <th key={`${group.machineNumber}:total`} className="total-col">ИТОГО</th>,
                    <th key={`${group.machineNumber}:weight`} className="weight-col">ВЕС</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={row.productId} className={startsNewSubcategory(visibleRows, index) ? 'subcategory-start-row' : undefined}>
                    <td className="sticky order-name-col product-name">{row.productName}</td>
                    {machineGroups.flatMap((group) => {
                      const total = machineTotal(row, group.shops);
                      return [
                        ...group.shops.map((shop) => {
                          const value = rowValue(row, shop.id);
                          return <td key={`${row.productId}:${shop.id}`} className="number-cell">{value || ''}</td>;
                        }),
                        <td key={`${row.productId}:${group.machineNumber}:total`} className="number-cell total-cell">{total || ''}</td>,
                        <td key={`${row.productId}:${group.machineNumber}:weight`} className="number-cell weight-cell">
                          {formatWeight(total, row.packWeightKg)}
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="machine-weight-row">
                  <td className="sticky order-name-col">ОБЩИЙ ВЕС ПО МАШИНАМ</td>
                  {machineGroups.flatMap((group) => [
                    ...group.shops.map((shop) => <td key={`weight:${group.machineNumber}:${shop.id}`} />),
                    <td key={`weight:${group.machineNumber}:label`} className="total-cell">ОБЩИЙ ВЕС, КГ</td>,
                    <td key={`weight:${group.machineNumber}:value`} className="weight-cell">
                      {formatWeight(1, machineWeight(visibleRows, group.shops))}
                    </td>,
                  ])}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
