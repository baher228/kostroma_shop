import { ActivityIndicator, Platform, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet, Text } from 'react-native';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './screens/LoginScreen';
import { StockScreen } from './screens/StockScreen';

const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;

const AppContent = () => {
  const { loading, session, login, logout } = useAuth();

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2f6f4f" />
        <Text style={styles.loadingText}>Проверка сессии...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen onSubmit={login} />;
  }

  return <StockScreen session={session} onLogout={logout} />;
};

export const AppRoot = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

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
});
