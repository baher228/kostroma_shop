import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { stockApi } from '../api/stock';
import { TasksPanel } from '../components/TasksPanel';
import { UsersPanel } from '../components/UsersPanel';
import { COLUMNS, STOCK_KEYS } from '../constants/table';
import { ColumnType, Session, StockRow } from '../types/models';

type SortMode = 'manual' | 'name' | 'critical';
type ScreenTab = 'stock' | 'tasks' | 'users';

type StockScreenProps = {
  session: Session;
  onLogout: () => Promise<void>;
};

const sanitizeNumber = (raw: string) => raw.replace(/[^0-9]/g, '').slice(0, 5);
const normalizeText = (value: string) => value.trim().toLowerCase();

const parseNumber = (value: string) => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const minStock = (row: StockRow) => Math.min(...STOCK_KEYS.map((key) => parseNumber(row.values[key])));
const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Ошибка сервера.');

export const StockScreen = ({ session, onLogout }: StockScreenProps) => {
  const [activeTab, setActiveTab] = useState<ScreenTab>('stock');
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [error, setError] = useState('');
  const [pendingRows, setPendingRows] = useState<Record<string, boolean>>({});

  const canManage = session.user.role === 'manager';

  useEffect(() => {
    if (!canManage && activeTab === 'users') {
      setActiveTab('stock');
    }
  }, [activeTab, canManage]);

  const loadRows = async () => {
    try {
      setLoading(true);
      setError('');
      const nextRows = await stockApi.list(session.token);
      setRows(nextRows);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const setRowPending = (rowId: string, value: boolean) => {
    setPendingRows((current) => ({ ...current, [rowId]: value }));
  };

  const updateValueLocal = (rowId: string, key: keyof StockRow['values'], value: string) => {
    const sanitized = sanitizeNumber(value);
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              values: {
                ...row.values,
                [key]: sanitized,
              },
            }
          : row,
      ),
    );
  };

  const saveValue = async (rowId: string, key: keyof StockRow['values'], value: string) => {
    try {
      setRowPending(rowId, true);
      const updated = await stockApi.update(session.token, rowId, {
        values: {
          [key]: sanitizeNumber(value),
        },
      });
      setRows((current) => current.map((row) => (row.id === rowId ? updated : row)));
      setError('');
    } catch (saveError) {
      setError(errorMessage(saveError));
      await loadRows();
    } finally {
      setRowPending(rowId, false);
    }
  };

  const addRow = async () => {
    if (!canManage) {
      return;
    }
    try {
      const created = await stockApi.create(session.token, 'Новый товар');
      setRows((current) => [...current, created]);
      setError('');
    } catch (createError) {
      setError(errorMessage(createError));
    }
  };

  const removeRow = (rowId: string) => {
    if (!canManage) {
      return;
    }
    Alert.alert('Удалить товар?', 'Строка будет удалена без возможности восстановления.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await stockApi.remove(session.token, rowId);
            setRows((current) => current.filter((row) => row.id !== rowId));
            setError('');
          } catch (removeError) {
            setError(errorMessage(removeError));
          }
        },
      },
    ]);
  };

  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    let nextRows = rows;
    if (normalizedQuery) {
      nextRows = nextRows.filter((row) => normalizeText(row.name).includes(normalizedQuery));
    }
    if (sortMode === 'name') {
      return [...nextRows].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    if (sortMode === 'critical') {
      return [...nextRows].sort((a, b) => minStock(a) - minStock(b));
    }
    return nextRows;
  }, [rows, query, sortMode]);

  const columnStyleByType = (type: ColumnType) => {
    if (type === 'stock') {
      return styles.stockCell;
    }
    if (type === 'order') {
      return styles.orderCell;
    }
    return styles.baseCell;
  };

  const renderStockTab = () => (
    <>
      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Поиск товара"
          placeholderTextColor="#6d7d72"
        />
        <View style={styles.controlButtons}>
          {canManage && (
            <Pressable style={styles.primaryButton} onPress={addRow}>
              <Text style={styles.primaryButtonText}>Добавить товар</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryButton} onPress={loadRows}>
            <Text style={styles.secondaryButtonText}>Обновить</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.metaText}>Позиций: {visibleRows.length}</Text>
        <View style={styles.sortButtons}>
          <Pressable style={[styles.sortButton, sortMode === 'manual' && styles.sortButtonActive]} onPress={() => setSortMode('manual')}>
            <Text style={[styles.sortButtonText, sortMode === 'manual' && styles.sortButtonTextActive]}>Без сорт.</Text>
          </Pressable>
          <Pressable style={[styles.sortButton, sortMode === 'name' && styles.sortButtonActive]} onPress={() => setSortMode('name')}>
            <Text style={[styles.sortButtonText, sortMode === 'name' && styles.sortButtonTextActive]}>А-Я</Text>
          </Pressable>
          <Pressable
            style={[styles.sortButton, sortMode === 'critical' && styles.sortButtonActive]}
            onPress={() => setSortMode('critical')}
          >
            <Text style={[styles.sortButtonText, sortMode === 'critical' && styles.sortButtonTextActive]}>Критичный</Text>
          </Pressable>
        </View>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.tableWrap}>
        <ScrollView showsVerticalScrollIndicator>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.categoryRow}>
                <Text style={styles.categoryText}>Йогурты</Text>
              </View>

              <View style={styles.headerRow}>
                <View style={[styles.headerCell, styles.nameHeaderCell]}>
                  <Text style={styles.headerText}>Товар</Text>
                </View>
                {COLUMNS.map((column) => (
                  <View key={column.key} style={[styles.headerCell, styles.numericCell, columnStyleByType(column.type)]}>
                    <Text style={styles.headerText}>{column.label}</Text>
                  </View>
                ))}
                <View style={[styles.headerCell, styles.actionCell]}>
                  <Text style={styles.headerText}>Действие</Text>
                </View>
              </View>

              {visibleRows.map((row) => {
                const rowPending = pendingRows[row.id];
                return (
                  <View key={row.id} style={[styles.row, rowPending && styles.rowPending]}>
                    <View style={[styles.nameCell, styles.nameHeaderCell]}>
                      <Text style={styles.nameText} numberOfLines={1} ellipsizeMode="tail">
                        {row.name}
                      </Text>
                    </View>
                    {COLUMNS.map((column) => (
                      <View key={column.key} style={[styles.cell, styles.numericCell, columnStyleByType(column.type)]}>
                        <TextInput
                          value={row.values[column.key]}
                          onChangeText={(value) => updateValueLocal(row.id, column.key, value)}
                          onEndEditing={(event) => saveValue(row.id, column.key, event.nativeEvent.text)}
                          style={styles.numberInput}
                          keyboardType="number-pad"
                          placeholder="-"
                          placeholderTextColor="#7f7f7f"
                          maxLength={5}
                        />
                      </View>
                    ))}
                    <View style={[styles.cell, styles.actionCell]}>
                      {canManage ? (
                        <Pressable style={styles.deleteButton} onPress={() => removeRow(row.id)}>
                          <Text style={styles.deleteButtonText}>Удалить</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.workerText}>Нет</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </>
  );

  const renderContent = () => {
    if (activeTab === 'tasks') {
      return (
        <View style={styles.tabContentWrap}>
          <TasksPanel session={session} fullHeight />
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
        { key: 'tasks', label: 'Задачи' },
        { key: 'users', label: 'Пользователи' },
      ]
    : [
        { key: 'stock', label: 'Остатки' },
        { key: 'tasks', label: 'Задачи' },
      ];

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Учёт остатков</Text>
          <Text style={styles.subtitle}>
            {session.user.displayName} · {canManage ? 'Менеджер' : 'Сотрудник'}
          </Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Выйти</Text>
        </Pressable>
      </View>

      <View style={styles.contentWrap}>{renderContent()}</View>

      <View style={styles.bottomTabs}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable key={tab.key} style={[styles.bottomTabButton, active && styles.bottomTabButtonActive]} onPress={() => setActiveTab(tab.key)}>
              <Text style={[styles.bottomTabButtonText, active && styles.bottomTabButtonTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  contentWrap: {
    flex: 1,
  },
  tabContentWrap: {
    flex: 1,
    paddingBottom: 8,
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
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#2f6f4f',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#d5ddd5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#213125',
    fontSize: 14,
    fontWeight: '700',
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
    fontSize: 14,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    borderWidth: 1,
    borderColor: '#bccabf',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f3f6f4',
  },
  sortButtonActive: {
    backgroundColor: '#1f4f37',
    borderColor: '#1f4f37',
  },
  sortButtonText: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 13,
  },
  sortButtonTextActive: {
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#dce4dc',
    overflow: 'hidden',
    marginBottom: 8,
  },
  categoryRow: {
    backgroundColor: '#d9d3a4',
    borderBottomWidth: 1,
    borderBottomColor: '#95a596',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  categoryText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2c311f',
  },
  headerRow: {
    flexDirection: 'row',
  },
  headerCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    minHeight: 72,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  headerText: {
    fontSize: 13,
    color: '#2e312f',
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
  },
  rowPending: {
    opacity: 0.7,
  },
  nameHeaderCell: {
    width: 350,
    backgroundColor: '#f0f0f0',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
  },
  nameCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    justifyContent: 'center',
    minHeight: 56,
  },
  nameText: {
    width: '100%',
    fontSize: 23,
    color: '#222222',
    fontWeight: '500',
    textAlign: 'left',
    paddingHorizontal: 0,
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    minHeight: 56,
  },
  numericCell: {
    width: 110,
  },
  numberInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 20,
    color: '#232323',
    fontWeight: '700',
    paddingVertical: 8,
  },
  actionCell: {
    width: 110,
    backgroundColor: '#ecf0ec',
  },
  deleteButton: {
    backgroundColor: '#9f4038',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  workerText: {
    color: '#55685b',
    fontSize: 12,
    fontWeight: '700',
  },
  baseCell: {
    backgroundColor: '#f4f5f3',
  },
  stockCell: {
    backgroundColor: '#e8ecb7',
  },
  orderCell: {
    backgroundColor: '#ecd8c4',
  },
  bottomTabs: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#c8d4cb',
    borderRadius: 14,
    backgroundColor: '#f3f7f3',
    padding: 6,
  },
  bottomTabButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  bottomTabButtonActive: {
    backgroundColor: '#1f4f37',
  },
  bottomTabButtonText: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  bottomTabButtonTextActive: {
    color: '#ffffff',
  },
});
