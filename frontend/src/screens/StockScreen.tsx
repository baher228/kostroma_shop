import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { shopsApi } from '../api/shops';
import { CreateProductPayload, StockValueKind, stockApi } from '../api/stock';
import { OrdersPanel } from '../components/OrdersPanel';
import { OrderSheetPanel } from '../components/OrderSheetPanel';
import { SupportPanel } from '../components/SupportPanel';
import { TasksPanel } from '../components/TasksPanel';
import { UsersPanel } from '../components/UsersPanel';
import { FobQrCard } from '../components/FobQrCard';
import { FobScannerPanel } from '../components/FobScannerPanel';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { useTaskNotifications } from '../hooks/useTaskNotifications';
import { AudioQcAdminPanel } from '../features/audioQc/AudioQcAdminPanel';
import { AudioQcControls } from '../features/audioQc/AudioQcControls';
import { AudioQcRecordingsList } from '../features/audioQc/AudioQcRecordingsList';
import { AudioQcStatusBadge } from '../features/audioQc/AudioQcStatusBadge';
import {
  DASHBOARD_COLUMNS,
  BUSINESS_CATEGORIES,
  DEFAULT_BUSINESS_CATEGORY,
  DEFAULT_PRODUCT_CATEGORY,
  MAX_ORDER_VALUE_LEN,
  PRODUCT_CATEGORIES,
  WEEK_DAYS,
  type DashboardColumn,
  type DashboardColumnKey,
  type DashboardManualOrderKey,
  type DashboardRowValues,
  type DashboardTone,
  type BusinessCategory,
  type WeekDateMap,
} from '../constants/dashboard';
import { sortStockTableRowsLikeImage } from '../constants/productOrdering';
import {
  buildDashboardRowValues,
  computeDashboardSold,
  computeSold,
  dashboardHeaderSubtitle,
  deriveDashboardWeeks,
  isManualOrderKey,
  isManualStockKey,
  orderUnitsFromPacks,
  sanitizeOrderValue,
} from '../../../shared/dashboard-calculations';
import { isBreadSectionBreakProduct, managerProductName } from '../../../shared/product-display';
import { ProductCategory, Session, Shop, StockTable, StockTableRow } from '../types/models';
import { BusinessCategoryTabs } from '../components/BusinessCategoryTabs';

type ScreenTab = 'stock' | 'inventory' | 'orders' | 'orderSheet' | 'tasks' | 'support' | 'users' | 'fob' | 'audioQc';

type EditingCell = {
  productId: string;
  date: string;
  productName: string;
};

type LoadedDateRange = {
  from: string;
  to: string;
};

type StockScreenProps = {
  session: Session;
  onLogout: () => Promise<void>;
};

const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Server error.');

const sanitizeStockValue = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }
  const parsed = Number.parseInt(digits, 10);
  if (Number.isNaN(parsed)) {
    return '';
  }
  return String(Math.min(50, Math.max(0, parsed)));
};

const sanitizeIntegerInput = (raw: string, maxLength = 6): string => raw.replace(/[^0-9]/g, '').slice(0, maxLength);

const sanitizeDecimalInput = (raw: string, decimalPlaces: number): string => {
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...fractionParts] = normalized.split('.');
  if (!fractionParts.length) {
    return whole.slice(0, 6);
  }
  return `${whole.slice(0, 6)}.${fractionParts.join('').slice(0, decimalPlaces)}`;
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatDate = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatWeekday = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString('ru-RU', { weekday: 'short' });
};

const isTuesday = (dateKey: string): boolean => parseDateKey(dateKey).getDay() === 2;

const normalizeText = (value: string) => value.trim().toLowerCase();

const startOfWeekMonday = (date: Date): Date => {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  return current;
};

const currentWeekStart = (): string => toDateKey(startOfWeekMonday(new Date()));

const shiftDateKey = (dateKey: string, deltaDays: number): string => {
  const shifted = parseDateKey(dateKey);
  shifted.setDate(shifted.getDate() + deltaDays);
  return toDateKey(shifted);
};

const nextDelicaciesDeliveryDate = (dateKey: string): string => {
  let target = shiftDateKey(dateKey, 1);
  if (parseDateKey(target).getDay() === 0) {
    target = shiftDateKey(target, 1);
  }
  return target;
};

const dailyOrderDateForStockDate = (dateKey: string, businessCategory: BusinessCategory): string =>
  businessCategory === 'Деликатесы' && parseDateKey(dateKey).getDay() === 0
    ? nextDelicaciesDeliveryDate(dateKey)
    : dateKey;

const buildDateRange = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDateKey(date, 1)) {
    dates.push(date);
  }
  return dates;
};

const visibleStockRangeForWindowStart = (weekStart: string): LoadedDateRange => ({
  from: shiftDateKey(weekStart, -WEEK_DAYS),
  to: shiftDateKey(weekStart, WEEK_DAYS - 1),
});

const rangeFromDates = (dates: Array<string | undefined>, fallback: LoadedDateRange): LoadedDateRange => {
  const sortedDates = dates.filter((date): date is string => Boolean(date)).sort();
  return {
    from: sortedDates[0] && sortedDates[0] < fallback.from ? sortedDates[0] : fallback.from,
    to: sortedDates[sortedDates.length - 1] && sortedDates[sortedDates.length - 1] > fallback.to
      ? sortedDates[sortedDates.length - 1]
      : fallback.to,
  };
};

const dashboardFormulaStockRangeForWindowStart = (weekStart: string): LoadedDateRange => {
  const visibleRange = visibleStockRangeForWindowStart(weekStart);
  const weeks = deriveDashboardWeeks(buildDateRange(visibleRange.from, visibleRange.to));
  const previousSundayBeforeWeek = weeks.previous?.mon ? shiftDateKey(weeks.previous.mon, -1) : undefined;
  return rangeFromDates([
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
  ], visibleRange);
};

const dashboardFormulaOrderRangeForWindowStart = (weekStart: string): LoadedDateRange => {
  const visibleRange = visibleStockRangeForWindowStart(weekStart);
  const stockRange = dashboardFormulaStockRangeForWindowStart(weekStart);
  const weeks = deriveDashboardWeeks(buildDateRange(visibleRange.from, visibleRange.to));
  return rangeFromDates([
    weeks.previous?.tue,
    weeks.previous?.thu,
    weeks.previous?.thu ? shiftDateKey(weeks.previous.thu, 2) : undefined,
    weeks.current.tue,
    weeks.current.thu,
    weeks.current.thu ? shiftDateKey(weeks.current.thu, 2) : undefined,
    weeks.current.sun ? shiftDateKey(weeks.current.sun, 2) : undefined,
  ], stockRange);
};

const dailyFormulaStockRangeForWindowStart = (weekStart: string): LoadedDateRange => {
  const range = visibleStockRangeForWindowStart(weekStart);
  return { ...range, from: shiftDateKey(range.from, -1) };
};

const dailyFormulaOrderRangeForWindowStart = (weekStart: string, businessCategory: BusinessCategory): LoadedDateRange => {
  const stockRange = dailyFormulaStockRangeForWindowStart(weekStart);
  const orderDates = buildDateRange(stockRange.from, stockRange.to).map((date) => dailyOrderDateForStockDate(date, businessCategory));
  return rangeFromDates(orderDates, stockRange);
};

const stockFetchRangeForWindowStart = (weekStart: string, businessCategory: BusinessCategory): LoadedDateRange =>
  businessCategory === 'Молоко'
    ? dashboardFormulaStockRangeForWindowStart(weekStart)
    : dailyFormulaStockRangeForWindowStart(weekStart);

const orderFetchRangeForWindowStart = (weekStart: string, businessCategory: BusinessCategory): LoadedDateRange =>
  businessCategory === 'Молоко'
    ? dashboardFormulaOrderRangeForWindowStart(weekStart)
    : dailyFormulaOrderRangeForWindowStart(weekStart, businessCategory);

