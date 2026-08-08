import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';

type LoginScreenProps = {
  onSubmit: (username: string, password: string) => Promise<void>;
};

const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;

export const LoginScreen = ({ onSubmit }: LoginScreenProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { checkingUpdate, checkForAppUpdate } = useAppUpdate();

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
          accessibilityLabel="Логин"
        />
        <View style={styles.passwordField}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            style={[styles.input, styles.passwordInput]}
            placeholder="Пароль"
            placeholderTextColor="#76877c"
            accessibilityLabel="Пароль"
          />
          <Pressable
            style={styles.passwordVisibilityButton}
            onPress={() => setPasswordVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
            accessibilityState={{ selected: passwordVisible }}
          >
            <Text style={styles.passwordVisibilityIcon}>👁</Text>
          </Pressable>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Войти</Text>}
        </Pressable>

        <Pressable
          style={[styles.updateButton, checkingUpdate && styles.buttonDisabled]}
          onPress={() => void checkForAppUpdate()}
          disabled={checkingUpdate}
        >
          <Text style={styles.updateButtonText}>{checkingUpdate ? 'Проверка...' : 'Обновить'}</Text>
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
  passwordField: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  passwordVisibilityButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordVisibilityIcon: {
    fontSize: 18,
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
  updateButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2f6f4f',
    paddingVertical: 11,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#2f6f4f',
    fontSize: 16,
    fontWeight: '800',
  },
});
