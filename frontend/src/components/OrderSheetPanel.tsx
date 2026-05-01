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
  'Молоко',
  'Сметана',
  'Творог',
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

  const renderTable = () => {
    if (!sheet) return null;
    const shopCount = sheet.shops.length;

    return (
      <ScrollView horizontal keyboardShouldPersistTaps="handled">
        <View>
          {/* Machine group header */}
          <View style={styles.machineRow}>
            <View style={[styles.machineCell, styles.nameColumn]} />
            <View style={[styles.machineCell, { width: shopCount * SHOP_COL_WIDTH }]}>
              <Text style={styles.machineText}>МАШИНА 1</Text>
            </View>
            <View style={[styles.machineCell, styles.totalCol]} />
            <View style={[styles.machineCell, styles.weightCol]} />
          </View>

          {/* Shop names header */}
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn]}>
              <Text style={styles.headerNameText}>Номенклатура</Text>
            </View>
            {sheet.shops.map((shop) => (
              <View key={shop.id} style={[styles.headerCell, styles.shopCol]}>
                <Text style={styles.shopHeaderText} numberOfLines={2}>{shop.name}</Text>
              </View>
            ))}
            <View style={[styles.headerCell, styles.totalCol, styles.totalHeaderBg]}>
              <Text style={styles.totalHeaderText}>ИТОГО</Text>
            </View>
            <View style={[styles.headerCell, styles.weightCol, styles.totalHeaderBg]}>
              <Text style={styles.totalHeaderText}>ВЕС</Text>
            </View>
          </View>

          {/* Category sections */}
          <ScrollView style={styles.bodyScroll} nestedScrollEnabled>
            {PRODUCT_CATEGORIES.map((category) => {
              const rows = rowsByCategory[category];
              if (!rows || rows.length === 0) return null;
              return (
                <View key={category}>
                  {/* Category header row */}
                  <View style={styles.categoryRow}>
                    <View style={[styles.categoryCell, styles.nameColumn]}>
                      <Text style={styles.categoryText}>{category}</Text>
                    </View>
                    {sheet.shops.map((shop) => (
                      <View key={shop.id} style={[styles.categoryCell, styles.shopCol]} />
                    ))}
                    <View style={[styles.categoryCell, styles.totalCol]} />
                    <View style={[styles.categoryCell, styles.weightCol]} />
                  </View>

                  {/* Product data rows */}
                  {rows.map((row) => (
                    <View key={row.productId} style={styles.dataRow}>
                      <View style={[styles.cell, styles.nameColumn, styles.nameCell]}>
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.nameText}>
                          {row.productName}
                        </Text>
                      </View>
                      {sheet.shops.map((shop) => {
                        const val = row.shopValues[shop.id];
                        return (
                          <View
                            key={shop.id}
                            style={[styles.cell, styles.shopCol, val ? styles.filledCell : undefined]}
                          >
                            <Text style={styles.valueText}>{val || ''}</Text>
                          </View>
                        );
                      })}
                      <View style={[styles.cell, styles.totalCol, styles.totalCellBg]}>
                        <Text style={styles.totalValueText}>{row.total || ''}</Text>
                      </View>
                      <View style={[styles.cell, styles.weightCol, styles.totalCellBg]}>
                        <Text style={styles.weightValueText}>
                          {computeWeight(row.total, row.packWeightKg)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>
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
        <View style={styles.tableWrap}>
          <Text style={styles.sheetDate}>
            Заказ на {formatDateLabel(sheet.date)} — магазинов: {sheet.shops.length}
          </Text>
          {renderTable()}
        </View>
      )}
    </View>
  );
};

const SHOP_COL_WIDTH = 62;

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    gap: 8,
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
    marginBottom: 6,
  },
  tableWrap: {
    flex: 1,
  },
  bodyScroll: {
    flex: 1,
  },

  // Machine group header
  machineRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#999',
  },
  machineCell: {
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#999',
  },
  machineText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },

  // Column header row
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 2,
    borderBottomColor: '#666',
  },
  headerCell: {
    paddingHorizontal: 2,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#999',
  },
  headerNameText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
  },
  shopHeaderText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  totalHeaderBg: {
    backgroundColor: '#c6efce',
  },
  totalHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006100',
  },

  // Category row (yellow)
  categoryRow: {
    flexDirection: 'row',
    backgroundColor: '#ffff99',
    borderBottomWidth: 1,
    borderBottomColor: '#999',
  },
  categoryCell: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#ccc',
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
  },

  // Data row
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
  },
  cell: {
    paddingHorizontal: 2,
    paddingVertical: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#d0d0d0',
  },
  nameColumn: {
    width: 200,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  nameCell: {
    backgroundColor: '#fff',
  },
  nameText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#000',
  },
  shopCol: {
    width: SHOP_COL_WIDTH,
  },
  totalCol: {
    width: 55,
  },
  weightCol: {
    width: 55,
  },
  filledCell: {
    backgroundColor: '#fce4ec',
  },
  valueText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  totalCellBg: {
    backgroundColor: '#e8f5e9',
  },
  totalValueText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006100',
  },
  weightValueText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#006100',
  },
});
