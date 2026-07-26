import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
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
type RequestOptions = { method?: 'GET' | 'POST'; token?: string; body?: unknown };

const API_BASE_URL = (process.env.EXPO_PUBLIC_RU_API_URL || 'http://10.0.2.2:4000').replace(/\/+$/, '');
const STORAGE_KEY = 'worker_fob_session_v1';
const REQUEST_TIMEOUT_MS = 15_000;
const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;

const apiMessages: Record<string, string> = {
  'Invalid username or password.': 'Неверный логин или пароль.',
  'Only workers can load FOB status.': 'FOB доступен только сотрудникам.',
  'Only workers can create FOB QR codes.': 'FOB доступен только сотрудникам.',
  'Failed to load FOB status.': 'Не удалось загрузить статус смены.',
  'Failed to create FOB QR code.': 'Не удалось создать QR-код.',
  'Request failed.': 'Не удалось выполнить запрос.',
  'Server error.': 'Ошибка сервера.',
};

class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(apiMessages[message] ?? message);
    this.status = status;
  }
}

const request = async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const parsed = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!response.ok) {
      throw new RequestError(parsed?.message || 'Request failed.', response.status);
    }
    return (parsed ?? {}) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RequestError('Сервер не ответил. Проверьте интернет и попробуйте снова.', 0);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function App() {
  const { width } = useWindowDimensions();
  const qrSize = Math.max(190, Math.min(240, width - 76));
  const refreshInFlight = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<FobChallenge | null>(null);
  const [status, setStatus] = useState<WorkerStatus>(null);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const clearSession = useCallback(async () => {
    setSession(null);
    setChallenge(null);
    setStatus(null);
    setError('');
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved) as Partial<Session>;
        if (!parsed.token) {
          throw new Error('Сохраненная сессия повреждена.');
        }
        const response = await request<{ user: SessionUser }>('/api/auth/me', { token: parsed.token });
        if (response.user.role !== 'worker') {
          throw new Error('FOB доступен только сотрудникам.');
        }
        setSession({ token: parsed.token, user: response.user });
      } catch (restoreError) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setError(messageOf(restoreError, 'Не удалось восстановить сессию.'));
      } finally {
        setBooting(false);
      }
    };

    void restoreSession();
  }, []);

  const login = async () => {
    if (!username.trim() || !password) {
      setError('Введите логин и пароль.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const next = await request<Session>('/api/auth/login', {
        method: 'POST',
        body: { username: username.trim().toLowerCase(), password },
      });
      if (next.user.role !== 'worker') {
        throw new Error('FOB доступен только сотрудникам.');
      }
      setPassword('');
      setSession(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (loginError) {
      setError(messageOf(loginError, 'Не удалось войти.'));
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = useCallback(async () => {
    if (!session || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      setRefreshing(true);
      setError('');
      const [statusResponse, challengeResponse] = await Promise.all([
        request<{ status: WorkerStatus }>('/api/fob/me', { token: session.token }),
        request<{ challenge: FobChallenge }>('/api/fob/challenges', { method: 'POST', token: session.token }),
      ]);
      setStatus(statusResponse.status);
      setChallenge(challengeResponse.challenge);
      setNow(Date.now());
    } catch (refreshError) {
      if (refreshError instanceof RequestError && refreshError.status === 401) {
        await clearSession();
        setError('Сессия истекла. Войдите снова.');
        return;
      }
      setError(messageOf(refreshError, 'Не удалось обновить QR-код.'));
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [clearSession, session]);

  useEffect(() => {
    if (session) void refresh();
  }, [refresh, session]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!challenge) return;
    const timer = setTimeout(() => void refresh(), Math.max(1000, challenge.refreshAfterSeconds * 1000));
    return () => clearTimeout(timer);
  }, [challenge, refresh]);

  useEffect(() => {
    if (!session) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setNow(Date.now());
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh, session]);

  const secondsLeft = useMemo(() => {
    if (!challenge) return 0;
    const expiresAt = Date.parse(challenge.expiresAt);
    return Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  }, [challenge, now]);
  const qrAvailable = Boolean(challenge && secondsLeft > 0);

  if (booting) {
    return (
      <SafeAreaView style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color="#2f6f4f" />
        <Text style={styles.bootText}>Проверяем сессию...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.loginScreen}>
        <StatusBar style="dark" />
        <View style={styles.loginCard}>
          <Text style={styles.title}>Analitika FOB</Text>
          <Text style={styles.loginHint}>Войдите как сотрудник, чтобы показать свой QR-код на планшете магазина.</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Логин"
            placeholderTextColor="#68786d"
            autoCapitalize="none"
            autoComplete="username"
            returnKeyType="next"
            accessibilityLabel="Логин"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Пароль"
            placeholderTextColor="#68786d"
            secureTextEntry
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={() => void login()}
            accessibilityLabel="Пароль"
          />
          {!!error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
          <Pressable
            style={[styles.button, submitting && styles.disabled]}
            onPress={() => void login()}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Войти в Analitika FOB"
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Войти</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>FOB QR</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{session.user.fullName}</Text>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void clearSession()}
          accessibilityRole="button"
          accessibilityLabel="Выйти из Analitika FOB"
        >
          <Text style={styles.secondaryButtonText}>Выйти</Text>
        </Pressable>
      </View>

      <View style={styles.qrCard}>
        <View
          style={[styles.statusPill, status?.status === 'in' && styles.statusPillActive]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.statusText, status?.status === 'in' && styles.statusTextActive]}>
            {status?.status === 'in' ? 'На смене' : status?.status === 'out' ? 'Вне смены' : 'Отметок пока нет'}
            {status?.lastChangedAt ? ` · ${formatTime(status.lastChangedAt)}` : ''}
          </Text>
        </View>

        <View style={[styles.qrBox, { width: qrSize + 28, height: qrSize + 28 }]}>
          {qrAvailable && challenge ? (
            <QRCode value={challenge.payload} size={qrSize} backgroundColor="#ffffff" color="#17251c" />
          ) : (
            <View style={styles.qrPlaceholder} accessibilityLiveRegion="polite">
              {refreshing && <ActivityIndicator color="#2f6f4f" />}
              <Text style={styles.qrPlaceholderText}>{refreshing ? 'Обновляем QR-код...' : 'QR-код недоступен'}</Text>
            </View>
          )}
        </View>

        <Text style={styles.timerText}>
          {qrAvailable ? `QR-код обновится через ${secondsLeft} сек.` : 'Получите новый QR-код перед сканированием.'}
        </Text>
        {!!error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
        <Pressable
          style={[styles.button, styles.refreshButton, refreshing && styles.disabled]}
          onPress={() => void refresh()}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Обновить FOB QR-код"
          accessibilityState={{ disabled: refreshing, busy: refreshing }}
        >
          <Text style={styles.buttonText}>{refreshing ? 'Обновляем...' : 'Обновить QR'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef3ee',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: topInset,
    gap: 12,
  },
  loginScreen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#eef3ee',
    paddingHorizontal: 18,
    paddingTop: topInset,
  },
  center: {
    flex: 1,
    backgroundColor: '#eef3ee',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bootText: {
    color: '#344b3d',
    fontSize: 15,
    fontWeight: '700',
  },
  loginCard: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    padding: 18,
    gap: 12,
  },
  loginHint: {
    color: '#405548',
    fontSize: 15,
    lineHeight: 21,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#1f2f26',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#405548',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#f8fbf8',
    borderWidth: 1,
    borderColor: '#b9c8bd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#1f2f26',
    fontSize: 17,
  },
  button: {
    minHeight: 46,
    justifyContent: 'center',
    backgroundColor: '#2f6f4f',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#dbe4dc',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#223529',
    fontWeight: '800',
  },
  qrCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  statusPillActive: {
    backgroundColor: '#d8eddf',
  },
  statusText: {
    color: '#2b4033',
    fontSize: 15,
    fontWeight: '800',
  },
  statusTextActive: {
    color: '#1f6342',
  },
  qrBox: {
    maxWidth: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d5ded6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  qrPlaceholderText: {
    color: '#405548',
    fontWeight: '700',
    textAlign: 'center',
  },
  timerText: {
    color: '#344b3d',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  refreshButton: {
    minWidth: 180,
  },
  disabled: {
    opacity: 0.68,
  },
  error: {
    color: '#9d3028',
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
});
