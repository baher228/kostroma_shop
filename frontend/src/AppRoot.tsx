import { ActivityIndicator, Platform, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AudioQcProvider } from './features/audioQc/AudioQcProvider';
import { LoginScreen } from './screens/LoginScreen';
import { StockScreen } from './screens/StockScreen';
import { useAutoAppUpdate } from './hooks/useAutoAppUpdate';

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

  return (
    <AudioQcProvider session={session}>
      <StockScreen session={session} onLogout={logout} />
    </AudioQcProvider>
  );
};

export const AppRoot = () => {
  const markActivity = useAutoAppUpdate();
  return (
    <View style={styles.root} onTouchStart={markActivity}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
