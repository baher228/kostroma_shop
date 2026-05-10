import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

type LoginScreenProps = {
  onSubmit: (username: string, password: string) => Promise<void>;
};

const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;

export const LoginScreen = ({ onSubmit }: LoginScreenProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Введите логин и пароль.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(username, password);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Ошибка входа.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Вход</Text>

        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={styles.input}
          placeholder="Логин"
          placeholderTextColor="#76877c"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="Пароль"
          placeholderTextColor="#76877c"
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Войти</Text>}
        </Pressable>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#edf4ef',
    padding: 18,
    paddingTop: topInset + 18,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cad6cc',
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2f26',
  },
  input: {
    borderWidth: 1,
    borderColor: '#c8d4cb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 17,
    color: '#1f2f26',
    backgroundColor: '#f8fbf8',
  },
  error: {
    color: '#b04334',
    fontSize: 14,
    fontWeight: '700',
  },
  button: {
    borderRadius: 12,
    backgroundColor: '#2f6f4f',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