const formatOptionalPrice = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return `${parsed.toFixed(2)} руб`;
};

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const buildCsv = (rows: string[][]): string => rows.map((row) => row.map((item) => csvEscape(item)).join(';')).join('\n');

const safeFileName = (raw: string): string => raw.replace(/[\\/:*?"<>|]/g, '_');

const createCategoryMap = (): Record<ProductCategory, StockTableRow[]> =>
  PRODUCT_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = [];
      return acc;
    },
    {} as Record<ProductCategory, StockTableRow[]>,
  );

const startsNewSubcategory = <T extends { category: string }>(rows: T[], index: number): boolean =>
  index > 0 && rows[index - 1]?.category !== rows[index]?.category;

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const StockScreen = ({ session, onLogout }: StockScreenProps) => {
  const canManage = session.user.role === 'manager';
  const isWorker = session.user.role === 'worker';
  const isStoreTablet = session.user.role === 'store_tablet';

  const [activeTab, setActiveTab] = useState<ScreenTab>('stock');
  const openTasks = useCallback(() => setActiveTab('tasks'), []);
  const { hasUnreadTasks, markTasksViewed, taskNotificationVersion, unregisterPushToken } = useTaskNotifications(
    session,
    openTasks,
  );
  const [activeBusinessCategory, setActiveBusinessCategory] = useState<BusinessCategory>(DEFAULT_BUSINESS_CATEGORY);
  const [table, setTable] = useState<StockTable | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(session.user.shopId ?? null);
  const [managerWindowStart, setManagerWindowStart] = useState<string>(currentWeekStart());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dashboardOrderValues, setDashboardOrderValues] = useState<Record<string, string>>({});
  const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});
  const [isShopPickerOpen, setIsShopPickerOpen] = useState(false);

  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<ProductCategory | null>(null);
  const [newProductPackType, setNewProductPackType] = useState('');
  const [newProductUnitsInPack, setNewProductUnitsInPack] = useState('');
  const [newProductPackWeightKg, setNewProductPackWeightKg] = useState('');
  const [newProductShelfLifeDays, setNewProductShelfLifeDays] = useState('');
  const [newProductUnitPriceRubVat, setNewProductUnitPriceRubVat] = useState('');
  const [newProductMinStockUnits, setNewProductMinStockUnits] = useState('');
  const [newProductMaxStockUnits, setNewProductMaxStockUnits] = useState('');
  const [addingProduct, setAddingProduct] = useState(false);
  const { checkingUpdate, checkForAppUpdate } = useAppUpdate();

  const [stockKind, setStockKind] = useState<StockValueKind>('stock');
  const isInventory = stockKind === 'inventory';
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (activeTab === 'stock' || activeTab === 'inventory') {
      setStockKind(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!canManage && activeTab === 'users') {
      setActiveTab('stock');
    }
  }, [activeTab, canManage]);

  useEffect(() => {
    if (canManage && activeTab === 'orders') {
      setActiveTab('orderSheet');
    }
  }, [activeTab, canManage]);

  const setPending = (key: string, value: boolean) => {
    setPendingKeys((current) => ({ ...current, [key]: value }));
  };

  const loadShops = async () => {
    try {
      const nextShops = await shopsApi.list(session.token);
      setShops(nextShops);
      if (canManage && nextShops.length > 0 && !selectedShopId) {
        setSelectedShopId(nextShops[0].id);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  const loadTable = async () => {
    try {
      setLoading(true);
      setError('');
      const visibleRange = visibleStockRangeForWindowStart(managerWindowStart);
      const stockRange = stockFetchRangeForWindowStart(managerWindowStart, activeBusinessCategory);
      const orderRange = orderFetchRangeForWindowStart(managerWindowStart, activeBusinessCategory);
      const from = canManage ? stockRange.from : undefined;
      const to = canManage ? stockRange.to : undefined;
      const nextTable = await stockApi.list(session.token, {
        shopId: canManage ? selectedShopId ?? undefined : undefined,
        businessCategory: activeBusinessCategory,
        from,
        to,
        range: canManage ? undefined : 'week',
        kind: stockKind,
      });
      const visibleTable = canManage
        ? { ...nextTable, dates: nextTable.dates.filter((date) => date >= visibleRange.from && date <= visibleRange.to) }
        : nextTable;
      setTable(visibleTable);
      if (!selectedShopId) {
        setSelectedShopId(visibleTable.shop.id);
      }
      if (canManage && !isInventory && from && to) {
        const targetShopId = selectedShopId ?? visibleTable.shop.id;
        if (targetShopId) {
          try {
            const orderValues = await stockApi.listShopOrderValues(
              session.token,
              targetShopId,
              orderRange.from,
              orderRange.to,
              activeBusinessCategory,
            );
            const loaded: Record<string, string> = {};
            for (const entry of orderValues) {
              loaded[`${entry.productId}:${entry.orderDate}`] = String(entry.packs);
            }
            setDashboardOrderValues(loaded);
          } catch {
            setDashboardOrderValues({});
          }
        }
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShops();
  }, [session.token]);

  useEffect(() => {
    if (canManage && !selectedShopId && shops.length > 0) {
      return;
    }
    void loadTable();
  }, [session.token, canManage, selectedShopId, managerWindowStart, activeBusinessCategory, stockKind]);

  const visibleRows = useMemo(() => {
    if (!table) {
      return [];
    }
    const normalizedQuery = normalizeText(query);
    let nextRows = table.rows;

    if (normalizedQuery) {
      nextRows = nextRows.filter((row) => normalizeText(row.name).includes(normalizedQuery));
    }
    return nextRows;
  }, [table, query]);

  const activeSubcategories = useMemo(
    () => (table?.subcategories?.length ? table.subcategories : [...PRODUCT_CATEGORIES]),
    [table?.subcategories],
  );

  const isMilkTable = activeBusinessCategory === 'Молоко';
  const usesMilkTones = (['Хлеб', 'Деликатесы', 'Сыр', 'Мороженое', 'Курица'] as BusinessCategory[]).includes(activeBusinessCategory);
  const usesEveningStockHeaders = activeBusinessCategory === 'Хлеб' || activeBusinessCategory === 'Деликатесы' || activeBusinessCategory === 'Сыр';

  const orderedRows = useMemo(
    () => sortStockTableRowsLikeImage(visibleRows),
    [visibleRows],
  );

  const dashboardWeeks = useMemo(() => {
    if (!table) {
      return {
        current: {} as WeekDateMap,
        previous: null as WeekDateMap | null,
        currentStart: undefined as string | undefined,
        previousStart: undefined as string | undefined,
      };
    }
    return deriveDashboardWeeks(table.dates);
  }, [table]);

  const productReferenceLabel = (row: StockTableRow): string => {
    const parts: string[] = [];
    if (row.packType) {
      parts.push(row.packType);
    }
    const units = optionalNumber(row.unitsInPack);
    if (units !== null) {
      parts.push(`${units} шт/уп`);
    }
    const packWeight = optionalNumber(row.packWeightKg);
    if (packWeight !== null) {
      parts.push(`${packWeight} кг`);
    }
    const shelfLife = optionalNumber(row.shelfLifeDays);
    if (shelfLife !== null) {
      parts.push(`${shelfLife} сут`);
    }
    const priceLabel = formatOptionalPrice(row.unitPriceRubVat);
    if (priceLabel) {
      parts.push(priceLabel);
    }
    if (row.minStockUnits !== null || row.maxStockUnits !== null) {
      parts.push(`границы: ${row.minStockUnits ?? '-'}-${row.maxStockUnits ?? '-'}`);
    }
    return parts.join(' · ');
  };

  const currentStockDateForColumn = (key: DashboardColumnKey): string | undefined => {
    if (key === 'currentTue') {
      return dashboardWeeks.current.tue;
    }
    if (key === 'currentWed') {
      return dashboardWeeks.current.wed;
    }
    if (key === 'currentThu') {
      return dashboardWeeks.current.thu;
    }
    if (key === 'currentFri') {
      return dashboardWeeks.current.fri;
    }
    if (key === 'currentSun') {
      return dashboardWeeks.current.sun;
    }
    if (key === 'currentMon') {
      return dashboardWeeks.current.mon;
    }
    return undefined;
  };

  const orderDateForKey = (key: DashboardManualOrderKey): string | undefined => {
    if (key === 'orderPackThu') return dashboardWeeks.current.thu;
    if (key === 'orderPackSat') {
      return dashboardWeeks.current.thu ? shiftDateKey(dashboardWeeks.current.thu, 2) : undefined;
    }
    if (key === 'orderPackTue') {
      return dashboardWeeks.current.sun ? shiftDateKey(dashboardWeeks.current.sun, 2) : undefined;
    }
    return undefined;
  };

  const orderCellValue = (productId: string, key: DashboardManualOrderKey): string => {
    const date = orderDateForKey(key);
    if (!date) return '';
    return dashboardOrderValues[`${productId}:${date}`] ?? '';
  };

  const setOrderCellValue = (productId: string, key: DashboardManualOrderKey, value: string) => {
    const date = orderDateForKey(key);
    const shopId = selectedShopId;
    if (!date || !shopId) return;
    const nextValue = sanitizeOrderValue(value);
    const fieldKey = `${productId}:${date}`;
    const previousValue = dashboardOrderValues[fieldKey] ?? '';
    setDashboardOrderValues((current) => ({
      ...current,
      [fieldKey]: nextValue,
    }));
    const packs = nextValue ? Number.parseInt(nextValue, 10) : 0;
    void stockApi.updateOrderValue(session.token, {
      shopId,
      productId,
      orderDate: date,
      packs: Number.isNaN(packs) ? 0 : packs,
    }).catch((saveError) => {
      setDashboardOrderValues((current) => ({
        ...current,
        [fieldKey]: previousValue,
      }));
      setError(errorMessage(saveError));
    });
  };

  const orderPacksForDate = (productId: string, date?: string): string => {
    if (!date) return '';
    return dashboardOrderValues[`${productId}:${date}`] ?? '';
  };

  const dashboardRowValues = (row: StockTableRow): DashboardRowValues => {
    return buildDashboardRowValues({ row, weeks: dashboardWeeks, orderPacks: orderPacksForDate });
  };

  const dashboardColumnSubtitle = (column: DashboardColumn): string =>
    dashboardHeaderSubtitle(dashboardWeeks, column);

  const exportDashboard = async () => {
    if (!table) {
      return;
    }

    const headerRow = [
      'Категория',
      'Товар',
      'Упаковка',
      'Количество в упаковке',
      'Вес упаковки, кг',
      'Срок годности, сут',
      'Цена в руб, с НДС',
      ...(isInventory ? table.dates.map((date) => `Остаток (${date})`) : DASHBOARD_COLUMNS.map((column) => {
        const subtitle = dashboardColumnSubtitle(column).replace('\n', ' ');
        return subtitle ? `${column.title} (${subtitle})` : column.title;
      })),
    ];
    const dataRows = orderedRows.map((row) => {
      const values = dashboardRowValues(row);
      return [
        row.category,
        row.name,
        row.packType ?? '',
        row.unitsInPack !== null ? String(row.unitsInPack) : '',
        row.packWeightKg !== null ? String(row.packWeightKg) : '',
        row.shelfLifeDays !== null ? String(row.shelfLifeDays) : '',
        row.unitPriceRubVat !== null && row.unitPriceRubVat !== undefined ? String(row.unitPriceRubVat) : '',
        ...(isInventory ? table.dates.map((date) => row.values[date] ?? '') : DASHBOARD_COLUMNS.map((column) => values[column.key] ?? '')),
      ];
    });

    const csv = `\uFEFF${buildCsv([headerRow, ...dataRows])}`;
    const fileName = safeFileName(`${isInventory ? 'inventory' : 'manager_dashboard'}_${table.shop.name}_${table.from}_${table.to}.csv`);

    if (Platform.OS === 'web') {
      const browser = globalThis as typeof globalThis & {
        Blob?: new (parts?: BlobPart[], options?: BlobPropertyBag) => Blob;
        URL?: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
        document?: {
          createElement: (tag: string) => { href: string; download: string; click: () => void };
          body?: { appendChild: (node: unknown) => void; removeChild: (node: unknown) => void };
        };
      };

      if (browser.Blob && browser.URL && browser.document?.createElement) {
        const blob = new browser.Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const objectUrl = browser.URL.createObjectURL(blob);
        const link = browser.document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        browser.document.body?.appendChild(link);
        link.click();
        browser.document.body?.removeChild(link);
        browser.URL.revokeObjectURL(objectUrl);
        return;
      }
    }

    await Share.share({
      title: fileName,
      message: csv,
    });
  };

  const columnToneHeader = (date: string) => {
    if (!table) {
      return styles.headerToneA;
    }
    return table.dates.indexOf(date) % 2 === 0 ? styles.headerToneA : styles.headerToneB;
  };

  const columnToneValue = (date: string) => {
    if (!table) {
      return styles.valueToneA;
    }
    return table.dates.indexOf(date) % 2 === 0 ? styles.valueToneA : styles.valueToneB;
  };

  const secondWeekBoundaryStyle = (date: string) =>
    table && table.dates.indexOf(date) === 7 ? styles.secondWeekBoundary : null;

  const openEditCell = (row: StockTableRow, date: string) => {
    setEditingCell({
      productId: row.productId,
      date,
      productName: row.name,
    });
    setEditingValue(row.values[date] ?? '');
  };

  const getNextRow = (productId: string): StockTableRow | null => {
    const currentIndex = orderedRows.findIndex((row) => row.productId === productId);
    if (currentIndex < 0 || currentIndex + 1 >= orderedRows.length) {
      return null;
    }
    return orderedRows[currentIndex + 1];
  };

  const saveCell = async (continueToNext: boolean) => {
    if (!editingCell || !table) {
      return;
    }

    const currentCell = editingCell;
    const key = `${currentCell.productId}:${currentCell.date}`;
    const nextValue = sanitizeStockValue(editingValue);
    const nextRow = continueToNext ? getNextRow(currentCell.productId) : null;

    try {
      setSavingEdit(true);
      setPending(key, true);
      await stockApi.updateValue(session.token, {
        shopId: canManage ? selectedShopId ?? table.shop.id : undefined,
        productId: currentCell.productId,
        date: currentCell.date,
        value: nextValue,
        kind: stockKind,
      });

      setTable((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          rows: current.rows.map((row) =>
            row.productId === currentCell.productId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    [currentCell.date]: nextValue,
                  },
                }
              : row,
          ),
        };
      });

      if (continueToNext && nextRow) {
        setEditingCell({
          productId: nextRow.productId,
          date: currentCell.date,
          productName: nextRow.name,
        });
        setEditingValue(nextRow.values[currentCell.date] ?? '');
      } else {
        setEditingCell(null);
      }
      setError('');
    } catch (saveError) {
      setError(errorMessage(saveError));
      await loadTable();
    } finally {
      setPending(key, false);
      setSavingEdit(false);
    }
  };

  const resetProductForm = () => {
    setNewProductName('');
    setNewProductCategory(null);
    setNewProductPackType('');
    setNewProductUnitsInPack('');
    setNewProductPackWeightKg('');
    setNewProductShelfLifeDays('');
    setNewProductUnitPriceRubVat('');
    setNewProductMinStockUnits('');
    setNewProductMaxStockUnits('');
  };

  const parseRequiredInteger = (label: string, raw: string, allowZero = false): number => {
    const parsed = Number.parseInt(raw.trim(), 10);
    const valid = Number.isInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
    if (!valid) {
      throw new Error(`${label}: введите ${allowZero ? '0 или больше' : 'число больше 0'}.`);
    }
    return parsed;
  };

  const parseRequiredDecimal = (label: string, raw: string, allowZero = false): number => {
    const parsed = Number.parseFloat(raw.trim().replace(',', '.'));
    const valid = Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
    if (!valid) {
      throw new Error(`${label}: введите ${allowZero ? '0 или больше' : 'число больше 0'}.`);
    }
    return parsed;
  };

  const buildNewProductPayload = (): CreateProductPayload => {
    const normalizedName = newProductName.trim();
    const packType = newProductPackType.trim();
    if (!normalizedName) {
      throw new Error('Введите название товара.');
    }
    const productCategory = newProductCategory ?? activeSubcategories[0] ?? DEFAULT_PRODUCT_CATEGORY;
    if (!packType) {
      throw new Error('Введите тип упаковки.');
    }

    const minStockUnits = parseRequiredInteger('Минимальный остаток', newProductMinStockUnits, true);
    const maxStockUnits = parseRequiredInteger('Максимальный остаток', newProductMaxStockUnits, true);
    if (minStockUnits > maxStockUnits) {
      throw new Error('Минимальный остаток не может быть больше максимального.');
    }

    return {
      name: normalizedName,
      businessCategory: activeBusinessCategory,
      category: productCategory,
      packType,
      unitsInPack: parseRequiredInteger('Штук в упаковке', newProductUnitsInPack),
      packWeightKg: parseRequiredDecimal('Вес упаковки, кг', newProductPackWeightKg),
      shelfLifeDays: parseRequiredInteger('Срок годности, дней', newProductShelfLifeDays),
      unitPriceRubVat: parseRequiredDecimal('Цена с НДС, руб', newProductUnitPriceRubVat, true),
      minStockUnits,
      maxStockUnits,
    };
  };

  const addProduct = async () => {
    if (!canManage) {
      return;
    }
    let payload: CreateProductPayload;
    try {
      payload = buildNewProductPayload();
    } catch (validationError) {
      Alert.alert('Новый товар', errorMessage(validationError));
      return;
    }
    try {
      setAddingProduct(true);
      await stockApi.createProduct(session.token, payload);
      resetProductForm();
      setIsAddProductModalOpen(false);
      await loadTable();
      setError('');
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setAddingProduct(false);
    }
  };

  const removeProduct = (productId: string) => {
    if (!canManage) {
      return;
    }
    Alert.alert('Удалить товар?', 'Эта строка товара будет удалена.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await stockApi.deleteProduct(session.token, productId);
            setTable((current) =>
              current
                ? {
                    ...current,
                    rows: current.rows.filter((row) => row.productId !== productId),
                  }
                : current,
            );
            setError('');
          } catch (removeError) {
            setError(errorMessage(removeError));
          }
        },
      },
    ]);
  };

  const renderTable = (rows: StockTableRow[]) => (
    <View style={styles.categoryBlock}>
      <View style={styles.categoryTable}>
        <View style={[styles.stickyColumn, styles.workerStickyColumn]}>
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn, styles.workerNameColumn, styles.workerHeaderCell]}>
              <Text style={[styles.headerText, styles.workerHeaderText]}>Товар</Text>
            </View>
          </View>
          {rows.map((row, index) => (
            <View
              key={row.productId}
              style={[
                styles.row,
                startsNewSubcategory(rows, index) && styles.subcategoryStartRow,
                isBreadSectionBreakProduct(row) && styles.breadSectionEndRow,
              ]}
            >
              <View style={[styles.cell, styles.nameColumn, styles.nameCell, styles.workerNameColumn, styles.workerCell]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nameScroll}>
                  <Text numberOfLines={1} style={[styles.nameText, styles.workerNameText]}>
                    {row.name}
                  </Text>
                </ScrollView>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.workerDataColumns}>
          <View style={styles.headerRow}>
            {table?.dates.map((date) => (
              <View key={date} style={styles.workerDateSlot}>
                <View
                  style={[
                    styles.headerCell,
                    styles.dateColumn,
                    styles.workerDateColumn,
                    styles.workerHeaderCell,
                    columnToneHeader(date),
                    secondWeekBoundaryStyle(date),
                    isMilkTable && isTuesday(date) && styles.workerTuesdayBoundary,
                  ]}
                >
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.dateWeekdayText, styles.workerDateWeekdayText]}>
                    {formatWeekday(date)}
                  </Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.dateDayText, styles.workerDateDayText]}>
                    {formatDate(date)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {rows.length === 0 ? (
            <View style={[styles.emptyRow, styles.workerEmptyRow]}>
              <Text style={styles.emptyRowText}>Нет товаров в этой таблице</Text>
            </View>
          ) : (
            rows.map((row, index) => (
              <View
                key={row.productId}
                style={[
                  styles.row,
                  startsNewSubcategory(rows, index) && styles.subcategoryStartRow,
                  isBreadSectionBreakProduct(row) && styles.breadSectionEndRow,
                ]}
              >
                {table?.dates.map((date) => {
                  const key = `${row.productId}:${date}`;
                  const pending = pendingKeys[key];
                  const value = row.values[date] ?? '';

                  return (
                    <View key={date} style={styles.workerDateSlot}>
                      <Pressable
                        style={[
                          styles.cell,
                          styles.dateColumn,
                          styles.workerDateColumn,
                          styles.workerCell,
                          styles.valueCell,
                          columnToneValue(date),
                          secondWeekBoundaryStyle(date),
                          isMilkTable && isTuesday(date) && styles.workerTuesdayBoundary,
                          pending && styles.pendingCell,
                        ]}
                        onPress={() => openEditCell(row, date)}
                      >
                        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.valueText, styles.workerValueText]}>{value || '-'}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );

  const stockNumberFor = (row: StockTableRow, date: string): number | null => {
    const raw = row.values[date];
    if (!raw) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const soldForDate = (row: StockTableRow, date: string): string => {
    if (activeBusinessCategory === 'Хлеб') {
      const previousDate = shiftDateKey(date, -1);
      const deliveryUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, previousDate), row.unitsInPack ?? 1);
      return computeDashboardSold(row.values[previousDate], deliveryUnits, row.values[date]);
    }
    if (activeBusinessCategory === 'Деликатесы') {
      const deliveryUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, date), row.unitsInPack ?? 1);
      return computeSold(row.values[shiftDateKey(date, -1)], deliveryUnits, row.values[date]);
    }
    const previous = stockNumberFor(row, shiftDateKey(date, -1));
    const current = stockNumberFor(row, date);
    if (previous === null || current === null) {
      return '';
    }
    return String(Math.max(0, previous - current));
  };

  const setDailyOrderValue = (productId: string, orderDate: string, value: string) => {
    const shopId = selectedShopId;
    if (!shopId) return;
    const nextValue = sanitizeOrderValue(value);
    const fieldKey = `${productId}:${orderDate}`;
    const previousValue = dashboardOrderValues[fieldKey] ?? '';
    setDashboardOrderValues((current) => ({ ...current, [fieldKey]: nextValue }));
    const packs = nextValue ? Number.parseInt(nextValue, 10) : 0;
    void stockApi.updateOrderValue(session.token, {
      shopId,
      productId,
      orderDate,
      packs: Number.isNaN(packs) ? 0 : packs,
    }).catch((saveError) => {
      setDashboardOrderValues((current) => ({ ...current, [fieldKey]: previousValue }));
      setError(errorMessage(saveError));
    });
  };

  const renderDailyManagerTable = (rows: StockTableRow[]) => (
    <View style={styles.categoryBlock}>
      <View style={styles.categoryTable}>
        <View style={styles.stickyColumn}>
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn, styles.dashboardNameHeader]}>
              <Text style={styles.headerText}>Товар</Text>
            </View>
          </View>
          {rows.map((row, index) => (
            <View
              key={row.productId}
              style={[
                styles.row,
                styles.dashboardDataRow,
                startsNewSubcategory(rows, index) && styles.subcategoryStartRow,
                isBreadSectionBreakProduct(row) && styles.breadSectionEndRow,
              ]}
            >
              <View style={[styles.cell, styles.nameColumn, styles.nameCell, styles.dashboardNameCell]}>
                <Text numberOfLines={2} ellipsizeMode="tail" style={styles.nameText}>
                  {managerProductName(row.name)}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.scrollableColumns}>
          <View>
            <View style={styles.headerRow}>
              {table?.dates.map((date) => (
                <View key={date} style={styles.dailyDateSlot}>
                  <View style={styles.dailyHeaderGroup}>
                    <Text style={styles.dateWeekdayText}>{formatWeekday(date)}</Text>
                    <Text style={styles.dateDayText}>{formatDate(date)}</Text>
                    <View style={styles.dailySubHeaderRow}>
                      <Text style={[styles.dailySubHeaderText, usesEveningStockHeaders && styles.breadDailySubHeaderText]}>{usesEveningStockHeaders ? 'Остаток вечер' : 'Ост'}</Text>
                      <Text style={[styles.dailySubHeaderText, styles.dailyOrderSubHeaderText, usesEveningStockHeaders && styles.breadDailySubHeaderText, usesMilkTones && styles.dashboardHeaderOrder]}>{usesEveningStockHeaders ? 'Заказ на' : 'Зак'}</Text>
                      <Text style={[styles.dailySubHeaderText, usesEveningStockHeaders && styles.breadDailySubHeaderText, usesMilkTones && styles.dashboardHeaderYellow]}>{usesEveningStockHeaders ? 'Продано' : 'Прод'}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {rows.length === 0 ? (
              <View style={[styles.emptyRow, styles.emptyScrollableRow]}>
                <Text style={styles.emptyRowText}>Нет товаров в этой таблице</Text>
              </View>
            ) : (
              rows.map((row, index) => (
                <View
                  key={row.productId}
                  style={[
                    styles.row,
                    styles.dashboardDataRow,
                    startsNewSubcategory(rows, index) && styles.subcategoryStartRow,
                    isBreadSectionBreakProduct(row) && styles.breadSectionEndRow,
                  ]}
                >
                  {table?.dates.map((date) => {
                    const orderDate = dailyOrderDateForStockDate(date, activeBusinessCategory);
                    return (
                      <View key={`${row.productId}:${date}`} style={styles.dailyDateSlot}>
                        <View style={styles.dailyValueGroup}>
                          <Pressable style={[styles.cell, styles.dailyValueCell]} onPress={() => openEditCell(row, date)}>
                            <Text style={styles.valueText}>{row.values[date] || '-'}</Text>
                          </Pressable>
                          <View style={[styles.cell, styles.dailyValueCell, styles.dailyOrderValueCell, usesMilkTones && styles.dashboardValueOrder]}>
                            <TextInput
                              value={orderPacksForDate(row.productId, orderDate)}
                              onChangeText={(nextValue) => setDailyOrderValue(row.productId, orderDate, nextValue)}
                              keyboardType="number-pad"
                              style={styles.dashboardOrderInput}
                              maxLength={MAX_ORDER_VALUE_LEN}
                              placeholder="-"
                              placeholderTextColor="#6d7d72"
                            />
                          </View>
                          <View style={[styles.cell, styles.dailyValueCell, usesMilkTones && styles.dashboardValueYellow]}>
                            <Text style={styles.valueText}>{soldForDate(row, date) || '-'}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );

  const dashboardHeaderToneStyle = (tone: DashboardTone) => {
    if (tone === 'order') {
      return styles.dashboardHeaderOrder;
    }
    if (tone === 'yellow') {
      return styles.dashboardHeaderYellow;
    }
    if (tone === 'green') {
      return styles.dashboardHeaderGreen;
    }
    if (tone === 'blue') {
      return styles.dashboardHeaderBlue;
    }
    return styles.dashboardHeaderNeutral;
  };

  const dashboardValueToneStyle = (tone: DashboardTone) => {
    if (tone === 'order') {
      return styles.dashboardValueOrder;
    }
    if (tone === 'yellow') {
      return styles.dashboardValueYellow;
    }
    if (tone === 'green') {
      return styles.dashboardValueGreen;
    }
    if (tone === 'blue') {
      return styles.dashboardValueBlue;
    }
    return styles.dashboardValueNeutral;
  };

  const dashboardColumnStyle = (column: DashboardColumn) => {
    if (column.kind === 'order') {
      return styles.dashboardOrderColumn;
    }
    if (column.kind === 'metric') {
      return styles.dashboardMetricColumn;
    }
    return styles.dashboardStockColumn;
  };

  const dashboardHeaderTitleStyle = (column: DashboardColumn) => [
    styles.dashboardHeaderTitle,
    column.kind === 'stock' && styles.dashboardHeaderTitleStock,
    column.kind === 'order' && !dashboardColumnSubtitle(column) && styles.dashboardHeaderTitleExpanded,
  ];

  const dashboardHeaderSubtitleStyle = (column: DashboardColumn) => [
    styles.dashboardHeaderSubtitle,
    column.kind === 'stock' && styles.dashboardHeaderSubtitleStock,
    !dashboardColumnSubtitle(column) && styles.dashboardHeaderSubtitleHidden,
  ];

  const dashboardValueTextStyle = (column: DashboardColumn) => [
    styles.valueText,
    column.kind === 'stock' && styles.valueTextStock,
    column.kind === 'order' && styles.valueTextOrder,
  ];

  const renderDashboardTable = (rows: StockTableRow[]) => (
    <View style={styles.categoryBlock}>
      <View style={styles.categoryTable}>
        <View style={styles.stickyColumn}>
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn, styles.dashboardNameHeader]}>
              <Text style={styles.headerText}>Товар</Text>
            </View>
          </View>
          {rows.map((row, index) => {
            const reference = productReferenceLabel(row);
            return (
              <View
                key={row.productId}
                style={[
                  styles.row,
                  styles.dashboardDataRow,
                  startsNewSubcategory(rows, index) && styles.subcategoryStartRow,
                  isBreadSectionBreakProduct(row) && styles.breadSectionEndRow,
                ]}
              >
                <View style={[styles.cell, styles.nameColumn, styles.nameCell, styles.dashboardNameCell]}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.nameText}>
                    {managerProductName(row.name)}
                  </Text>
                  {!!reference && (
                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.referenceText}>
                      {reference}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.scrollableColumns}>
          <View>
            <View style={styles.headerRow}>
              {DASHBOARD_COLUMNS.map((column) => (
                <View key={column.key} style={styles.dashboardColumnSlot}>
                  {column.key === 'currentTue' && <View style={[styles.tuesdaySeparator, styles.dashboardHeaderCell, styles.dashboardTuesdaySeparatorColumn]} />}
                  <View
                    style={[
                      styles.headerCell,
                      styles.dashboardHeaderCell,
                      dashboardColumnStyle(column),
                      dashboardHeaderToneStyle(column.tone),
                    ]}
                  >
                    <Text style={dashboardHeaderTitleStyle(column)}>{column.title}</Text>
                    <Text style={dashboardHeaderSubtitleStyle(column)}>{dashboardColumnSubtitle(column)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {rows.length === 0 ? (
              <View style={[styles.emptyRow, styles.emptyScrollableRow]}>
                <Text style={styles.emptyRowText}>Нет товаров в этой таблице</Text>
              </View>
            ) : (
              rows.map((row, index) => {
              const values = dashboardRowValues(row);
              return (
                <View
                  key={row.productId}
                  style={[
                    styles.row,
                    styles.dashboardDataRow,
                    startsNewSubcategory(rows, index) && styles.subcategoryStartRow,
                    isBreadSectionBreakProduct(row) && styles.breadSectionEndRow,
                  ]}
                >
                  {DASHBOARD_COLUMNS.map((column) => {
                    const value = values[column.key] ?? '';
                    if (column.kind === 'order' && isManualOrderKey(column.key)) {
                      const manualOrderKey = column.key;
                      return (
                        <View key={column.key} style={styles.dashboardColumnSlot}>
                          <View
                            style={[
                              styles.cell,
                              styles.dashboardValueCell,
                              dashboardColumnStyle(column),
                              dashboardValueToneStyle(column.tone),
                            ]}
                          >
                            <TextInput
                              value={value}
                              onChangeText={(nextValue) => setOrderCellValue(row.productId, manualOrderKey, nextValue)}
                              keyboardType="number-pad"
                              style={[styles.dashboardOrderInput, styles.dashboardOrderInputExpanded]}
                              maxLength={MAX_ORDER_VALUE_LEN}
                              placeholder="-"
                              placeholderTextColor="#6d7d72"
                            />
                          </View>
                        </View>
                      );
                    }

                    if (column.kind === 'stock' && isManualStockKey(column.key)) {
                      const date = currentStockDateForColumn(column.key);
                      const pending = date ? pendingKeys[`${row.productId}:${date}`] : false;

                      return (
                        <View key={column.key} style={styles.dashboardColumnSlot}>
                          {column.key === 'currentTue' && <View style={[styles.tuesdaySeparator, styles.dashboardValueCell, styles.dashboardTuesdaySeparatorColumn]} />}
                          <Pressable
                            style={[
                              styles.cell,
                              styles.dashboardValueCell,
                              dashboardColumnStyle(column),
                              dashboardValueToneStyle(column.tone),
                              pending && styles.pendingCell,
                            ]}
                            onPress={() => {
                              if (date) {
                                openEditCell(row, date);
                              }
                            }}
                          >
                            <Text style={dashboardValueTextStyle(column)}>{value || '-'}</Text>
                          </Pressable>
                        </View>
                      );
                    }

                    return (
                      <View key={column.key} style={styles.dashboardColumnSlot}>
                        <View
                          style={[
                            styles.cell,
                            styles.dashboardValueCell,
                            dashboardColumnStyle(column),
                            dashboardValueToneStyle(column.tone),
                          ]}
                        >
                          <Text style={dashboardValueTextStyle(column)}>{value || '-'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );

  const renderStockTab = () => (
    <>
      <View style={styles.controls}>
        <BusinessCategoryTabs
          active={activeBusinessCategory}
          onSelect={(category) => {
            setActiveBusinessCategory(category);
            setNewProductCategory(null);
          }}
        />
        <View style={styles.controlButtons}>
          {canManage && (
            <>
              <View style={styles.rangeButtons}>
                <Pressable
                  style={styles.calendarNavButton}
                  onPress={() => setManagerWindowStart((current) => shiftDateKey(current, -WEEK_DAYS))}
                >
                  <Text style={styles.calendarNavButtonText}>-1 нед.</Text>
                </Pressable>
                <Pressable style={styles.calendarNavButton} onPress={() => setManagerWindowStart(currentWeekStart())}>
                  <Text style={styles.calendarNavButtonText}>Текущая нед.</Text>
                </Pressable>
                <Pressable
                  style={styles.calendarNavButton}
                  onPress={() => setManagerWindowStart((current) => shiftDateKey(current, WEEK_DAYS))}
                >
                  <Text style={styles.calendarNavButtonText}>+1 нед.</Text>
                </Pressable>
              </View>
              <Pressable style={styles.primaryButton} onPress={() => setIsAddProductModalOpen(true)}>
                <Text style={styles.primaryButtonText}>Добавить товар</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void exportDashboard()}>
                <Text style={styles.secondaryButtonText}>Экспорт в Excel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.tableWrap}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tableVerticalContent}>
          {isInventory
            ? renderTable(orderedRows)
            : canManage && isMilkTable
            ? renderDashboardTable(orderedRows)
            : canManage
              ? renderDailyManagerTable(orderedRows)
              : renderTable(orderedRows)}
        </ScrollView>
      </View>
    </>
  );

  const renderContent = () => {
    if (activeTab === 'fob') {
      return (
        <ScrollView
          style={styles.tabContentWrap}
          contentContainerStyle={styles.fobScrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <View style={styles.fobPanelWrap}>
            {isStoreTablet ? <FobScannerPanel session={session} /> : <FobQrCard token={session.token} />}
          </View>
        </ScrollView>
      );
    }
    if (activeTab === 'audioQc') {
      return (
        <View style={styles.tabContentWrap}>
          {canManage ? (
            <AudioQcAdminPanel shops={shops} selectedShopId={selectedShopId} />
          ) : (
            <ScrollView
              style={styles.tabContentWrap}
              contentContainerStyle={styles.audioQcStack}
              keyboardShouldPersistTaps="handled"
            >
              <AudioQcStatusBadge />
              <AudioQcControls />
              <AudioQcRecordingsList />
            </ScrollView>
          )}
        </View>
      );
    }
    if (activeTab === 'tasks') {
      return (
        <View style={styles.tabContentWrap}>
          <TasksPanel
            key={taskNotificationVersion}
            session={session}
            fullHeight
            onTasksViewed={markTasksViewed}
          />
        </View>
      );
    }
    if (activeTab === 'orders') {
      return (
        <View style={styles.tabContentWrap}>
          <OrdersPanel session={session} />
        </View>
      );
    }
    if (activeTab === 'orderSheet') {
      return (
        <View style={styles.tabContentWrap}>
          <OrderSheetPanel session={session} />
        </View>
      );
    }
    if (activeTab === 'support') {
      return (
        <View style={styles.tabContentWrap}>
          <SupportPanel session={session} />
        </View>
      );
    }
    if (activeTab === 'users') {
      return (
        <View style={styles.tabContentWrap}>
          <UsersPanel session={session} />
        </View>
      );
    }
    return renderStockTab();
  };

  const logout = async () => {
    await unregisterPushToken();
    await onLogout();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2f6f4f" />
        <Text style={styles.loadingText}>Загрузка данных склада...</Text>
      </SafeAreaView>
    );
  }

  const tabs: Array<{ key: ScreenTab; label: string }> = canManage
    ? [
        { key: 'stock', label: 'Остатки' },
        { key: 'inventory', label: 'Инвентаризация' },
        { key: 'orderSheet', label: 'Заказ' },
        { key: 'audioQc', label: 'AI QC' },
        { key: 'tasks', label: 'Задачи' },
        { key: 'support', label: 'Поддержка' },
        { key: 'users', label: 'Пользователи' },
      ]
    : [
        { key: 'stock', label: 'Остатки' },
        { key: 'inventory', label: 'Инвентаризация' },
        { key: 'orders', label: 'Заказы' },
        { key: 'tasks', label: 'Задачи' },
        { key: 'support', label: 'Поддержка' },
        ...(isStoreTablet ? [{ key: 'audioQc' as ScreenTab, label: 'Запись' }] : []),
        ...((isWorker || isStoreTablet)
          ? [{ key: 'fob' as ScreenTab, label: isStoreTablet ? 'FOB-сканер' : 'FOB' }]
          : []),
      ];

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Учет остатков</Text>
          <Text style={styles.subtitle}>
            {session.user.fullName} · {canManage ? 'Менеджер' : isStoreTablet ? 'Планшет магазина' : 'Сотрудник'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.updateButton, checkingUpdate && styles.buttonDisabled]}
            onPress={() => void checkForAppUpdate()}
            disabled={checkingUpdate}
          >
            <Text style={styles.updateButtonText}>{checkingUpdate ? 'Проверка...' : 'Обновить приложение'}</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={() => void logout()}>
            <Text style={styles.logoutButtonText}>Выйти</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.contentWrap}>{renderContent()}</View>

      <View style={styles.bottomTabs}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.bottomTabButton, active && styles.bottomTabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              {tab.key === 'tasks' && hasUnreadTasks && <View style={styles.taskBadge} />}
              <Text style={[styles.bottomTabButtonText, active && styles.bottomTabButtonTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={isAddProductModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddProductModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Новый товар</Text>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>Название</Text>
              <TextInput
                value={newProductName}
                onChangeText={setNewProductName}
                style={styles.modalInput}
                placeholder="Введите название товара"
                placeholderTextColor="#7a8b7f"
                autoFocus
                maxLength={140}
              />
              <Text style={styles.formLabel}>Подкатегория *</Text>
              <View style={styles.categoryPicker}>
                {activeSubcategories.map((category) => {
                  const active = newProductCategory === category;
                  return (
                    <Pressable
                      key={category}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => setNewProductCategory(category)}
                    >
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{category}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.formLabel}>Тип упаковки</Text>
              <TextInput
                value={newProductPackType}
                onChangeText={setNewProductPackType}
                style={styles.modalInput}
                placeholder="ПЭТ, стакан, коробка..."
                placeholderTextColor="#7a8b7f"
                maxLength={40}
              />
              <View style={styles.productFieldsGrid}>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Штук в упаковке</Text>
                  <TextInput
                    value={newProductUnitsInPack}
                    onChangeText={(value) => setNewProductUnitsInPack(sanitizeIntegerInput(value, 4))}
                    style={styles.modalInput}
                    placeholder="6"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Вес упаковки, кг</Text>
                  <TextInput
                    value={newProductPackWeightKg}
                    onChangeText={(value) => setNewProductPackWeightKg(sanitizeDecimalInput(value, 3))}
                    style={styles.modalInput}
                    placeholder="2.88"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Срок годности, дней</Text>
                  <TextInput
                    value={newProductShelfLifeDays}
                    onChangeText={(value) => setNewProductShelfLifeDays(sanitizeIntegerInput(value, 4))}
                    style={styles.modalInput}
                    placeholder="14"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Цена с НДС, руб</Text>
                  <TextInput
                    value={newProductUnitPriceRubVat}
                    onChangeText={(value) => setNewProductUnitPriceRubVat(sanitizeDecimalInput(value, 2))}
                    style={styles.modalInput}
                    placeholder="68.61"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Минимальный остаток</Text>
                  <TextInput
                    value={newProductMinStockUnits}
                    onChangeText={(value) => setNewProductMinStockUnits(sanitizeIntegerInput(value))}
                    style={styles.modalInput}
                    placeholder="0"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Максимальный остаток</Text>
                  <TextInput
                    value={newProductMaxStockUnits}
                    onChangeText={(value) => setNewProductMaxStockUnits(sanitizeIntegerInput(value))}
                    style={styles.modalInput}
                    placeholder="15"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setIsAddProductModalOpen(false)}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveButton, addingProduct && styles.modalSaveButtonDisabled]}
                onPress={addProduct}
                disabled={addingProduct}
              >
                <Text style={styles.modalSaveText}>{addingProduct ? 'Сохранение...' : 'Сохранить'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingCell !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCell(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Изменить остаток</Text>
            <Text style={styles.modalMeta}>
              {editingCell?.productName} · {editingCell ? `${formatWeekday(editingCell.date)}, ${formatDate(editingCell.date)}` : ''}
            </Text>
            <TextInput
              value={editingValue}
              onChangeText={(value) => setEditingValue(sanitizeStockValue(value))}
              style={styles.modalInput}
              placeholder="0-50"
              placeholderTextColor="#7a8b7f"
              keyboardType="number-pad"
              maxLength={2}
              autoFocus
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (!savingEdit) void saveCell(true);
              }}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setEditingCell(null)} disabled={savingEdit}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveButton, savingEdit && styles.modalSaveButtonDisabled]}
                onPress={() => void saveCell(false)}
                disabled={savingEdit}
              >
                <Text style={styles.modalSaveText}>Сохранить</Text>
              </Pressable>
              <Pressable
                style={[styles.modalContinueButton, savingEdit && styles.modalSaveButtonDisabled]}
                onPress={() => void saveCell(true)}
                disabled={savingEdit}
              >
                <Text style={styles.modalContinueText}>Сохранить и продолжить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isShopPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsShopPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Выберите магазин</Text>
            <ScrollView style={styles.modalShopList}>
              {shops.map((shop) => (
                <Pressable
                  key={shop.id}
                  style={[styles.modalShopItem, selectedShopId === shop.id && styles.modalShopItemActive]}
                  onPress={() => {
                    setSelectedShopId(shop.id);
                    setIsShopPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalShopItemText, selectedShopId === shop.id && styles.modalShopItemTextActive]}>
                    {shop.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCancelButton} onPress={() => setIsShopPickerOpen(false)}>
              <Text style={styles.modalCancelText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eef3ee',
    paddingTop: topInset,
    gap: 10,
  },
  loadingText: {
    fontSize: 16,
    color: '#2d4034',
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    backgroundColor: '#eef3ee',
    paddingHorizontal: 16,
    paddingTop: topInset + 8,
    paddingBottom: 8,
  },
  header: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1f2f26',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 14,
    color: '#4f6155',
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateButton: {
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  updateButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  logoutButton: {
    borderRadius: 11,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  logoutButtonText: {
    color: '#223529',
    fontWeight: '800',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  contentWrap: {
    flex: 1,
  },
  tabContentWrap: {
    flex: 1,
    paddingBottom: 8,
  },
  audioQcStack: {
    gap: 8,
    marginBottom: 8,
  },
  fobScrollContent: {
    gap: 8,
    paddingBottom: 16,
  },
  fobPanelWrap: {
    minHeight: 520,
  },
  controls: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2f26',
  },
  controlButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2f6f4f',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#d5ddd5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#213125',
    fontSize: 13,
    fontWeight: '700',
  },
  rangeButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarNavButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b8c7bb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  calendarNavButtonDisabled: {
    opacity: 0.7,
  },
  calendarNavButtonText: {
    color: '#2d4034',
    fontWeight: '700',
    fontSize: 13,
  },
  sortRow: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  metaText: {
    color: '#35473b',
    fontWeight: '700',
    fontSize: 13,
  },
  viewModeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  viewModeButton: {
    borderWidth: 1,
    borderColor: '#bccabf',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f3f6f4',
  },
  viewModeButtonActive: {
    backgroundColor: '#1f4f37',
    borderColor: '#1f4f37',
  },
  viewModeButtonText: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 12,
  },
  viewModeButtonTextActive: {
    color: '#ffffff',
  },
  error: {
    marginBottom: 8,
    color: '#b04434',
    fontSize: 14,
    fontWeight: '700',
  },
  tableWrap: {
    flex: 1,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#dce4dc',
    overflow: 'hidden',
    marginBottom: 8,
  },
  tableVerticalContent: {
    minHeight: '100%',
    paddingBottom: 10,
  },
  categoryBlock: {
    borderTopWidth: 1,
    borderTopColor: '#b7c5b8',
  },
  categoryTitleRow: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#d6dfd6',
    borderBottomWidth: 1,
    borderBottomColor: '#9eb09f',
  },
  categoryTitle: {
    color: '#24382d',
    fontWeight: '800',
    fontSize: 15,
  },
  workerCategoryTitle: {
    fontSize: 16,
  },
  categoryTable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stickyColumn: {
    zIndex: 2,
    borderRightWidth: 1,
    borderRightColor: '#8fa091',
    backgroundColor: '#f7f7f7',
  },
  workerStickyColumn: {
    width: '40%',
    minWidth: 180,
  },
  scrollableColumns: {
    flex: 1,
  },
  workerDataColumns: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf1ec',
  },
  workerDateSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
  },
  dailyDateSlot: {
    flexDirection: 'row',
  },
  dashboardColumnSlot: {
    flexDirection: 'row',
  },
  tuesdaySeparator: {
    minHeight: 46,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
  },
  workerTuesdayBoundary: {
    borderLeftWidth: 3,
    borderLeftColor: '#526557',
  },
  headerCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    minHeight: 50,
    paddingHorizontal: 5,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  headerText: {
    fontSize: 14,
    color: '#2e312f',
    fontWeight: '800',
    textAlign: 'center',
  },
  workerHeaderText: {
    fontSize: 15,
  },
  dateWeekdayText: {
    fontSize: 12,
    color: '#2e312f',
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  workerDateWeekdayText: {
    fontSize: 13,
  },
  dateDayText: {
    marginTop: 1,
    fontSize: 11,
    color: '#3a4b3e',
    fontWeight: '700',
  },
  workerDateDayText: {
    fontSize: 12,
  },
  headerToneA: {
    backgroundColor: '#ffffff',
  },
  headerToneB: {
    backgroundColor: '#eef6ef',
  },
  secondWeekBoundary: {
    borderLeftWidth: 3,
    borderLeftColor: '#6f8fb4',
  },
  row: {
    flexDirection: 'row',
  },
  subcategoryStartRow: {
    borderTopWidth: 4,
    borderTopColor: '#526557',
  },
  breadSectionEndRow: {
    borderBottomWidth: 4,
    borderBottomColor: '#526557',
  },
  emptyRow: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#a7b5a8',
    backgroundColor: '#f6f8f6',
  },
  emptyScrollableRow: {
    minWidth: 240,
  },
  emptyRowText: {
    color: '#5a6d5e',
    fontSize: 13,
    fontWeight: '700',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    minHeight: 46,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  nameColumn: {
    width: 460,
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    backgroundColor: '#f7f7f7',
  },
  workerNameColumn: {
    width: '100%',
  },
  dateColumn: {
    width: 62,
  },
  workerDateColumn: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  workerHeaderCell: {
    minHeight: 54,
    height: 54,
  },
  workerCell: {
    minHeight: 52,
    height: 52,
  },
  workerEmptyRow: {
    flex: 1,
  },
  dashboardStockColumn: {
    width: 118,
  },
  dashboardTuesdaySeparatorColumn: {
    width: 118,
  },
  dashboardOrderColumn: {
    width: 92,
  },
  dashboardMetricColumn: {
    width: 106,
  },
  actionColumn: {
    width: 74,
    backgroundColor: '#ecf0ec',
  },
  nameCell: {
    justifyContent: 'center',
  },
  nameScroll: {
    width: '100%',
    flexGrow: 0,
  },
  nameText: {
    fontSize: 14,
    lineHeight: 17,
    color: '#222222',
    fontWeight: '800',
  },
  workerNameText: {
    fontSize: 16,
    lineHeight: 20,
  },
  referenceText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    color: '#4e5d53',
    fontWeight: '600',
  },
  valueCell: {
    backgroundColor: '#f9fbf8',
  },
  valueToneA: {
    backgroundColor: '#ffffff',
  },
  valueToneB: {
    backgroundColor: '#f1f8f1',
  },
  dashboardHeaderCell: {
    minHeight: 82,
    gap: 2,
  },
  dashboardNameHeader: {
    minHeight: 82,
  },
  dashboardHeaderTitle: {
    fontSize: 11,
    lineHeight: 13,
    color: '#1f2a21',
    fontWeight: '800',
    textAlign: 'center',
  },
  dashboardHeaderTitleStock: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
  },
  dashboardHeaderTitleExpanded: {
    flex: 1,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '800',
    textAlignVertical: 'center',
  },
  dashboardHeaderSubtitle: {
    fontSize: 10,
    color: '#1f2a21',
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 11,
  },
  dashboardHeaderSubtitleStock: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 11,
  },
  dashboardHeaderSubtitleHidden: {
    display: 'none',
  },
  dashboardHeaderNeutral: {
    backgroundColor: '#d9d9d9',
  },
  dashboardHeaderOrder: {
    backgroundColor: '#e4cccc',
  },
  dashboardHeaderYellow: {
    backgroundColor: '#ecec9c',
  },
  dashboardHeaderGreen: {
    backgroundColor: '#bdd196',
  },
  dashboardHeaderBlue: {
    backgroundColor: '#90c7da',
  },
  dashboardDataRow: {
    height: 68,
  },
  dashboardNameCell: {
    height: 68,
  },
  dashboardValueCell: {
    height: 68,
    backgroundColor: '#f4f6f4',
  },
  dailyHeaderGroup: {
    width: 154,
    minHeight: 82,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    backgroundColor: '#ecf1ec',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dailySubHeaderRow: {
    marginTop: 4,
    flexDirection: 'row',
  },
  dailySubHeaderText: {
    width: 56,
    textAlign: 'center',
    color: '#2e312f',
    fontWeight: '800',
    fontSize: 10,
  },
  breadDailySubHeaderText: {
    fontSize: 8,
    lineHeight: 9,
  },
  dailyOrderSubHeaderText: {
    width: 42,
  },
  dailyValueGroup: {
    width: 154,
    flexDirection: 'row',
  },
  dailyValueCell: {
    width: 56,
    height: 68,
    backgroundColor: '#f4f6f4',
  },
  dailyOrderValueCell: {
    width: 42,
  },
  dashboardValueNeutral: {
    backgroundColor: '#f2f2f2',
  },
  dashboardValueOrder: {
    backgroundColor: '#efe0e0',
  },
  dashboardValueYellow: {
    backgroundColor: '#f4f3bf',
  },
  dashboardValueGreen: {
    backgroundColor: '#dbe7bf',
  },
  dashboardValueBlue: {
    backgroundColor: '#c7e4ef',
  },
  dashboardOrderInput: {
    width: '100%',
    textAlign: 'center',
    color: '#223528',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
    paddingVertical: 0,
  },
  dashboardOrderInputExpanded: {
    fontSize: 17,
    lineHeight: 19,
    fontWeight: '700',
  },
  pendingCell: {
    opacity: 0.6,
  },
  valueText: {
    color: '#223528',
    fontSize: 15,
    fontWeight: '600',
  },
  workerValueText: {
    fontSize: 17,
  },
  valueTextStock: {
    fontSize: 17,
    fontWeight: '700',
  },
  valueTextOrder: {
    fontSize: 17,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#9f4038',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 10,
  },
  workerActionText: {
    color: '#55685b',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomTabs: {
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: '#c8d4cb',
    borderRadius: 12,
    backgroundColor: '#f3f7f3',
    padding: 5,
  },
  bottomTabButton: {
    position: 'relative',
    minHeight: 50,
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  bottomTabButtonActive: {
    backgroundColor: '#1f4f37',
  },
  bottomTabButtonText: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  bottomTabButtonTextActive: {
    color: '#ffffff',
  },
  taskBadge: {
    position: 'absolute',
    top: 5,
    right: '28%',
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#d4382f',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 32, 26, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c5d1c7',
    backgroundColor: '#f7faf7',
    padding: 14,
    gap: 12,
    maxHeight: '75%',
  },
  modalTitle: {
    color: '#1f2f26',
    fontSize: 19,
    fontWeight: '800',
  },
  modalMeta: {
    color: '#4d6052',
    fontSize: 18,
    fontWeight: '900',
  },
  modalBody: {
    maxHeight: 460,
  },
  modalBodyContent: {
    gap: 9,
    paddingBottom: 2,
  },
  formLabel: {
    color: '#344b3d',
    fontSize: 14,
    fontWeight: '800',
  },
  modalInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 20,
    color: '#1f2f26',
    fontWeight: '500',
  },
  productFieldsGrid: {
    gap: 10,
  },
  productField: {
    gap: 6,
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8d3ca',
    backgroundColor: '#edf3ee',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryChipActive: {
    backgroundColor: '#2f6f4f',
    borderColor: '#2f6f4f',
  },
  categoryChipText: {
    color: '#334b3d',
    fontWeight: '700',
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    borderRadius: 11,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#2b3d31',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSaveButton: {
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalContinueButton: {
    borderRadius: 11,
    backgroundColor: '#215c40',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSaveButtonDisabled: {
    opacity: 0.7,
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalContinueText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalShopList: {
    maxHeight: 320,
  },
  modalShopItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1dbd2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalShopItemActive: {
    borderColor: '#2f6f4f',
    backgroundColor: '#e8f2eb',
  },
  modalShopItemText: {
    color: '#2a3f33',
    fontSize: 14,
    fontWeight: '700',
  },
  modalShopItemTextActive: {
    color: '#1f4f37',
  },
});
