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
import { OrderSheet, OrderSheetRow, Session } from '../types/models';

type OrderSheetPanelProps = {
  session: Session;
};

const PRODUCT_CATEGORIES = [
  'Йогурты',
  'Кефир, Ряженка, Снежок',
  'Сметана, Творог, Масло',
  'Молоко, Сливки',
] as const;

const todayDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const formatPrice = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return value.toFixed(2);
};

const computeWeight = (total: number, packWeightKg: number | null): string => {
  if (!total || packWeightKg === null || packWeightKg === undefined) return '';
  return (total * packWeightKg).toFixed(2);
};

export const OrderSheetPanel = ({ session }: OrderSheetPanelProps) => {
  const [date, setDate] = useState(todayDateKey());
  const [inputDate, setInputDate] = useState(todayDateKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<OrderSheet | null>(null);
  const [query, setQuery] = useState('');

  const loadSheet = async (targetDate: string) => {
    try {
      setLoading(true);
      setError('');
      const result = await ordersApi.sheet(session.token, targetDate);
      setSheet(result);
      setDate(targetDate);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Ошибка загрузки.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSheet(date);
  }, []);

  const handleLoadDate = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      void loadSheet(inputDate);
    } else {
      setError('Формат даты: YYYY-MM-DD');
    }
  };

  const shiftDate = (days: number) => {
    const [y, m, dv] = date.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, dv || 1);
    d.setDate(d.getDate() + days);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setInputDate(next);
    void loadSheet(next);
  };

  const rowsByCategory = useMemo(() => {
    if (!sheet) return {};
    const normalizedQuery = query.trim().toLowerCase();
    const grouped: Record<string, OrderSheetRow[]> = {};
    for (const cat of PRODUCT_CATEGORIES) {
      grouped[cat] = [];
    }
    for (const row of sheet.rows) {
      if (normalizedQuery && !row.productName.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      const cat = PRODUCT_CATEGORIES.includes(row.category as (typeof PRODUCT_CATEGORIES)[number])
        ? row.category
        : PRODUCT_CATEGORIES[0];
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(row);
    }
    return grouped;
  }, [sheet, query]);

  if (loading && !sheet) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

  const renderCategoryTable = (category: string, rows: OrderSheetRow[]) => {
    if (!sheet || rows.length === 0) return null;
    return (
      <View key={category} style={styles.categoryBlock}>
        <View style={styles.categoryTitleRow}>
          <Text style={styles.categoryTitle}>{category}</Text>
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <View>
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={[styles.headerCell, styles.nameColumn]}>
                <Text style={styles.headerMainText}>Номенклатура</Text>
              </View>
              <View style={[styles.headerCell, styles.metaCol]}>
                <Text style={styles.headerMainText}>Упак.</Text>
              </View>
              <View style={[styles.headerCell, styles.metaCol]}>
                <Text style={styles.headerMainText}>Шт/кг</Text>
              </View>
              <View style={[styles.headerCell, styles.metaCol]}>
                <Text style={styles.headerMainText}>Вес уп.</Text>
              </View>
              <View style={[styles.headerCell, styles.metaCol]}>
                <Text style={styles.headerMainText}>Срок</Text>
              </View>
              <View style={[styles.headerCell, styles.priceCol]}>
                <Text style={styles.headerMainText}>Цена</Text>
              </View>
              {sheet.shops.map((shop) => (
                <View key={shop.id} style={[styles.headerCell, styles.shopCol, styles.shopHeader]}>
                  <Text style={styles.shopHeaderText} numberOfLines={2}>{shop.name}</Text>
                </View>
              ))}
              <View style={[styles.headerCell, styles.totalCol, styles.totalHeader]}>
                <Text style={styles.headerMainText}>ИТОГО</Text>
              </View>
              <View style={[styles.headerCell, styles.weightCol, styles.weightHeader]}>
                <Text style={styles.headerMainText}>ВЕС</Text>
              </View>
            </View>

            {/* Data rows */}
            {rows.map((row) => (
              <View key={row.productId} style={styles.dataRow}>
                <View style={[styles.cell, styles.nameColumn, styles.nameCell]}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.nameText}>
                    {row.productName}
                  </Text>
                </View>
                <View style={[styles.cell, styles.metaCol]}>
                  <Text style={styles.metaText}>{row.packType ?? ''}</Text>
                </View>
                <View style={[styles.cell, styles.metaCol]}>
                  <Text style={styles.metaText}>{formatNumber(row.unitsInPack)}</Text>
                </View>
                <View style={[styles.cell, styles.metaCol]}>
                  <Text style={styles.metaText}>{formatNumber(row.packWeightKg)}</Text>
                </View>
                <View style={[styles.cell, styles.metaCol]}>
                  <Text style={styles.metaText}>{formatNumber(row.shelfLifeDays)}</Text>
                </View>
                <View style={[styles.cell, styles.priceCol]}>
                  <Text style={styles.metaText}>{formatPrice(row.unitPriceRubVat)}</Text>
                </View>
                {sheet.shops.map((shop) => {
                  const val = row.shopValues[shop.id];
                  return (
                    <View
                      key={shop.id}
                      style={[styles.cell, styles.shopCol, val ? styles.filledShopCell : undefined]}
                    >
                      <Text style={styles.shopValueText}>{val || ''}</Text>
                    </View>
                  );
                })}
                <View style={[styles.cell, styles.totalCol, row.total > 0 ? styles.filledTotalCell : undefined]}>
                  <Text style={styles.totalValueText}>{row.total || ''}</Text>
                </View>
                <View style={[styles.cell, styles.weightCol]}>
                  <Text style={styles.weightValueText}>{computeWeight(row.total, row.packWeightKg)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Лист заказа</Text>

      <View style={styles.dateRow}>
        <Pressable style={styles.dateButton} onPress={() => shiftDate(-1)}>
          <Text style={styles.dateButtonText}>◀</Text>
        </Pressable>
        <TextInput
          value={inputDate}
          onChangeText={setInputDate}
          style={styles.dateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#7a8b7f"
        />
        <Pressable style={styles.dateButton} onPress={() => shiftDate(1)}>
          <Text style={styles.dateButtonText}>▶</Text>
        </Pressable>
        <Pressable style={styles.loadButton} onPress={handleLoadDate}>
          <Text style={styles.loadButtonText}>{loading ? '...' : 'Загрузить'}</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Поиск по названию..."
        placeholderTextColor="#7a8b7f"
        style={styles.searchInput}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      {sheet && (
        <ScrollView style={styles.tableScroll}>
          <Text style={styles.sheetDate}>
            Заказ на {formatDateLabel(sheet.date)} — магазинов: {sheet.shops.length}
          </Text>
          {PRODUCT_CATEGORIES.map((cat) =>
            renderCategoryTable(cat, rowsByCategory[cat] ?? []),
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    gap: 10,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2f26',
  },
  dateButton: {
    borderRadius: 10,
    backgroundColor: '#e0e8e1',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2f6f4f',
  },
  loadButton: {
    borderRadius: 10,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 10,
    backgroundColor: '#f8fbf9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1f2f26',
  },
  error: {
    color: '#b53030',
    fontSize: 13,
    fontWeight: '600',
  },
  sheetDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f6155',
    marginBottom: 8,
  },
  tableScroll: {
    flex: 1,
  },
  categoryBlock: {
    marginBottom: 16,
  },
  categoryTitleRow: {
    backgroundColor: '#e8f0ea',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1a3a26',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#dceadf',
    borderBottomWidth: 1,
    borderBottomColor: '#b8cdb8',
  },
  headerCell: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#c6d3c8',
  },
  headerMainText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#213428',
    textAlign: 'center',
  },
  nameColumn: {
    width: 170,
    alignItems: 'flex-start',
  },
  metaCol: {
    width: 50,
  },
  priceCol: {
    width: 60,
  },
  shopCol: {
    width: 65,
  },
  totalCol: {
    width: 55,
  },
  weightCol: {
    width: 55,
  },
  shopHeader: {
    backgroundColor: '#fde8e8',
  },
  totalHeader: {
    backgroundColor: '#e8f5e9',
  },
  weightHeader: {
    backgroundColor: '#e3f2fd',
  },
  shopHeaderText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#b53030',
    textAlign: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e1',
  },
  cell: {
    paddingHorizontal: 4,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e8ede9',
  },
  nameCell: {
    alignItems: 'flex-start',
  },
  nameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#233629',
  },
  metaText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#4f6155',
    textAlign: 'center',
  },
  shopValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b53030',
  },
  filledShopCell: {
    backgroundColor: '#fef3f3',
  },
  filledTotalCell: {
    backgroundColor: '#e8f5e9',
  },
  totalValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1b5e20',
  },
  weightValueText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1565c0',
  },
});
