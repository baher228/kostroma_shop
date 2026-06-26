import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type Role = 'manager' | 'worker' | 'store_tablet';
type SessionUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  shopId: string | null;
  shopName: string | null;
};
type Session = { token: string; user: SessionUser };
type FobChallenge = { payload: string; expiresAt: string; refreshAfterSeconds: number };
type WorkerStatus = { status: 'in' | 'out'; lastChangedAt: string } | null;

const API_BASE_URL = (process.env.EXPO_PUBLIC_RU_API_URL || 'http://10.0.2.2:4000').replace(/\/+$/, '');
const STORAGE_KEY = 'worker_fob_session_v1';

const request = async <T,>(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const parsed = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(parsed?.message || 'Request failed.');
  }
  return (parsed ?? {}) as T;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<FobChallenge | null>(null);
  const [status, setStatus] = useState<WorkerStatus>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) setSession(JSON.parse(saved) as Session);
      })
      .catch(() => AsyncStorage.removeItem(STORAGE_KEY))
      .finally(() => setBooting(false));
  }, []);

  const login = async () => {
    try {
      setLoading(true);
      setError('');
      const next = await request<Session>('/api/auth/login', {
        method: 'POST',
        body: { username: username.trim().toLowerCase(), password },
      });
      if (next.user.role !== 'worker') {
        throw new Error('Only worker accounts can use the FOB phone app.');
      }
      setSession(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setLoading(true);
      setError('');
      const [statusResponse, challengeResponse] = await Promise.all([
        request<{ status: WorkerStatus }>('/api/fob/me', { token: session.token }),
        request<{ challenge: FobChallenge }>('/api/fob/challenges', { method: 'POST', token: session.token }),
      ]);
      setStatus(statusResponse.status);
      setChallenge(challengeResponse.challenge);
      setNow(Date.now());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh QR.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!challenge) return;
    const timer = setTimeout(() => void refresh(), challenge.refreshAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [challenge, refresh]);

  const secondsLeft = useMemo(
    () => (challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000)) : 0),
    [challenge, now],
  );

  if (booting) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#2f6f4f" /></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <Text style={styles.title}>Analitika FOB</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={() => void login()} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>FOB QR</Text>
          <Text style={styles.subtitle}>{session.user.fullName}</Text>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={async () => {
            setSession(null);
            await AsyncStorage.removeItem(STORAGE_KEY);
          }}
        >
          <Text style={styles.secondaryButtonText}>Logout</Text>
        </Pressable>
      </View>
      <View style={styles.qrCard}>
        <Text style={styles.statusText}>
          {status?.status === 'in' ? 'On shift' : 'Off shift'}
          {status?.lastChangedAt ? ` · ${formatTime(status.lastChangedAt)}` : ''}
        </Text>
        <View style={styles.qrBox}>
          {challenge ? <QRCode value={challenge.payload} size={230} /> : <ActivityIndicator color="#2f6f4f" />}
        </View>
        <Text style={styles.subtitle}>Refreshes in {secondsLeft}s</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={() => void refresh()} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Refreshing...' : 'Refresh QR'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eef3ee', padding: 18, gap: 12, justifyContent: 'center' },
  center: { flex: 1, backgroundColor: '#eef3ee', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#1f2f26', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#496055', fontSize: 14, fontWeight: '700' },
  statusText: { color: '#1f2f26', fontSize: 18, fontWeight: '800' },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#c6d3c8', borderRadius: 12, padding: 12, fontSize: 17 },
  button: { backgroundColor: '#2f6f4f', borderRadius: 12, padding: 13, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  secondaryButton: { backgroundColor: '#dbe4dc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#223529', fontWeight: '800' },
  qrCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  qrBox: { width: 260, height: 260, backgroundColor: '#ffffff', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#af4234', fontWeight: '700' },
});
