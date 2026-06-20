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

const nextOrderDate = (from = new Date()): string => {
  const allowedDays = new Set([2, 4, 6]);
  const target = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  target.setDate(target.getDate() + 1);
  while (!allowedDays.has(target.getDay())) {
    target.setDate(target.getDate() + 1);
  }
  return toDateKey(target);
};

const formatDateShort = (iso: string): string => {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
};

const formatTargetWeekday = (iso: string): string =>
  parseDateKey(iso).toLocaleDateString('ru-RU', { weekday: 'long' });

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
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submittedByProduct, setSubmittedByProduct] = useState<Record<string, boolean>>({});
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
  const orderDate = nextOrderDate();
  const orderTargetLabel = `Заказ упаковок на ${formatTargetWeekday(orderDate)} ${formatDateShort(orderDate)}`;

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

  const submitWorkerOrder = async () => {
    const assignedShopId = session.user.shopId ?? table?.shop.id ?? null;
    if (!table || !assignedShopId) {
      setError('Для создания заказа сотрудник должен быть привязан к магазину.');
      return;
    }

    const rowsToSubmit = table.rows
      .map((row) => {
        const requestedPacks = Number.parseInt((packsByProduct[row.productId] ?? '').trim(), 10);
        return Number.isFinite(requestedPacks) && requestedPacks > 0 ? { row, requestedPacks } : null;
      })
      .filter((item): item is { row: StockTable['rows'][number]; requestedPacks: number } => item !== null);

    if (rowsToSubmit.length === 0) {
      setError('Введите хотя бы одну позицию заказа.');
      return;
    }

    try {
      setSubmittingOrder(true);
      setSavingByProduct(Object.fromEntries(rowsToSubmit.map(({ row }) => [row.productId, true])));
      setError('');
      const items = rowsToSubmit.map(({ row, requestedPacks }) => {
        const unitsInPack = row.unitsInPack && row.unitsInPack > 0 ? row.unitsInPack : 1;
        const requestedUnits = requestedPacks * unitsInPack;
        const stockOnHand = stockDate ? parseStock(row.values[stockDate]) : null;
        const suggested = suggestPacks(row, stockOnHand);
        const autoSuggested = suggested > 0 && suggested === requestedPacks;
        return {
          productId: row.productId,
          stockOnHand,
          requestedPacks,
          requestedUnits,
          autoSuggested,
        };
      });
      const createdOrders = await ordersApi.createBulk(session.token, {
        shopId: assignedShopId,
        orderDate,
        items,
      });
      setOrders((current) => [...createdOrders.reverse(), ...current]);
      setSubmittedByProduct(Object.fromEntries(rowsToSubmit.map(({ row }) => [row.productId, true])));
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSubmittingOrder(false);
      setSavingByProduct({});
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
        <View style={[styles.block, styles.workerOrderBlock]}>
          <Text style={styles.orderTitle}>{orderTargetLabel}</Text>
          <Text style={styles.blockMeta}>
            {stockDate ? `Текущий остаток для расчета: ${stockDate}` : 'Нет дат для расчета остатков'}
          </Text>
          <ScrollView style={[styles.orderList, styles.orderListExpanded]}>
            {(table?.rows ?? []).map((row) => {
              const currentStock = stockDate ? parseStock(row.values[stockDate]) : null;
              const suggested = suggestPacks(row, currentStock);
              const pending = !!savingByProduct[row.productId];
              return (
                <View key={row.productId} style={styles.orderCard}>
                  <Text style={styles.productName}>{row.name}</Text>
                  <View style={styles.orderTopRow}>
                    <View style={styles.stockBlock}>
                      <Text style={styles.stockLabel}>Остаток</Text>
                      <Text style={styles.stockValueText}>{currentStock ?? '-'}</Text>
                    </View>

                    <View style={styles.orderBlock}>
                      <Text style={styles.orderLabel}>Заказ</Text>
                      <TextInput
                        value={packsByProduct[row.productId] ?? ''}
                        onChangeText={(value) => {
                          setSubmittedByProduct((current) => ({ ...current, [row.productId]: false }));
                          setPacksByProduct((current) => ({
                            ...current,
                            [row.productId]: value.replace(/[^0-9]/g, '').slice(0, 4),
                          }));
                        }}
                        style={styles.orderValueInput}
                        keyboardType="number-pad"
                        placeholder="Коробки"
                        placeholderTextColor="#7a8b7f"
                      />
                    </View>
                    <View style={styles.recommendationBlock}>
                      <Text style={styles.orderLabel}>Авто-рекомендация</Text>
                      <Text style={styles.recommendationValueText}>{suggested > 0 ? `${suggested} кор.` : '-'}</Text>
                    </View>
                  </View>
                  <Text style={styles.productMetaStrong}>Шт/кор: {row.unitsInPack ?? '-'}</Text>
                  <Text style={styles.productMetaStrong}>Границы: {row.minStockUnits ?? '-'} / {row.maxStockUnits ?? '-'}</Text>
                  {(pending || submittedByProduct[row.productId]) && (
                    <Text style={styles.submissionState}>{pending ? 'Отправляется...' : 'Отправлено'}</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.submitBar}>
            <Pressable
              style={[styles.submitAllButton, submittingOrder && styles.saveButtonDisabled]}
              onPress={() => void submitWorkerOrder()}
              disabled={submittingOrder}
            >
              <Text style={styles.submitAllButtonText}>{submittingOrder ? 'Отправляем...' : 'Отправить заказ'}</Text>
            </Pressable>
          </View>
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

      {canManage && (
        <View style={[styles.block, styles.historyBlock]}>
          <Text style={styles.blockTitle}>Заказы продавцов</Text>
          <ScrollView style={styles.historyList}>
            {!orders.length && <Text style={styles.empty}>Пока нет заказов.</Text>}
            {orders.map((order) => (
              <View key={order.id} style={styles.historyCard}>
                <Text style={styles.historyMain}>
                  {order.productName} · {order.requestedPacks} кор. ({order.requestedUnits} шт.)
                </Text>
                <Text style={styles.historyMeta}>
                  {order.shopName ?? order.shopId} · {order.orderDate ? `на ${order.orderDate} · ` : ''}{toIsoLabel(order.createdAt)}
                </Text>
                <Text style={styles.historyMeta}>
                  Остаток: {order.stockOnHand ?? '-'} · {order.autoSuggested ? 'Авто' : 'Ручной'} · {order.status}
                </Text>
              </View>
            ))}
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
  block: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    padding: 12,
    gap: 8,
  },
  workerOrderBlock: {
    flex: 1,
    padding: 18,
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#213428',
  },
  orderTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: '#213428',
    textTransform: 'capitalize',
  },
  blockMeta: {
    fontSize: 16,
    color: '#4f6155',
    fontWeight: '700',
  },
  orderList: {
    maxHeight: 280,
  },
  orderListExpanded: {
    flex: 1,
    maxHeight: undefined,
  },
  historyList: {
    flex: 1,
    maxHeight: undefined,
  },
  historyBlock: {
    flex: 1,
    minHeight: 0,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: '#d1dbd2',
    borderRadius: 14,
    padding: 22,
    marginBottom: 16,
    gap: 16,
  },
  productName: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: '#233629',
  },
  productMeta: {
    fontSize: 12,
    color: '#4f6155',
    fontWeight: '600',
  },
  orderTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'stretch',
  },
  stockBlock: {
    minWidth: 150,
    paddingVertical: 6,
  },
  orderBlock: {
    flex: 1,
    minWidth: 240,
    justifyContent: 'center',
  },
  recommendationBlock: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 190,
    justifyContent: 'center',
  },
  stockLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#355443',
    marginBottom: 6,
  },
  orderLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#355443',
    marginBottom: 6,
  },
  stockValueText: {
    fontSize: 50,
    lineHeight: 56,
    fontWeight: '900',
    color: '#1d3326',
  },
  orderValueInput: {
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 12,
    backgroundColor: '#f8fbf9',
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
    color: '#1d3326',
    textAlign: 'left',
    minHeight: 86,
  },
  recommendationValueText: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
    color: '#1d3326',
  },
  productMetaStrong: {
    fontSize: 24,
    color: '#4f6155',
    fontWeight: '900',
  },
  submissionState: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2f6f4f',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
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
    borderRadius: 12,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  submitBar: {
    borderTopWidth: 1,
    borderTopColor: '#d1dbd2',
    paddingTop: 14,
  },
  submitAllButton: {
    borderRadius: 14,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 22,
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitAllButtonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
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
