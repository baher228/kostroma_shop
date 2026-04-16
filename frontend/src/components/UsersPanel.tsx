import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usersApi } from '../api/users';
import { ManagedUser, Role, Session } from '../types/models';

type UsersPanelProps = {
  session: Session;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Ошибка сервера.');

const roleLabel = (role: Role) => (role === 'manager' ? 'Менеджер' : 'Сотрудник');

export const UsersPanel = ({ session }: UsersPanelProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('worker');

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const nextUsers = await usersApi.list(session.token);
      setUsers(nextUsers);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [session.token]);

  const createUser = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();
    if (!normalizedUsername || !normalizedDisplayName || !password.trim()) {
      setError('Заполните логин, имя и пароль.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const created = await usersApi.create(session.token, {
        username: normalizedUsername,
        displayName: normalizedDisplayName,
        password,
        role,
      });
      setUsers((current) => [...current, created]);
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('worker');
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Пользователи</Text>
        <Pressable style={styles.refreshButton} onPress={loadUsers}>
          <Text style={styles.refreshButtonText}>Обновить</Text>
        </Pressable>
      </View>

      <View style={styles.createBox}>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={styles.input}
          placeholder="Логин"
          placeholderTextColor="#7a8b7f"
          maxLength={32}
        />
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.input}
          placeholder="Имя отображения"
          placeholderTextColor="#7a8b7f"
          maxLength={80}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="Пароль"
          placeholderTextColor="#7a8b7f"
          maxLength={200}
        />

        <View style={styles.rolesRow}>
          <Pressable style={[styles.roleButton, role === 'worker' && styles.roleButtonActive]} onPress={() => setRole('worker')}>
            <Text style={[styles.roleButtonText, role === 'worker' && styles.roleButtonTextActive]}>Сотрудник</Text>
          </Pressable>
          <Pressable style={[styles.roleButton, role === 'manager' && styles.roleButtonActive]} onPress={() => setRole('manager')}>
            <Text style={[styles.roleButtonText, role === 'manager' && styles.roleButtonTextActive]}>Менеджер</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.createButton, saving && styles.createButtonDisabled]} onPress={createUser} disabled={saving}>
          <Text style={styles.createButtonText}>{saving ? 'Сохранение...' : 'Создать пользователя'}</Text>
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#2f6f4f" />
        </View>
      ) : (
        <ScrollView style={styles.usersList} contentContainerStyle={styles.usersListContent}>
          {users.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <Text style={styles.userName}>{user.displayName}</Text>
              <Text style={styles.userMeta}>
                @{user.username} · {roleLabel(user.role)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#f3f7f3',
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2f26',
  },
  refreshButton: {
    borderRadius: 10,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#294033',
    fontSize: 13,
    fontWeight: '700',
  },
  createBox: {
    gap: 8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2f26',
    fontWeight: '500',
  },
  rolesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    borderRadius: 10,
    backgroundColor: '#edf3ee',
    borderWidth: 1,
    borderColor: '#c8d3ca',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  roleButtonActive: {
    backgroundColor: '#2f6f4f',
    borderColor: '#2f6f4f',
  },
  roleButtonText: {
    color: '#334b3d',
    fontWeight: '700',
    fontSize: 13,
  },
  roleButtonTextActive: {
    color: '#ffffff',
  },
  createButton: {
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingVertical: 10,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  error: {
    color: '#af4234',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 6,
  },
  loadingBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  usersList: {
    flex: 1,
  },
  usersListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  userCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cfdbd1',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 3,
  },
  userName: {
    color: '#1d2f24',
    fontSize: 15,
    fontWeight: '700',
  },
  userMeta: {
    color: '#4c6153',
    fontSize: 12,
    fontWeight: '600',
  },
});
