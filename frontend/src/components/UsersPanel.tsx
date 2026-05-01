import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { shopsApi } from '../api/shops';
import { usersApi } from '../api/users';
import { ManagedUser, Role, Session, Shop } from '../types/models';

type UsersPanelProps = {
  session: Session;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Server error.');

const roleLabel = (role: Role) => (role === 'manager' ? 'Менеджер' : 'Работник');

export const UsersPanel = ({ session }: UsersPanelProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const [newShopName, setNewShopName] = useState('');
  const [createUserShopId, setCreateUserShopId] = useState<string | null>(null);

  const [shopPickerUserId, setShopPickerUserId] = useState<string | null>(null);
  const [shopPickerTarget, setShopPickerTarget] = useState<'create-user' | 'existing-user' | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [nextUsers, nextShops] = await Promise.all([usersApi.list(session.token), shopsApi.list(session.token)]);
      setUsers(nextUsers);
      setShops(nextShops);
      if (nextShops.length > 0 && !createUserShopId) {
        setCreateUserShopId(nextShops[0].id);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session.token]);

  const createUser = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedFirstName || !normalizedLastName || !normalizedUsername || !password.trim()) {
      setError('Заполните логин, имя, фамилию и пароль.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const created = await usersApi.create(session.token, {
        username: normalizedUsername,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        password,
        role,
        shopId: role === 'worker' ? createUserShopId : null,
      });
      setUsers((current) => [...current, created]);
      setFirstName('');
      setLastName('');
      setUsername('');
      setPassword('');
      setRole('worker');
      setCreateUserShopId(shops[0]?.id ?? null);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
    }
  };

  const createShop = async () => {
    const name = newShopName.trim();
    if (!name) {
      setError('Сначала введите название магазина.');
      return;
    }
    try {
      setCreatingShop(true);
      setError('');
      const created = await shopsApi.create(session.token, name);
      setShops((current) => [...current, created]);
      setNewShopName('');
      if (!createUserShopId) {
        setCreateUserShopId(created.id);
      }
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setCreatingShop(false);
    }
  };

  const assignShop = async (userId: string, shopId: string | null) => {
    try {
      setAssigningUserId(userId);
      setError('');
      const updated = await usersApi.assignShop(session.token, userId, shopId);
      setUsers((current) => current.map((user) => (user.id === userId ? updated : user)));
      setShopPickerUserId(null);
      setShopPickerTarget(null);
    } catch (assignError) {
      setError(errorMessage(assignError));
    } finally {
      setAssigningUserId(null);
    }
  };

  const userById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])) as Record<string, ManagedUser>,
    [users],
  );

  const pickerTitle =
    shopPickerTarget === 'create-user'
      ? 'Выберите магазин для нового работника'
      : `Назначить магазин для ${shopPickerUserId ? userById[shopPickerUserId]?.fullName ?? 'работника' : 'работника'}`;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Пользователи и магазины</Text>
        <Pressable style={styles.refreshButton} onPress={loadData}>
          <Text style={styles.refreshButtonText}>Обновить</Text>
        </Pressable>
      </View>

      <View style={styles.createBox}>
        <Text style={styles.sectionTitle}>Создать пользователя</Text>
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
          value={firstName}
          onChangeText={setFirstName}
          style={styles.input}
          placeholder="Имя"
          placeholderTextColor="#7a8b7f"
          maxLength={80}
        />
        <TextInput
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          placeholder="Фамилия"
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
            <Text style={[styles.roleButtonText, role === 'worker' && styles.roleButtonTextActive]}>Работник</Text>
          </Pressable>
          <Pressable style={[styles.roleButton, role === 'manager' && styles.roleButtonActive]} onPress={() => setRole('manager')}>
            <Text style={[styles.roleButtonText, role === 'manager' && styles.roleButtonTextActive]}>Менеджер</Text>
          </Pressable>
        </View>

        {role === 'worker' && (
          <Pressable
            style={styles.shopSelectButton}
            onPress={() => {
              setShopPickerTarget('create-user');
              setShopPickerUserId(null);
            }}
          >
            <Text style={styles.shopSelectLabel}>
              Магазин: {shops.find((shop) => shop.id === createUserShopId)?.name ?? 'Не выбран'}
            </Text>
          </Pressable>
        )}

        <Pressable style={[styles.createButton, saving && styles.createButtonDisabled]} onPress={createUser} disabled={saving}>
          <Text style={styles.createButtonText}>{saving ? 'Сохранение...' : 'Создать пользователя'}</Text>
        </Pressable>
      </View>

      <View style={styles.createBox}>
        <Text style={styles.sectionTitle}>Магазины</Text>
        <View style={styles.shopCreateRow}>
          <TextInput
            value={newShopName}
            onChangeText={setNewShopName}
            style={[styles.input, styles.shopInput]}
            placeholder="Название нового магазина"
            placeholderTextColor="#7a8b7f"
            maxLength={140}
          />
          <Pressable
            style={[styles.createShopButton, creatingShop && styles.createButtonDisabled]}
            onPress={createShop}
            disabled={creatingShop}
          >
            <Text style={styles.createShopButtonText}>{creatingShop ? '...' : 'Добавить'}</Text>
          </Pressable>
        </View>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#2f6f4f" />
        </View>
      ) : (
        <View style={styles.usersListWrap}>
          <ScrollView style={styles.usersList} contentContainerStyle={styles.usersListContent} showsVerticalScrollIndicator>
            {users.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <Text style={styles.userName}>{user.fullName}</Text>
                <Text style={styles.userMeta}>
                  @{user.username} · {roleLabel(user.role)}
                </Text>
                {user.role === 'worker' && (
                  <Pressable
                    style={styles.shopAssignButton}
                    onPress={() => {
                      setShopPickerTarget('existing-user');
                      setShopPickerUserId(user.id);
                    }}
                    disabled={assigningUserId === user.id}
                  >
                    <Text style={styles.shopAssignButtonText}>
                      {assigningUserId === user.id
                        ? 'Сохранение...'
                        : `Магазин: ${user.shopName ?? 'Не назначен'} (нажмите для изменения)`}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={shopPickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShopPickerTarget(null);
          setShopPickerUserId(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{pickerTitle}</Text>
            <ScrollView style={styles.modalList}>
              {shopPickerTarget === 'existing-user' && shopPickerUserId && (
                <Pressable
                  style={styles.modalItem}
                  onPress={() => {
                    void assignShop(shopPickerUserId, null);
                  }}
                >
                  <Text style={styles.modalItemText}>Без магазина</Text>
                </Pressable>
              )}
              {shops.map((shop) => (
                <Pressable
                  key={shop.id}
                  style={styles.modalItem}
                  onPress={() => {
                    if (shopPickerTarget === 'create-user') {
                      setCreateUserShopId(shop.id);
                      setShopPickerTarget(null);
                      return;
                    }
                    if (shopPickerUserId) {
                      void assignShop(shopPickerUserId, shop.id);
                    }
                  }}
                >
                  <Text style={styles.modalItemText}>{shop.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.modalCancelButton}
              onPress={() => {
                setShopPickerTarget(null);
                setShopPickerUserId(null);
              }}
            >
              <Text style={styles.modalCancelText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 0,
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
  sectionTitle: {
    fontSize: 14,
    color: '#2f4437',
    fontWeight: '700',
  },
  createBox: {
    gap: 8,
    marginBottom: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#d4ddd5',
    padding: 10,
    backgroundColor: '#ffffff',
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
  shopSelectButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8d3ca',
    backgroundColor: '#eef4ef',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  shopSelectLabel: {
    color: '#2c4034',
    fontWeight: '700',
    fontSize: 13,
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
  shopCreateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shopInput: {
    flex: 1,
  },
  createShopButton: {
    borderRadius: 11,
    backgroundColor: '#1f4f37',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createShopButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
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
  usersListWrap: {
    flex: 1,
    minHeight: 0,
  },
  usersList: {
    flex: 1,
  },
  usersListContent: {
    gap: 8,
    paddingBottom: 16,
  },
  userCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cfdbd1',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 4,
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
  shopAssignButton: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c7d3c9',
    backgroundColor: '#eef4ef',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shopAssignButtonText: {
    color: '#2c4034',
    fontWeight: '700',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 32, 26, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c5d1c7',
    backgroundColor: '#f7faf7',
    padding: 14,
    gap: 12,
    maxHeight: '70%',
  },
  modalTitle: {
    color: '#1f2f26',
    fontSize: 17,
    fontWeight: '800',
  },
  modalList: {
    maxHeight: 320,
  },
  modalItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1dbd2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalItemText: {
    color: '#2a3f33',
    fontSize: 14,
    fontWeight: '700',
  },
  modalCancelButton: {
    borderRadius: 11,
    backgroundColor: '#dbe4dc',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#2b3d31',
    fontWeight: '700',
    fontSize: 13,
  },
});
