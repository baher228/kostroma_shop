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
import { stockApi } from '../api/stock';
import { Session, SellerOrder, StockTable } from '../types/models';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ошибка сервера.';

const parseStock = (raw?: string): number | null => {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const todayDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const preferredDate = (dates: string[]): string | null => {
  if (!dates.length) {
    return null;
  }
  const today = todayDateKey();
  const notFuture = [...dates].filter((date) => date <= today);
  return notFuture.length ? notFuture[notFuture.length - 1] : dates[dates.length - 1];
};

const toIsoLabel = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const suggestPacks = (row: StockTable['rows'][number], stockOnHand: number | null): number => {
  const unitsInPack = row.unitsInPack && row.unitsInPack > 0 ? row.unitsInPack : null;
  const minStock = row.minStockUnits;
  const maxStock = row.maxStockUnits;

  let suggestedUnits = 0;
  if (stockOnHand === null || stockOnHand === 0) {
    suggestedUnits = maxStock ?? unitsInPack ?? 1;
  } else if (minStock !== null && stockOnHand <= minStock) {
    const target = maxStock ?? minStock;
    suggestedUnits = Math.max(0, target - stockOnHand);
  }

  if (suggestedUnits <= 0) {
    return 0;
  }
  if (!unitsInPack) {
    return suggestedUnits;
  }
  return Math.max(1, Math.ceil(suggestedUnits / unitsInPack));
};

type OrdersPanelProps = {
  session: Session;
};

export const OrdersPanel = ({ session }: OrdersPanelProps) => {
  const canManage = session.user.role === 'manager';
  const [loading, setLoading] = useState(true);
  const [savingByProduct, setSavingByProduct] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [table, setTable] = useState<StockTable | null>(null);
  const [packsByProduct, setPacksByProduct] = useState<Record<string, string>>({});
  const [metaUnitsByProduct, setMetaUnitsByProduct] = useState<Record<string, string>>({});
  const [metaMinByProduct, setMetaMinByProduct] = useState<Record<string, string>>({});
  const [metaMaxByProduct, setMetaMaxByProduct] = useState<Record<string, string>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [nextOrders, nextTable] = await Promise.all([
        ordersApi.list(session.token),
        stockApi.list(session.token, { range: 'week' }),
      ]);
      setOrders(nextOrders);
      setTable(nextTable);
      setMetaUnitsByProduct(
        Object.fromEntries(nextTable.rows.map((row) => [row.productId, row.unitsInPack !== null ? String(row.unitsInPack) : ''])),
      );
      setMetaMinByProduct(
        Object.fromEntries(nextTable.rows.map((row) => [row.productId, row.minStockUnits !== null ? String(row.minStockUnits) : ''])),
      );
      setMetaMaxByProduct(
        Object.fromEntries(nextTable.rows.map((row) => [row.productId, row.maxStockUnits !== null ? String(row.maxStockUnits) : ''])),
      );

      const preferred = preferredDate(nextTable.dates);
      if (!preferred) {
        setPacksByProduct({});
        return;
      }

      const defaults: Record<string, string> = {};
      for (const row of nextTable.rows) {
        const stock = parseStock(row.values[preferred]);
        const suggested = suggestPacks(row, stock);
        defaults[row.productId] = suggested > 0 ? String(suggested) : '';
      }
      setPacksByProduct(defaults);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [session.token]);

  const stockDate = useMemo(() => (table ? preferredDate(table.dates) : null), [table]);

  const saveMeta = async (productId: string) => {
    try {
      setSavingByProduct((current) => ({ ...current, [productId]: true }));
      setError('');
      const unitsRaw = (metaUnitsByProduct[productId] ?? '').trim();
      const minRaw = (metaMinByProduct[productId] ?? '').trim();
      const maxRaw = (metaMaxByProduct[productId] ?? '').trim();

      const toNullableInt = (raw: string): number | null => {
        if (!raw) {
          return null;
        }
        const parsed = Number.parseInt(raw, 10);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const payload = {
        unitsInPack: toNullableInt(unitsRaw),
        minStockUnits: toNullableInt(minRaw),
        maxStockUnits: toNullableInt(maxRaw),
      };

      await stockApi.updateProductMeta(session.token, productId, payload);
      await loadData();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingByProduct((current) => ({ ...current, [productId]: false }));
    }
  };

  const createOrder = async (row: StockTable['rows'][number]) => {
    const assignedShopId = session.user.shopId ?? table?.shop.id ?? null;
    if (!table || !assignedShopId) {
      setError('Для создания заказа сотрудник должен быть привязан к магазину.');
      return;
    }

    const requestedPacks = Number.parseInt((packsByProduct[row.productId] ?? '').trim(), 10);
    if (!Number.isFinite(requestedPacks) || requestedPacks <= 0) {
      setError('Введите корректное количество упаковок.');
      return;
    }
    const unitsInPack = row.unitsInPack && row.unitsInPack > 0 ? row.unitsInPack : 1;
    const requestedUnits = requestedPacks * unitsInPack;
    const stockOnHand = stockDate ? parseStock(row.values[stockDate]) : null;
    const suggested = suggestPacks(row, stockOnHand);
    const autoSuggested = suggested > 0 && suggested === requestedPacks;

    try {
      setSavingByProduct((current) => ({ ...current, [row.productId]: true }));
      setError('');
      const created = await ordersApi.create(session.token, {
        shopId: assignedShopId,
        productId: row.productId,
        stockOnHand,
        requestedPacks,
        requestedUnits,
        autoSuggested,
      });
      setOrders((current) => [created, ...current]);
      setPacksByProduct((current) => ({ ...current, [row.productId]: '' }));
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSavingByProduct((current) => ({ ...current, [row.productId]: false }));
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {!!error && <Text style={styles.error}>{error}</Text>}

      {!canManage && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Заказ для продавцов</Text>
          <Text style={styles.blockMeta}>
            {stockDate ? `Текущий остаток для расчета: ${stockDate}` : 'Нет дат для расчета остатков'}
          </Text>
          <ScrollView style={styles.orderList}>
            {(table?.rows ?? []).map((row) => {
              const currentStock = stockDate ? parseStock(row.values[stockDate]) : null;
              const suggested = suggestPacks(row, currentStock);
              const pending = !!savingByProduct[row.productId];
              return (
                <View key={row.productId} style={styles.orderCard}>
                  <Text style={styles.productName}>{row.name}</Text>

                  <View style={styles.orderSummaryRow}>
                    <View style={[styles.summaryCard, styles.stockSummaryCard]}>
                      <Text style={styles.summaryLabel}>Остаток</Text>
                      <Text style={styles.stockValueText}>{currentStock ?? '-'}</Text>
                      <Text style={styles.summaryHint}>на текущую дату</Text>
                    </View>

                    <View style={[styles.summaryCard, styles.orderSummaryCard]}>
                      <Text style={styles.summaryLabel}>Заказ</Text>
                      <TextInput
                        value={packsByProduct[row.productId] ?? ''}
                        onChangeText={(value) =>
                          setPacksByProduct((current) => ({
                            ...current,
                            [row.productId]: value.replace(/[^0-9]/g, '').slice(0, 4),
                          }))
                        }
                        style={styles.orderValueInput}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#7a8b7f"
                      />
                      <Text style={styles.summaryHint}>коробок</Text>
                    </View>
                  </View>

                  <View style={styles.productMetaBlock}>
                    <Text style={styles.productMetaLine}>Шт/кор: {row.unitsInPack ?? '-'}</Text>
                    <Text style={styles.productMetaLine}>Границы: {row.minStockUnits ?? '-'} / {row.maxStockUnits ?? '-'}</Text>
                    <Text style={styles.productMetaLine}>
                      Авто-рекомендация: {suggested > 0 ? `${suggested} кор.` : 'не требуется'}
                    </Text>
                  </View>

                  <View style={styles.rowInputs}>
                    <Pressable
                      style={[styles.saveButton, pending && styles.saveButtonDisabled]}
                      onPress={() => void createOrder(row)}
                      disabled={pending}
                    >
                      <Text style={styles.saveButtonText}>{pending ? '...' : 'Отправить'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {canManage && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Границы и штук в коробке</Text>
          <ScrollView style={styles.orderList}>
            {(table?.rows ?? []).map((row) => {
              const pending = !!savingByProduct[row.productId];
              return (
                <View key={row.productId} style={styles.orderCard}>
                  <Text style={styles.productName}>{row.name}</Text>
                  <View style={styles.metaGrid}>
                    <TextInput
                      value={metaUnitsByProduct[row.productId] ?? ''}
                      onChangeText={(value) =>
                        setMetaUnitsByProduct((current) => ({ ...current, [row.productId]: value.replace(/[^0-9]/g, '').slice(0, 4) }))
                      }
                      style={styles.input}
                      keyboardType="number-pad"
                      placeholder="Шт/кор"
                      placeholderTextColor="#7a8b7f"
                    />
                    <TextInput
                      value={metaMinByProduct[row.productId] ?? ''}
                      onChangeText={(value) =>
                        setMetaMinByProduct((current) => ({ ...current, [row.productId]: value.replace(/[^0-9]/g, '').slice(0, 4) }))
                      }
                      style={styles.input}
                      keyboardType="number-pad"
                      placeholder="Мин"
                      placeholderTextColor="#7a8b7f"
                    />
                    <TextInput
                      value={metaMaxByProduct[row.productId] ?? ''}
                      onChangeText={(value) =>
                        setMetaMaxByProduct((current) => ({ ...current, [row.productId]: value.replace(/[^0-9]/g, '').slice(0, 4) }))
                      }
                      style={styles.input}
                      keyboardType="number-pad"
                      placeholder="Макс"
                      placeholderTextColor="#7a8b7f"
                    />
                  </View>
                  <Pressable
                    style={[styles.saveButton, pending && styles.saveButtonDisabled]}
                    onPress={() => void saveMeta(row.productId)}
                    disabled={pending}
                  >
                    <Text style={styles.saveButtonText}>{pending ? 'Сохраняю...' : 'Сохранить нормы'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{canManage ? 'Заказы продавцов' : 'Мои отправленные заказы'}</Text>
        <ScrollView style={styles.historyList}>
          {!orders.length && <Text style={styles.empty}>Пока нет заказов.</Text>}
          {orders.map((order) => (
            <View key={order.id} style={styles.historyCard}>
              <Text style={styles.historyMain}>
                {order.productName} · {order.requestedPacks} кор. ({order.requestedUnits} шт.)
              </Text>
              <Text style={styles.historyMeta}>
                {order.shopName ?? order.shopId} · {toIsoLabel(order.createdAt)}
              </Text>
              <Text style={styles.historyMeta}>
                Остаток: {order.stockOnHand ?? '-'} · {order.autoSuggested ? 'Авто' : 'Ручной'} · {order.status}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
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
  block: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    padding: 12,
    gap: 8,
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#213428',
  },
  blockMeta: {
    fontSize: 12,
    color: '#4f6155',
    fontWeight: '600',
  },
  orderList: {
    maxHeight: 280,
  },
  historyList: {
    maxHeight: 220,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: '#d1dbd2',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#233629',
  },
  productMeta: {
    fontSize: 12,
    color: '#4f6155',
    fontWeight: '600',
  },
  orderSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 108,
    justifyContent: 'center',
    borderWidth: 1,
  },
  stockSummaryCard: {
    backgroundColor: '#edf6ef',
    borderColor: '#bcd2c0',
  },
  orderSummaryCard: {
    backgroundColor: '#f8fbf9',
    borderColor: '#cfd9d1',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#355443',
    marginBottom: 6,
  },
  stockValueText: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#1d3326',
  },
  orderValueInput: {
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    color: '#1d3326',
    textAlign: 'left',
    minHeight: 40,
  },
  summaryHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#5d7365',
    fontWeight: '700',
  },
  productMetaBlock: {
    borderRadius: 10,
    backgroundColor: '#f7faf8',
    borderWidth: 1,
    borderColor: '#d9e2db',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  productMetaLine: {
    fontSize: 12,
    color: '#4f6155',
    fontWeight: '700',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
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
  saveButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  historyCard: {
    borderWidth: 1,
    borderColor: '#d1dbd2',
    borderRadius: 11,
    padding: 10,
    marginBottom: 8,
    gap: 4,
    backgroundColor: '#f8fbf9',
  },
  historyMain: {
    color: '#223428',
    fontSize: 13,
    fontWeight: '800',
  },
  historyMeta: {
    color: '#4a5c51',
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    color: '#5a6d61',
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: '#8c3434',
    fontSize: 12,
    fontWeight: '700',
  },
});
