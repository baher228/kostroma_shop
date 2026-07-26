import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { fobApi } from '../api/fob';
import { Session, WorkerCheckInEvent, WorkerCheckInStatus } from '../types/models';

type ScanResult = {
  status: WorkerCheckInStatus;
  event: WorkerCheckInEvent;
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const scanMessages: Record<string, string> = {
  'Invalid FOB QR code.': 'Это не QR-код Analitika FOB.',
  'FOB QR code expired or was already used.': 'QR-код истек или уже был использован.',
  'Worker is not assigned to this store.': 'Сотрудник назначен в другой магазин.',
  'This tablet is not assigned to a store.': 'Этот планшет не назначен магазину.',
  'Only store tablets can scan FOB QR codes.': 'Сканирование доступно только планшету магазина.',
  'Failed to scan FOB QR code.': 'Не удалось сохранить отметку. Попробуйте снова.',
};

const scanErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return scanMessages[message] ?? (message || 'Не удалось отсканировать QR-код.');
};

export const FobScannerPanel = ({ session }: { session: Session }) => {
  const scanLocked = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (!scanning || scanLocked.current || !result.data) return;
    scanLocked.current = true;
    try {
      setSaving(true);
      setScanning(false);
      setError('');
      setLastResult(await fobApi.scan(session.token, result.data));
    } catch (scanError) {
      setError(scanErrorMessage(scanError));
    } finally {
      scanLocked.current = false;
      setSaving(false);
    }
  };

  const startScanning = () => {
    setScanning(true);
    setError('');
    setLastResult(null);
  };

  if (!session.user.shopId) {
    return (
      <View style={[styles.panel, styles.centeredPanel]}>
        <Text style={styles.title}>FOB сканер</Text>
        <Text style={styles.error} accessibilityLiveRegion="assertive">
          Этот планшет не назначен магазину. Назначьте магазин в панели управления и войдите снова.
        </Text>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.panel, styles.centeredPanel]} accessibilityLiveRegion="polite">
        <ActivityIndicator color="#2f6f4f" />
        <Text style={styles.subtitle}>Проверяем доступ к камере...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>FOB сканер</Text>
        <Text style={styles.permissionText}>
          {permission.canAskAgain
            ? 'Камера нужна, чтобы сканировать QR-коды сотрудников.'
            : 'Доступ к камере отключен. Разрешите его в настройках устройства.'}
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => void (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          accessibilityRole="button"
          accessibilityLabel={permission.canAskAgain ? 'Разрешить доступ к камере' : 'Открыть настройки камеры'}
        >
          <Text style={styles.primaryButtonText}>{permission.canAskAgain ? 'Разрешить камеру' : 'Открыть настройки'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>FOB сканер</Text>
          <Text style={styles.subtitle}>{session.user.shopName ?? session.user.shopId ?? 'Магазин не назначен'}</Text>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={startScanning}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Сканировать следующий FOB QR-код"
          accessibilityState={{ disabled: saving }}
        >
          <Text style={styles.secondaryButtonText}>{lastResult || error ? 'Следующий QR' : 'Сканировать'}</Text>
        </Pressable>
      </View>

      <View style={styles.cameraWrap}>
        {scanning ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(result) => void handleBarcodeScanned(result)}
          />
        ) : (
          <View style={styles.paused}>
            <Text style={styles.pausedText}>{saving ? 'Сохраняем...' : 'Сканирование на паузе'}</Text>
          </View>
        )}
      </View>

      {!!error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
      {lastResult && (
        <View style={styles.resultCard} accessibilityLiveRegion="polite">
          <Text style={styles.resultState}>Отметка сохранена</Text>
          <Text style={styles.resultName}>{lastResult.status.workerDisplayName}</Text>
          <Text style={styles.resultMeta}>
            {lastResult.status.status === 'in' ? 'Пришел' : 'Ушел'} · {formatDateTime(lastResult.event.eventAt)}
          </Text>
          <Text style={styles.resultMeta}>Магазин: {lastResult.event.shopName ?? lastResult.event.shopId ?? '-'}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#f3f7f3',
    padding: 12,
    gap: 12,
  },
  centeredPanel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2f26',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#496055',
    fontWeight: '700',
  },
  permissionText: {
    maxWidth: 520,
    color: '#405548',
    fontSize: 15,
    lineHeight: 21,
  },
  cameraWrap: {
    flex: 1,
    minHeight: 320,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c6d3c8',
    backgroundColor: '#17251c',
  },
  camera: {
    flex: 1,
  },
  paused: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 11,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#223529',
    fontWeight: '800',
  },
  error: {
    color: '#9d3028',
    fontWeight: '700',
    lineHeight: 20,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 3,
  },
  resultState: {
    color: '#1f6342',
    fontSize: 13,
    fontWeight: '800',
  },
  resultName: {
    color: '#1f2f26',
    fontSize: 18,
    fontWeight: '800',
  },
  resultMeta: {
    color: '#405548',
    fontWeight: '700',
  },
});
