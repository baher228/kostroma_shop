import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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

export const FobScannerPanel = ({ session }: { session: Session }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (!scanning || saving || !result.data) return;
    try {
      setSaving(true);
      setScanning(false);
      setError('');
      setLastResult(await fobApi.scan(session.token, result.data));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Не удалось отсканировать QR.');
    } finally {
      setSaving(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>FOB сканер</Text>
        <Text style={styles.subtitle}>Камера нужна, чтобы сканировать QR работников.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void requestPermission()}>
          <Text style={styles.primaryButtonText}>Разрешить камеру</Text>
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
          onPress={() => {
            setScanning(true);
            setError('');
          }}
        >
          <Text style={styles.secondaryButtonText}>Сканировать</Text>
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

      {!!error && <Text style={styles.error}>{error}</Text>}
      {lastResult && (
        <View style={styles.resultCard}>
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
    color: '#af4234',
    fontWeight: '700',
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 3,
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
