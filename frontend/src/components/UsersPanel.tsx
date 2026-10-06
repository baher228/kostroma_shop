import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { MACHINE_NUMBERS } from '../constants/dashboard';
import { ManagedUser, Role, Session, Shop } from '../types/models';

type UsersPanelProps = {
  session: Session;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Server error.');

const roleLabel = (role: Role) => {
  if (role === 'manager') return 'Менеджер';
  if (role === 'store_tablet') return 'Планшет магазина';
  return 'Работник';
};

export const UsersPanel = ({ session }: UsersPanelProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [updatingShopId, setUpdatingShopId] = useState<string | null>(null);
  const [deletingShopId, setDeletingShopId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const [newShopName, setNewShopName] = useState('');
  const [newShopMachineNumber, setNewShopMachineNumber] = useState<number>(1);
  const [createUserShopId, setCreateUserShopId] = useState<string | null>(null);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isShopsOpen, setIsShopsOpen] = useState(false);

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
        shopId: role === 'manager' ? null : createUserShopId,
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
      const created = await shopsApi.create(session.token, name, newShopMachineNumber);
      setShops((current) => [...current, created]);
      setNewShopName('');
      setNewShopMachineNumber(1);
      if (!createUserShopId) {
        setCreateUserShopId(created.id);
      }
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setCreatingShop(false);
    }
  };

  const updateMachine = async (shopId: string, machineNumber: number) => {
    try {
      setUpdatingShopId(shopId);
      setError('');
      const updated = await shopsApi.updateMachine(session.token, shopId, machineNumber);
      setShops((current) =>
        current
          .map((shop) => (shop.id === shopId ? updated : shop))
          .sort((a, b) => a.machineNumber - b.machineNumber || a.name.localeCompare(b.name, 'ru')),
      );
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setUpdatingShopId(null);
    }
  };

  const removeShop = async (shopId: string) => {
    try {
      setDeletingShopId(shopId);
      setError('');
      await shopsApi.delete(session.token, shopId);
      setShops((current) => current.filter((shop) => shop.id !== shopId));
      setUsers((current) =>
        current.map((user) =>
          user.shopId === shopId
            ? {
                ...user,
                shopId: null,
                shopName: null,
              }
            : user,
        ),
      );
      setCreateUserShopId((current) => (current === shopId ? null : current));
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingShopId(null);
    }
  };

  const confirmRemoveShop = (shop: Shop) => {
    Alert.alert(
      'Удалить магазин?',
      `Магазин "${shop.name}" будет удален. Привязка работников к нему тоже снимется.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void removeShop(shop.id);
          },
        },
      ],
    );
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

  const workerShopLabel = (user: ManagedUser) => {
    if (!user.shopId) {
      return 'Не назначен';
    }
    return shops.find((shop) => shop.id === user.shopId)?.name ?? user.shopName ?? user.shopId;
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

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.collapsibleSection}>
        <Pressable style={styles.sectionToggle} onPress={() => setIsCreateUserOpen((current) => !current)}>
          <Text style={styles.sectionToggleTitle}>Создать пользователя</Text>
          <Text style={styles.sectionToggleIcon}>{isCreateUserOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {isCreateUserOpen && (
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
              <Pressable style={[styles.roleButton, role === 'store_tablet' && styles.roleButtonActive]} onPress={() => setRole('store_tablet')}>
                <Text style={[styles.roleButtonText, role === 'store_tablet' && styles.roleButtonTextActive]}>Планшет</Text>
              </Pressable>
            </View>

            {role !== 'manager' && (
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
        )}
      </View>

      <View style={styles.collapsibleSection}>
        <Pressable style={styles.sectionToggle} onPress={() => setIsShopsOpen((current) => !current)}>
          <Text style={styles.sectionToggleTitle}>Магазины</Text>
          <Text style={styles.sectionToggleIcon}>{isShopsOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {isShopsOpen && (
          <View style={styles.createBox}>
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
            <View style={styles.machineButtonsRow}>
              {MACHINE_NUMBERS.map((machineNumber) => {
                const active = newShopMachineNumber === machineNumber;
                return (
                  <Pressable
                    key={machineNumber}
                    style={[styles.machineButton, active && styles.machineButtonActive]}
                    onPress={() => setNewShopMachineNumber(machineNumber)}
                  >
                    <Text style={[styles.machineButtonText, active && styles.machineButtonTextActive]}>
                      {`Машина ${machineNumber}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.shopsList}>
              {shops.map((shop) => (
                <View key={shop.id} style={styles.shopCard}>
                  <View style={styles.shopCardHeader}>
                    <Text style={styles.shopCardTitle}>{shop.name}</Text>
                    <Pressable
                      style={[styles.deleteShopButton, deletingShopId === shop.id && styles.createButtonDisabled]}
                      onPress={() => confirmRemoveShop(shop)}
                      disabled={deletingShopId === shop.id}
                    >
                      <Text style={styles.deleteShopButtonText}>
                        {deletingShopId === shop.id ? '...' : 'Удалить'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.shopCardMeta}>{`Текущая группа: Машина ${shop.machineNumber}`}</Text>
                  <View style={styles.machineButtonsRow}>
                    {MACHINE_NUMBERS.map((machineNumber) => {
                      const active = shop.machineNumber === machineNumber;
                      return (
                        <Pressable
                          key={`${shop.id}:${machineNumber}`}
                          style={[styles.machineButton, active && styles.machineButtonActive]}
                          onPress={() => void updateMachine(shop.id, machineNumber)}
                          disabled={updatingShopId === shop.id}
                        >
                          <Text style={[styles.machineButtonText, active && styles.machineButtonTextActive]}>
                            {updatingShopId === shop.id && active ? '...' : machineNumber}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#2f6f4f" />
        </View>
      ) : (
        <View style={styles.usersSection}>
          <Text style={styles.usersSectionTitle}>Пользователи</Text>
          <View style={styles.usersListWrap}>
            <ScrollView style={styles.usersList} contentContainerStyle={styles.usersListContent} showsVerticalScrollIndicator>
              {users.map((user) => (
                <View key={user.id} style={styles.userCard}>
                  <Text style={styles.userName}>{user.fullName}</Text>
                  <Text style={styles.userMeta}>
                    @{user.username} · {roleLabel(user.role)}
                  </Text>
                  {user.role !== 'manager' && (
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
                          : `Магазин: ${workerShopLabel(user)} (нажмите для изменения)`}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
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
    borderWidth: 1,
    borderColor: '#bccabf',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#2f4437',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 14,
    color: '#2f4437',
    fontWeight: '700',
  },
  collapsibleSection: {
    marginTop: 10,
  },
  sectionToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#d4ddd5',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  sectionToggleTitle: {
    fontSize: 14,
    color: '#2f4437',
    fontWeight: '700',
  },
  sectionToggleIcon: {
    fontSize: 12,
    color: '#4c6153',
    fontWeight: '800',
  },
  createBox: {
    gap: 8,
    marginTop: 8,
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
  machineButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  machineButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8d3ca',
    backgroundColor: '#edf3ee',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  machineButtonActive: {
    backgroundColor: '#2f6f4f',
    borderColor: '#2f6f4f',
  },
  machineButtonText: {
    color: '#334b3d',
    fontWeight: '700',
    fontSize: 12,
  },
  machineButtonTextActive: {
    color: '#ffffff',
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
  shopsList: {
    gap: 8,
  },
  shopCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cfdbd1',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 6,
  },
  shopCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  shopCardTitle: {
    color: '#1d2f24',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  shopCardMeta: {
    color: '#4c6153',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteShopButton: {
    borderRadius: 10,
    backgroundColor: '#9f4038',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deleteShopButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  loadingBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  usersSection: {
    flex: 1,
    minHeight: 0,
    marginTop: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#d4ddd5',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 8,
  },
  usersSectionTitle: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 14,
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
