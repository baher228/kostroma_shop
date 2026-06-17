import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Feedback, PageHeader, RefreshButton } from '../../components/ui';
import { MACHINE_NUMBERS, PRODUCT_CATEGORIES, type MachineGroup } from '../../dashboardConfig';
import {
  formatDateLabel,
  formatWeekdayLabel,
  isAllowedOrderDate,
  nearestAllowedOrderDate,
  shiftToAllowedOrderDate,
  todayDateKey,
} from '../../dateUtils';
import { safeFileName } from '../../export/csv';
import { makeXlsxBlob, xlsxColumnName, type XlsxCell } from '../../export/xlsx';
import { sortProductsLikeImage } from '../../productOrdering';
import { formatWeight, messageOf } from '../../shared/format';
import type { OrderSheet, OrderSheetRow, ProductCategory, Session, Shop } from '../../types';
export const OrdersPanel = ({ session }: { session: Session }) => {
  const initialDate = nearestAllowedOrderDate(todayDateKey());
  const [date, setDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(initialDate);
  const [sheet, setSheet] = useState<OrderSheet | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (targetDate = date): Promise<OrderSheet | null> => {
    setLoading(true);
    setError('');
    try {
      const nextSheet = await api.orders.sheet(session.token, targetDate);
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
    void load(initialDate);
  }, [session.token]);

  const handleLoadDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('Формат даты: YYYY-MM-DD');
      return;
    }
    if (!isAllowedOrderDate(inputDate)) {
      setError('Лист заказа доступен только во вторник, четверг и субботу.');
      return;
    }
    void load(inputDate);
  };

  const shiftDate = (direction: 1 | -1) => {
    const next = shiftToAllowedOrderDate(date, direction);
    void load(next);
  };

  const groupRowsByCategory = (targetSheet: OrderSheet | null) => {
    const grouped = PRODUCT_CATEGORIES.reduce((acc, category) => {
      acc[category] = [];
      return acc;
    }, {} as Record<ProductCategory, OrderSheetRow[]>);

    if (!targetSheet) {
      return grouped;
    }

    const normalizedQuery = query.trim().toLowerCase();
    for (const row of targetSheet.rows) {
      if (normalizedQuery && !row.productName.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      const category = PRODUCT_CATEGORIES.includes(row.category as ProductCategory)
        ? row.category as ProductCategory
        : PRODUCT_CATEGORIES[0];
      grouped[category].push(row);
    }
    for (const category of PRODUCT_CATEGORIES) {
      grouped[category] = sortProductsLikeImage(
        grouped[category].map((row) => ({ ...row, name: row.productName, category: row.category as ProductCategory })),
      ).map(({ name: _name, ...row }) => row as OrderSheetRow);
    }
    return grouped;
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

  const rowsByCategory = useMemo(() => {
    return groupRowsByCategory(sheet);
  }, [query, sheet]);

  const machineGroups = useMemo<MachineGroup[]>(() => {
    return groupShopsByMachine(sheet);
  }, [sheet]);

  const rowValue = (row: OrderSheetRow, shopId: string): number => row.shopValues[shopId] ?? 0;
  const machineTotal = (row: OrderSheetRow, shops: Shop[]): number =>
    shops.reduce((sum, shop) => sum + rowValue(row, shop.id), 0);

  const downloadSheet = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('Формат даты: YYYY-MM-DD');
      return;
    }
    if (!isAllowedOrderDate(inputDate)) {
      setError('Лист заказа доступен только во вторник, четверг и субботу.');
      return;
    }

    const targetSheet = sheet?.date === inputDate ? sheet : await load(inputDate);
    if (!targetSheet) {
      return;
    }

    const targetGroups = groupShopsByMachine(targetSheet);
    const targetRowsByCategory = groupRowsByCategory(targetSheet);
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

    for (const category of PRODUCT_CATEGORIES) {
      const categoryRows = targetRowsByCategory[category];
      if (!categoryRows.length) {
        continue;
      }
      rows.push([
        { value: category, style: 2 },
        ...targetGroups.flatMap((group) =>
          Array.from({ length: group.shops.length + 2 }, () => ({ value: '', style: 2 })),
        ),
      ]);
      for (const row of categoryRows) {
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
    }

    const blob = makeXlsxBlob(`Заказ ${targetSheet.date}`, rows, merges);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`zakaz_${targetSheet.date}`)}.xlsx`;
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
            <span className="weekday-badge">{formatWeekdayLabel(sheet.date)}</span>
            <strong>Заказ на {formatDateLabel(sheet.date)}</strong>
            <span>Магазинов: {sheet.shops.length}</span>
          </div>
          <div className="order-sheet-scroll">
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
                {PRODUCT_CATEGORIES.map((category) => {
                  const rows = rowsByCategory[category];
                  if (!rows.length) {
                    return null;
                  }
                  return (
                    <React.Fragment key={category}>
                      <tr className="category-row">
                        <td className="sticky order-name-col">{category}</td>
                        {machineGroups.map((group) => (
                          <td key={group.machineNumber} colSpan={group.shops.length + 2} />
                        ))}
                      </tr>
                      {rows.map((row) => (
                        <tr key={row.productId}>
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
