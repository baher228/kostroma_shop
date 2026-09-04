import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ordersApi } from '../api/orders';
import {
  ALLOWED_ORDER_WEEKDAYS,
  BUSINESS_CATEGORIES,
  DEFAULT_BUSINESS_CATEGORY,
  MACHINE_NUMBERS,
  type MachineNumber,
} from '../constants/dashboard';
import { sortProductsLikeImage } from '../constants/productOrdering';
import { BusinessCategory, OrderSheet, OrderSheetRow, Session, Shop } from '../types/models';

type OrderSheetPanelProps = {
  session: Session;
};

type MachineGroup = {
  machineNumber: MachineNumber;
  shops: Shop[];
  width: number;
};

const SHOP_COL_WIDTH = 96;
const TOTAL_COL_WIDTH = 82;
const WEIGHT_COL_WIDTH = 92;

const todayDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

const isAllowedOrderDate = (dateKey: string): boolean => ALLOWED_ORDER_WEEKDAYS.has(parseDateKey(dateKey).getDay());

const shiftToAllowedOrderDate = (dateKey: string, direction: 1 | -1): string => {
  const nextDate = parseDateKey(dateKey);
  do {
    nextDate.setDate(nextDate.getDate() + direction);
  } while (!ALLOWED_ORDER_WEEKDAYS.has(nextDate.getDay()));
  return toDateKey(nextDate);
};

const shiftOneDay = (dateKey: string, direction: 1 | -1): string => {
  const nextDate = parseDateKey(dateKey);
  nextDate.setDate(nextDate.getDate() + direction);
  return toDateKey(nextDate);
};

const nearestAllowedOrderDate = (dateKey: string): string => {
  return shiftToAllowedOrderDate(dateKey, 1);
};

const isDelicaciesOrderDate = (dateKey: string): boolean => parseDateKey(dateKey).getDay() !== 0;

const shiftToDelicaciesOrderDate = (dateKey: string, direction: 1 | -1): string => {
  const nextDate = parseDateKey(dateKey);
  do {
    nextDate.setDate(nextDate.getDate() + direction);
  } while (nextDate.getDay() === 0);
  return toDateKey(nextDate);
};

const nextOrderDateForCategory = (category: BusinessCategory): string => {
  const today = todayDateKey();
  if (category === 'Молоко') return nearestAllowedOrderDate(today);
  if (category === 'Деликатесы') return shiftToDelicaciesOrderDate(today, 1);
  return shiftOneDay(today, 1);
};

const formatWeekdayLabel = (iso: string): string =>
  parseDateKey(iso).toLocaleDateString('ru-RU', { weekday: 'long' });

