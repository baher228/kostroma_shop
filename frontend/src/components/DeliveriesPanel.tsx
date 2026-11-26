import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { deliveriesApi } from '../api/deliveries';
import { DeliveryReceipt, DeliverySupplier, Session, Shop } from '../types/models';
import {
  deliveryStatus,
  formatClockMinutes,
  isDeliveryDay,
  moscowDateKey,
  moscowMinutes,
  type DeliveryStatus,
} from '../../../shared/delivery-status';

type CardState = 'accepted' | 'late' | 'no_photo' | 'missed' | 'now' | 'later';

type Card = { supplier: DeliverySupplier; state: CardState; receipt?: DeliveryReceipt };

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const headerDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]}`;
};

const clockOf = (iso: string) => formatClockMinutes(moscowMinutes(new Date(iso)));

const windowText = (supplier: DeliverySupplier) =>
  `Окно ${formatClockMinutes(supplier.windowStartMinutes)}–${formatClockMinutes(supplier.windowEndMinutes)}`;

const cardState = (status: DeliveryStatus, supplier: DeliverySupplier, nowMinutes: number): CardState => {
  if (status === 'on_time') return 'accepted';
  if (status === 'expected') return nowMinutes >= supplier.windowStartMinutes ? 'now' : 'later';
  return status;
};

const STATE_LABEL: Record<CardState, string> = {
  accepted: 'Принято',
  late: 'Опоздал',
  no_photo: 'Нет фото',
  missed: 'Не отмечено',
  now: 'Ожидается сейчас',
  later: 'Позже',
};

const STATE_COLORS: Record<CardState, { pill: string; pillText: string; border: string; button: string }> = {
  accepted: { pill: '#e3f3e6', pillText: '#1e6b34', border: '#e4e2dc', button: '#1e6b34' },
  late: { pill: '#fff0d6', pillText: '#8a4b00', border: '#f2c27a', button: '#b86200' },
  no_photo: { pill: '#fde4e1', pillText: '#b42318', border: '#f1a9a0', button: '#b42318' },
  missed: { pill: '#fde4e1', pillText: '#b42318', border: '#f1a9a0', button: '#b42318' },
  now: { pill: '#e2e9fb', pillText: '#2440a8', border: '#b7c6f0', button: '#2f56d6' },
  later: { pill: '#ecedf0', pillText: '#4a4f59', border: '#e4e2dc', button: '#5c626d' },
};

type DeliveriesPanelProps = {
  session: Session;
  shops: Shop[];
  fontScale: number;
};

export const DeliveriesPanel = ({ session, shops, fontScale }: DeliveriesPanelProps) => {
  const fs = (size: number) => Math.round(size * fontScale);
  const canManage = session.user.role === 'manager';
  const [shopId, setShopId] = useState<string | null>(session.user.shopId ?? null);
  const [today, setToday] = useState(() => moscowDateKey());
  const [now, setNow] = useState(() => new Date());
  const [suppliers, setSuppliers] = useState<DeliverySupplier[]>([]);
  const [receipts, setReceipts] = useState<DeliveryReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cameraTarget, setCameraTarget] = useState<DeliverySupplier | null>(null);
  const [sending, setSending] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (!shopId && shops.length > 0) setShopId(shops[0].id);
  }, [shopId, shops]);

  const load = useCallback(async () => {
    const dateKey = moscowDateKey();
    try {
      const board = await deliveriesApi.board(session.token, dateKey);
      setToday(dateKey);
      setNow(new Date());
      setSuppliers(board.suppliers);
      setReceipts(board.receipts);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить приёмку.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.token]);

  useEffect(() => {
    void load();
    const reload = setInterval(() => void load(), 2 * 60_000);
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      clearInterval(reload);
      clearInterval(tick);
    };
  }, [load]);

  const cards = useMemo<Card[]>(() => {
    const nowMinutes = moscowMinutes(now);
    const receiptBySupplier = new Map(receipts.filter((item) => item.date === today).map((item) => [item.supplierId, item]));
    return suppliers
      .filter((supplier) => supplier.shopId === shopId && isDeliveryDay(supplier, today))
      .sort((a, b) => a.windowStartMinutes - b.windowStartMinutes || a.name.localeCompare(b.name, 'ru'))
      .map((supplier) => {
        const receipt = receiptBySupplier.get(supplier.id);
        return { supplier, receipt, state: cardState(deliveryStatus(supplier, today, receipt, now), supplier, nowMinutes) };
      });
  }, [suppliers, receipts, shopId, today, now]);

  const acceptedCount = cards.filter((card) => card.receipt).length;
  const missed = cards.filter((card) => card.state === 'missed');
  const shopName = shops.find((shop) => shop.id === shopId)?.name ?? session.user.shopName ?? '';
  const hasSuppliers = suppliers.some((supplier) => supplier.shopId === shopId);

  const openCamera = async (supplier: DeliverySupplier) => {
    if (cameraPermission?.granted) {
      setCameraTarget(supplier);
      return;
    }
    if (cameraPermission && !cameraPermission.canAskAgain) {
      Alert.alert('Нет доступа к камере', 'Разрешите камеру в настройках устройства, чтобы сфотографировать накладную.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Настройки', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const permission = await requestCameraPermission();
    if (permission.granted) setCameraTarget(supplier);
    else setError('Камера нужна, чтобы сфотографировать накладную.');
  };

  const send = async (supplier: DeliverySupplier, withPhoto: boolean) => {
    setSending(true);
    try {
      let photoUri: string | undefined;
      if (withPhoto) {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
        if (!photo?.uri) {
          setError('Не удалось получить фото. Попробуйте ещё раз.');
          return;
        }
        photoUri = photo.uri;
      }
      const receipt = await deliveriesApi.markReceived(session.token, {
        supplierId: supplier.id,
        date: today,
        receivedAt: new Date().toISOString(),
        photoUri,
      });
      setReceipts((current) => [...current.filter((item) => !(item.supplierId === receipt.supplierId && item.date === receipt.date)), receipt]);
      setCameraTarget(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отметить приёмку.');
    } finally {
      setSending(false);
    }
  };

  const renderCard = ({ supplier, receipt, state }: Card) => {
    const colors = STATE_COLORS[state];
    const needsMark = !receipt;
    const needsPhoto = receipt && !receipt.hasInvoicePhoto;
    return (
      <View key={supplier.id} style={[styles.card, { borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleWrap}>
            <Text style={[styles.cardTitle, { fontSize: fs(21) }]}>{supplier.name}</Text>
            <Text style={[styles.cardWindow, { fontSize: fs(17) }]}>{windowText(supplier)}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.pill }]}>
            <Text style={[styles.pillText, { color: colors.pillText, fontSize: fs(15) }]}>{STATE_LABEL[state]}</Text>
          </View>
        </View>
        {receipt && (
          <Text style={[styles.receiptLine, { color: receipt.hasInvoicePhoto ? colors.pillText : STATE_COLORS.no_photo.pillText, fontSize: fs(16) }]}>
            ✓ Принято в {clockOf(receipt.receivedAt)}
            {state === 'late' ? ' · опоздание' : ''}
            {receipt.hasInvoicePhoto ? ' · накладная прикреплена' : ' · без фото накладной'}
          </Text>
        )}
        {(needsMark || needsPhoto) && (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.markButton, { backgroundColor: colors.button }, pressed && styles.pressed]}
            onPress={() => void openCamera(supplier)}
            disabled={sending}
          >
            <Text style={[styles.markButtonText, { fontSize: fs(19) }]}>
              {needsMark ? 'Приехал — сфотографировать накладную' : 'Сфотографировать накладную'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View>
          <Text style={[styles.dateLine, { fontSize: fs(16) }]}>
            {headerDate(today)} · сейчас {formatClockMinutes(moscowMinutes(now))}
          </Text>
          {!!shopName && <Text style={[styles.shopName, { fontSize: fs(24) }]}>{shopName}</Text>}
        </View>

        {canManage && shops.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shopChips}>
            {shops.map((shop) => {
              const active = shop.id === shopId;
              return (
                <Pressable key={shop.id} style={[styles.shopChip, active && styles.shopChipActive]} onPress={() => setShopId(shop.id)}>
                  <Text style={[styles.shopChipText, { fontSize: fs(17) }, active && styles.shopChipTextActive]}>{shop.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!!error && <Text style={[styles.error, { fontSize: fs(16) }]}>{error}</Text>}

        {loading ? (
          <ActivityIndicator size="large" color="#2f5d3a" style={styles.loader} />
        ) : cards.length === 0 ? (
          <View style={styles.card}>
            <Text style={[styles.empty, { fontSize: fs(18) }]}>
              {hasSuppliers ? 'Сегодня поставок нет.' : 'Поставщики не добавлены. Их добавляет управляющий в веб-версии.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.progressHead}>
                <Text style={[styles.progressTitle, { fontSize: fs(19) }]}>Поставки сегодня</Text>
                <Text style={[styles.progressCount, { fontSize: fs(17) }]}>
                  {acceptedCount} из {cards.length} принято
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((acceptedCount / cards.length) * 100)}%` }]} />
              </View>
            </View>

            {missed.map(({ supplier }) => (
              <View key={`alert-${supplier.id}`} style={styles.alert}>
                <Text style={[styles.alertIcon, { fontSize: fs(22) }]}>⚠</Text>
                <View style={styles.alertText}>
                  <Text style={[styles.alertTitle, { fontSize: fs(18) }]}>{supplier.name} не отмечен</Text>
                  <Text style={[styles.alertBody, { fontSize: fs(16) }]}>
                    Окно закончилось в {formatClockMinutes(supplier.windowEndMinutes)}. Отметьте приезд.
                  </Text>
                </View>
              </View>
            ))}

            {cards.map(renderCard)}
          </>
        )}
      </ScrollView>

      <Modal visible={!!cameraTarget} animationType="slide" onRequestClose={() => !sending && setCameraTarget(null)}>
        {cameraTarget && (
          <View style={styles.cameraScreen}>
            <Text style={[styles.cameraTitle, { fontSize: fs(20) }]}>Накладная · {cameraTarget.name}</Text>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            {!!error && <Text style={[styles.cameraError, { fontSize: fs(16) }]}>{error}</Text>}
            <View style={styles.cameraActions}>
              <Pressable style={[styles.cameraButton, styles.cameraShoot]} disabled={sending} onPress={() => void send(cameraTarget, true)}>
                <Text style={[styles.cameraButtonText, { fontSize: fs(19) }]}>{sending ? 'Отправляем...' : 'Снять и отправить'}</Text>
              </Pressable>
              {!receipts.some((item) => item.supplierId === cameraTarget.id && item.date === today) && (
                <Pressable style={[styles.cameraButton, styles.cameraSecondary]} disabled={sending} onPress={() => void send(cameraTarget, false)}>
                  <Text style={[styles.cameraSecondaryText, { fontSize: fs(17) }]}>Отметить без фото</Text>
                </Pressable>
              )}
              <Pressable style={[styles.cameraButton, styles.cameraSecondary]} disabled={sending} onPress={() => setCameraTarget(null)}>
                <Text style={[styles.cameraSecondaryText, { fontSize: fs(17) }]}>Отмена</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { gap: 14, paddingBottom: 24 },
  dateLine: { color: '#6b6a66', fontWeight: '500' },
  shopName: { color: '#1d1d1b', fontWeight: '800', marginTop: 2 },
  shopChips: { gap: 8 },
  shopChip: { borderWidth: 1, borderColor: '#d9d6cf', backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  shopChipActive: { backgroundColor: '#2f5d3a', borderColor: '#2f5d3a' },
  shopChipText: { color: '#1d1d1b', fontWeight: '700' },
  shopChipTextActive: { color: '#ffffff' },
  error: { color: '#b42318', fontWeight: '600' },
  loader: { marginTop: 32 },
  empty: { color: '#6b6a66', fontWeight: '600' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e2dc', borderRadius: 16, padding: 18, gap: 12 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  progressTitle: { color: '#1d1d1b', fontWeight: '800' },
  progressCount: { color: '#6b6a66', fontWeight: '600' },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: '#eeedf0', overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: '#2f56d6' },
  alert: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fbe4e1',
    borderWidth: 1,
    borderColor: '#f1a9a0',
    borderRadius: 16,
    padding: 16,
  },
  alertIcon: { color: '#b42318' },
  alertText: { flex: 1, gap: 2 },
  alertTitle: { color: '#8f1d12', fontWeight: '800' },
  alertBody: { color: '#8f1d12' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { color: '#1d1d1b', fontWeight: '800' },
  cardWindow: { color: '#6b6a66', fontWeight: '500' },
  pill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  pillText: { fontWeight: '800' },
  receiptLine: { fontWeight: '600' },
  markButton: { borderRadius: 12, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center' },
  markButtonText: { color: '#ffffff', fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.8 },
  cameraScreen: { flex: 1, backgroundColor: '#111111', padding: 16, gap: 12 },
  cameraTitle: { color: '#ffffff', fontWeight: '800' },
  camera: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  cameraError: { color: '#ffb4a8', fontWeight: '600' },
  cameraActions: { gap: 10 },
  cameraButton: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  cameraShoot: { backgroundColor: '#2f56d6' },
  cameraButtonText: { color: '#ffffff', fontWeight: '800' },
  cameraSecondary: { backgroundColor: '#2a2a2a' },
  cameraSecondaryText: { color: '#ffffff', fontWeight: '700' },
});
