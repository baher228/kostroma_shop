import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth';
import { Session } from '../types/models';

const STORAGE_KEY = 'stock_session_v1';

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const restore = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved) {
          return;
        }
        const parsed = JSON.parse(saved) as Session;
        if (!parsed.token) {
          return;
        }
        const user = await authApi.me(parsed.token);
        setSession({ token: parsed.token, user });
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = async (username: string, password: string) => {
    const nextSession = await authApi.login(username, password);
    setSession(nextSession);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  };

  const logout = async () => {
    setSession(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      loading,
      session,
      login,
      logout,
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
};
