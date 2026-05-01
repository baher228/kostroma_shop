import { useEffect, useState } from 'react';
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
import { OrderSheet, Session } from '../types/models';

type OrderSheetPanelProps = {
  session: Session;
};

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

export const OrderSheetPanel = ({ session }: OrderSheetPanelProps) => {
  const [date, setDate] = useState(todayDateKey());
  const [inputDate, setInputDate] = useState(todayDateKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<OrderSheet | null>(null);

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
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setInputDate(next);
    void loadSheet(next);
  };

  if (loading && !sheet) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

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

      {!!error && <Text style={styles.error}>{error}</Text>}

      {sheet && (
        <View style={styles.sheetWrap}>
          <Text style={styles.sheetDate}>
            Заказ на {formatDateLabel(sheet.date)} — магазинов: {sheet.shops.length}
          </Text>

          <ScrollView horizontal style={styles.tableScrollH}>
            <View>
              {/* Header row */}
              <View style={styles.tableRow}>
                <View style={[styles.tableCell, styles.productCell, styles.headerCell]}>
                  <Text style={styles.headerText}>Номенклатура</Text>
                </View>
                {sheet.shops.map((shop) => (
                  <View key={shop.id} style={[styles.tableCell, styles.shopCell, styles.headerCell]}>
                    <Text style={styles.headerText} numberOfLines={2}>{shop.name}</Text>
                  </View>
                ))}
                <View style={[styles.tableCell, styles.totalCell, styles.headerCell]}>
                  <Text style={styles.headerText}>ИТОГО</Text>
                </View>
              </View>

              {/* Data rows */}
              <ScrollView style={styles.tableScrollV}>
                {sheet.rows.map((row) => (
                  <View key={row.productId} style={styles.tableRow}>
                    <View style={[styles.tableCell, styles.productCell]}>
                      <Text style={styles.productText} numberOfLines={2}>{row.productName}</Text>
                    </View>
                    {sheet.shops.map((shop) => {
                      const val = row.shopValues[shop.id];
                      return (
                        <View key={shop.id} style={[styles.tableCell, styles.shopCell, val ? styles.filledCell : undefined]}>
                          <Text style={styles.valueText}>{val || ''}</Text>
                        </View>
                      );
                    })}
                    <View style={[styles.tableCell, styles.totalCell, row.total > 0 ? styles.totalFilledCell : undefined]}>
                      <Text style={styles.totalValueText}>{row.total || ''}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        </View>
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
  error: {
    color: '#b53030',
    fontSize: 13,
    fontWeight: '600',
  },
  sheetWrap: {
    flex: 1,
    gap: 8,
  },
  sheetDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f6155',
  },
  tableScrollH: {
    flex: 1,
  },
  tableScrollV: {
    maxHeight: 500,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e1',
  },
  tableCell: {
    paddingHorizontal: 6,
    paddingVertical: 7,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e0e8e1',
  },
  headerCell: {
    backgroundColor: '#dceadf',
  },
  productCell: {
    width: 180,
  },
  shopCell: {
    width: 70,
    alignItems: 'center',
  },
  totalCell: {
    width: 70,
    alignItems: 'center',
  },
  filledCell: {
    backgroundColor: '#fde8e8',
  },
  totalFilledCell: {
    backgroundColor: '#e8f5e9',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#213428',
    textAlign: 'center',
  },
  productText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#233629',
  },
  valueText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b53030',
  },
  totalValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1b5e20',
  },
});
