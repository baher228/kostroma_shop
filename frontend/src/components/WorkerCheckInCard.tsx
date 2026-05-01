import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { checkInApi } from '../api/checkin';

const toLocalDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const WorkerCheckInCard = ({ token }: { token: string }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'in' | 'out' | null>(null);
  const [changedAt, setChangedAt] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const current = await checkInApi.getMyStatus(token);
      setStatus(current?.status ?? null);
      setChangedAt(current?.lastChangedAt ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить check-in статус.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const buttonLabel = useMemo(() => {
    if (status === 'in') {
      return 'Вышла (check-out)';
    }
    return 'Зашла (check-in)';
  }, [status]);

  const nextStatus: 'in' | 'out' = status === 'in' ? 'out' : 'in';

  const toggle = async () => {
    try {
      setSaving(true);
      setError('');
      const updated = await checkInApi.setMyStatus(token, nextStatus);
      setStatus(updated.status);
      setChangedAt(updated.lastChangedAt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось обновить check-in статус.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#2f6f4f" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Статус смены</Text>
      <Text style={styles.subtitle}>
        {status === 'in' ? 'В работе' : 'Не в смене'} {changedAt ? `· ${toLocalDateTime(changedAt)}` : ''}
      </Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={toggle} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Сохраняю...' : buttonLabel}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1f2f26',
  },
  subtitle: {
    fontSize: 13,
    color: '#496055',
    fontWeight: '600',
  },
  error: {
    color: '#8c3434',
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#2f6f4f',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
});