const formatWeight = (total: number, packWeightKg: number | null): string => {
  if (!total || packWeightKg === null || packWeightKg === undefined) {
    return '';
  }
  return (total * packWeightKg).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

const cellKey = (productId: string, shopId: string) => `${productId}:${shopId}`;

const startsNewSubcategory = <T extends { category: string }>(rows: T[], index: number): boolean =>
  index > 0 && rows[index - 1]?.category !== rows[index]?.category;

export const OrderSheetPanel = ({ session }: OrderSheetPanelProps) => {
  const [date, setDate] = useState(nearestAllowedOrderDate(todayDateKey()));
  const [inputDate, setInputDate] = useState(nearestAllowedOrderDate(todayDateKey()));
  const [activeBusinessCategory, setActiveBusinessCategory] = useState<BusinessCategory>(DEFAULT_BUSINESS_CATEGORY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<OrderSheet | null>(null);
  const [query, setQuery] = useState('');

  const loadSheet = async (targetDate: string) => {
    try {
      setLoading(true);
      setError('');
      const result = await ordersApi.sheet(session.token, targetDate, activeBusinessCategory);
      setSheet(result);
      setDate(targetDate);
      setInputDate(targetDate);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSheet(nextOrderDateForCategory(activeBusinessCategory));
  }, [activeBusinessCategory]);

  const handleLoadDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('\u0424\u043e\u0440\u043c\u0430\u0442 \u0434\u0430\u0442\u044b: YYYY-MM-DD');
      return;
    }
    if (activeBusinessCategory === 'Молоко' && !isAllowedOrderDate(inputDate)) {
      setError(
        '\u041b\u0438\u0441\u0442 \u0437\u0430\u043a\u0430\u0437\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0432\u043e \u0432\u0442\u043e\u0440\u043d\u0438\u043a, \u0447\u0435\u0442\u0432\u0435\u0440\u0433 \u0438 \u0441\u0443\u0431\u0431\u043e\u0442\u0443.',
      );
      return;
    }
    if (activeBusinessCategory === 'Деликатесы' && !isDelicaciesOrderDate(inputDate)) {
      setError('По воскресеньям поставки деликатесов нет.');
      return;
    }
    void loadSheet(inputDate);
  };

  const shiftDate = (direction: 1 | -1) => {
    const next = activeBusinessCategory === 'Молоко'
      ? shiftToAllowedOrderDate(date, direction)
      : activeBusinessCategory === 'Деликатесы'
        ? shiftToDelicaciesOrderDate(date, direction)
        : shiftOneDay(date, direction);
    setInputDate(next);
    void loadSheet(next);
  };

  const visibleRows = useMemo(() => {
    if (!sheet) {
      return [];
    }
    const normalizedQuery = query.trim().toLowerCase();
    const rows: OrderSheetRow[] = [];
    for (const row of sheet.rows) {
      if (normalizedQuery && !row.productName.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      rows.push(row);
    }
    return sortProductsLikeImage(
      rows.map((row) => ({ ...row, name: row.productName, category: row.category })),
    ).map(({ name: _name, ...row }) => row as OrderSheetRow);
  }, [query, sheet]);

  const shopsByMachine = useMemo(() => {
    const grouped: Record<MachineNumber, Shop[]> = {
      1: [],
      2: [],
      3: [],
    };
    if (!sheet) {
      return grouped;
    }
    for (const shop of sheet.shops) {
      const machine = shop.machineNumber >= 1 && shop.machineNumber <= 3 ? (shop.machineNumber as MachineNumber) : 1;
      grouped[machine].push(shop);
    }
    return grouped;
  }, [sheet]);

  const machineGroups = useMemo<MachineGroup[]>(() => {
    const groups = MACHINE_NUMBERS.map((machineNumber) => {
      const shops = shopsByMachine[machineNumber];
      return {
        machineNumber,
        shops,
        width: shops.length * SHOP_COL_WIDTH + TOTAL_COL_WIDTH + WEIGHT_COL_WIDTH,
      };
    }).filter((group) => group.shops.length > 0);

    if (groups.length > 0) {
      return groups;
    }

    return [
      {
        machineNumber: 1,
        shops: [],
        width: TOTAL_COL_WIDTH + WEIGHT_COL_WIDTH,
      },
    ];
  }, [shopsByMachine]);

  const rowValue = (row: OrderSheetRow, shopId: string): number => row.shopValues[shopId] ?? 0;

  const machineTotal = (row: OrderSheetRow, shops: Shop[]): number =>
    shops.reduce((sum, shop) => sum + rowValue(row, shop.id), 0);
  const machineWeight = (rows: OrderSheetRow[], shops: Shop[]): number =>
    Math.round(rows.reduce((sum, row) => sum + machineTotal(row, shops) * (row.packWeightKg ?? 0), 0) * 100) / 100;

  if (loading && !sheet) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

  const renderMachineHeader = (group: MachineGroup) => (
    <View key={`machine:${group.machineNumber}`} style={styles.machineGroup}>
      <View style={[styles.machineTitleCell, { width: group.width }]}>
        <Text style={styles.machineText}>{`\u041c\u0410\u0428\u0418\u041d\u0410 ${group.machineNumber}`}</Text>
      </View>
    </View>
  );

  const renderMachineColumns = (row: OrderSheetRow, group: MachineGroup) => {
    const total = machineTotal(row, group.shops);
    const weight = formatWeight(total, row.packWeightKg);

    return (
      <View key={`${row.productId}:${group.machineNumber}`} style={styles.machineGroup}>
        {group.shops.map((shop) => (
          <View key={cellKey(row.productId, shop.id)} style={[styles.cell, styles.shopCol, styles.editCell]}>
            <Text style={styles.valueText}>{rowValue(row, shop.id) || ''}</Text>
          </View>
        ))}
        <View style={[styles.cell, styles.totalCol, styles.totalCellBg]}>
          <Text style={styles.totalValueText}>{total || ''}</Text>
        </View>
        <View style={[styles.cell, styles.weightCol, styles.totalCellBg]}>
          <Text style={styles.weightValueText}>{weight}</Text>
        </View>
      </View>
    );
  };

  const renderTable = () => {
    if (!sheet) {
      return null;
    }

    return (
      <ScrollView horizontal keyboardShouldPersistTaps="handled">
        <View>
          <View style={styles.machineRow}>
            <View style={[styles.machineLeadCell, styles.nameColumn]} />
            {machineGroups.map((group) => renderMachineHeader(group))}
          </View>

          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn]}>
              <Text style={styles.headerNameText}>
                {'\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430'}
              </Text>
            </View>
            {machineGroups.map((group) => (
              <View key={`header:${group.machineNumber}`} style={styles.machineGroup}>
                {group.shops.map((shop) => (
                  <View key={shop.id} style={[styles.headerCell, styles.shopCol]}>
                    <Text style={styles.shopHeaderText} numberOfLines={3}>
                      {shop.name}
                    </Text>
                  </View>
                ))}
                <View style={[styles.headerCell, styles.totalCol, styles.totalHeaderBg]}>
                  <Text style={styles.totalHeaderText}>{'\u0418\u0422\u041e\u0413\u041e'}</Text>
                </View>
                <View style={[styles.headerCell, styles.weightCol, styles.totalHeaderBg]}>
                  <Text style={styles.totalHeaderText}>{'\u0412\u0415\u0421'}</Text>
                </View>
              </View>
            ))}
          </View>

          <ScrollView style={styles.bodyScroll} nestedScrollEnabled>
            {visibleRows.map((row, index) => (
              <View key={row.productId} style={[styles.dataRow, startsNewSubcategory(visibleRows, index) && styles.subcategoryStartRow]}>
                <View style={[styles.cell, styles.nameColumn, styles.nameCell]}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.nameText}>
                    {row.productName}
                  </Text>
                </View>
                {machineGroups.map((group) => renderMachineColumns(row, group))}
              </View>
            ))}
            <View style={styles.machineWeightRow}>
              <View style={[styles.cell, styles.nameColumn, styles.machineWeightCell]}>
                <Text style={styles.machineWeightText}>ОБЩИЙ ВЕС ПО МАШИНАМ</Text>
              </View>
              {machineGroups.map((group) => (
                <View key={`weight:${group.machineNumber}`} style={styles.machineGroup}>
                  {group.shops.map((shop) => (
                    <View key={`weight:${group.machineNumber}:${shop.id}`} style={[styles.cell, styles.shopCol, styles.machineWeightCell]} />
                  ))}
                  <View style={[styles.cell, styles.totalCol, styles.machineWeightCell]}>
                    <Text style={styles.machineWeightText}>ВЕС, КГ</Text>
                  </View>
                  <View style={[styles.cell, styles.weightCol, styles.machineWeightCell]}>
                    <Text style={styles.machineWeightValue}>
                      {formatWeight(1, machineWeight(visibleRows, group.shops))}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{'\u0417\u0430\u043a\u0430\u0437'}</Text>

      <View style={styles.businessTabs}>
        {BUSINESS_CATEGORIES.map((category) => {
          const active = activeBusinessCategory === category;
          return (
            <Pressable
              key={category}
              style={[styles.businessTabButton, active && styles.businessTabButtonActive]}
              onPress={() => setActiveBusinessCategory(category)}
            >
              <Text style={[styles.businessTabText, active && styles.businessTabTextActive]}>{category}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dateRow}>
        <Pressable style={styles.dateButton} onPress={() => shiftDate(-1)}>
          <Text style={styles.dateButtonText}>{'<'}</Text>
        </Pressable>
        <TextInput
          value={inputDate}
          onChangeText={setInputDate}
          style={styles.dateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#7a8b7f"
        />
        <Pressable style={styles.dateButton} onPress={() => shiftDate(1)}>
          <Text style={styles.dateButtonText}>{'>'}</Text>
        </Pressable>
        <Pressable style={styles.loadButton} onPress={handleLoadDate}>
          <Text style={styles.loadButtonText}>{'\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c'}</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={'\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e...'}
        placeholderTextColor="#7a8b7f"
        style={styles.searchInput}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      {sheet && (
        <View style={styles.tableWrap}>
          <Text style={styles.weekdayBadge}>{formatWeekdayLabel(sheet.date)}</Text>
          <Text style={styles.sheetDate}>
            {`\u0417\u0430\u043a\u0430\u0437 \u043d\u0430 ${formatDateLabel(sheet.date)} — \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u043e\u0432: ${sheet.shops.length}`}
          </Text>
          {renderTable()}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    gap: 12,
  },
  businessTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  businessTabButton: {
    borderWidth: 1,
    borderColor: '#bccabf',
    borderRadius: 10,
    backgroundColor: '#f3f6f4',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  businessTabButtonActive: {
    backgroundColor: '#1f4f37',
    borderColor: '#1f4f37',
  },
  businessTabText: {
    color: '#2f4437',
    fontWeight: '800',
    fontSize: 12,
  },
  businessTabTextActive: {
    color: '#ffffff',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#213428',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 10,
    backgroundColor: '#f8fbf9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2f26',
  },
  dateButton: {
    borderRadius: 10,
    backgroundColor: '#e0e8e1',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dateButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2f6f4f',
  },
  loadButton: {
    borderRadius: 10,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  loadButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 10,
    backgroundColor: '#f8fbf9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#1f2f26',
  },
  error: {
    color: '#b53030',
    fontSize: 13,
    fontWeight: '600',
  },
  weekdayBadge: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#edf3ee',
    color: '#2f6f4f',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  sheetDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4f6155',
    marginBottom: 6,
  },
  tableWrap: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#dce4dc',
    overflow: 'hidden',
    padding: 10,
  },
  bodyScroll: {
    flex: 1,
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  machineLeadCell: {
    borderWidth: 1,
    borderColor: '#7f8d81',
    backgroundColor: '#d6dfd6',
  },
  machineGroup: {
    flexDirection: 'row',
  },
  machineTitleCell: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#7f8d81',
    backgroundColor: '#ecf1ec',
  },
  machineText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf1ec',
    borderBottomWidth: 2,
    borderBottomColor: '#7f8d81',
  },
  headerCell: {
    paddingHorizontal: 5,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderRightColor: '#7f8d81',
    borderBottomColor: '#7f8d81',
    backgroundColor: '#ecf1ec',
  },
  headerNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  shopHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  totalHeaderBg: {
    backgroundColor: '#d9d9d9',
  },
  totalHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1f2a21',
    textAlign: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    backgroundColor: '#d6dfd6',
    borderBottomWidth: 1,
    borderBottomColor: '#9eb09f',
  },
  categoryCell: {
    paddingVertical: 7,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: '#9eb09f',
    justifyContent: 'center',
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#24382d',
    textAlign: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
  },
  subcategoryStartRow: {
    borderTopWidth: 4,
    borderTopColor: '#526557',
  },
  cell: {
    paddingHorizontal: 5,
    paddingVertical: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#7f8d81',
    minHeight: 46,
  },
  nameColumn: {
    width: 310,
    alignItems: 'flex-start',
    paddingHorizontal: 10,
  },
  nameCell: {
    backgroundColor: '#f7f7f7',
  },
  nameText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222222',
  },
  shopCol: {
    width: SHOP_COL_WIDTH,
  },
  totalCol: {
    width: TOTAL_COL_WIDTH,
  },
  weightCol: {
    width: WEIGHT_COL_WIDTH,
  },
  editCell: {
    backgroundColor: '#f1f8f1',
  },
  valueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  totalCellBg: {
    backgroundColor: '#f2f2f2',
  },
  totalValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#223528',
  },
  weightValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#223528',
  },
  machineWeightRow: {
    flexDirection: 'row',
  },
  machineWeightCell: {
    backgroundColor: '#d6dfd6',
  },
  machineWeightText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#20352a',
    textAlign: 'center',
  },
  machineWeightValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#20352a',
  },
});
