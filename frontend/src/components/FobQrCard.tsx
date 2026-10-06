import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { fobApi } from '../api/fob';
import { FobChallenge, WorkerCheckInStatus } from '../types/models';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const FobQrCard = ({ token }: { token: string }) => {
  const [challenge, setChallenge] = useState<FobChallenge | null>(null);
  const [status, setStatus] = useState<WorkerCheckInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const secondsLeft = useMemo(() => {
    if (!challenge) return 0;
    return Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000));
  }, [challenge, now]);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      setError('');
      const [nextStatus, nextChallenge] = await Promise.all([
        fobApi.getMyStatus(token),
        fobApi.createChallenge(token),
      ]);
      setStatus(nextStatus);
      setChallenge(nextChallenge);
      setNow(Date.now());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось создать QR.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!challenge) return;
    const refreshInMs = Math.max(1000, challenge.refreshAfterSeconds * 1000);
    const timer = setTimeout(() => void load(), refreshInMs);
    return () => clearTimeout(timer);
  }, [challenge, load]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>FOB QR</Text>
      <Text style={styles.subtitle}>
        {status?.status === 'in' ? 'На смене' : 'Вне смены'}
        {status?.lastChangedAt ? ` · ${formatTime(status.lastChangedAt)}` : ''}
      </Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.qrBox}>
        {challenge ? (
          <QRCode value={challenge.payload} size={220} backgroundColor="#ffffff" color="#17251c" />
        ) : (
          <Text style={styles.emptyText}>QR недоступен</Text>
        )}
      </View>
      <View style={styles.footerRow}>
        <Text style={styles.timerText}>Обновление через {secondsLeft} сек.</Text>
        <Pressable style={[styles.refreshButton, refreshing && styles.disabled]} onPress={() => void load()} disabled={refreshing}>
          <Text style={styles.refreshButtonText}>{refreshing ? '...' : 'Обновить'}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    backgroundColor: '#ffffff',
    padding: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1f2f26',
  },
  subtitle: {
    fontSize: 15,
    color: '#496055',
    fontWeight: '700',
  },
  qrBox: {
    width: 250,
    height: 250,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d5ded6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  emptyText: {
    color: '#68786d',
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timerText: {
    color: '#344b3d',
    fontWeight: '700',
  },
  refreshButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bccabf',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#2f4437',
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.7,
  },
  error: {
    color: '#af4234',
    fontWeight: '700',
  },
});
