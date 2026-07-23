import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Feedback, Modal, PageHeader, RefreshButton, Table } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type { ManagedUser, Role, Session, Shop } from '../../types';

export const UsersPanel = ({ session }: { session: Session }) => {
  const emptyForm = { username: '', firstName: '', lastName: '', password: '', role: 'worker' as Role, shopId: '' };
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextUsers, nextShops] = await Promise.all([api.users.list(session.token), api.shops.list(session.token)]);
      setUsers(nextUsers);
      setShops(nextShops);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const edit = (user: ManagedUser) => {
    setEditingId(user.id);
    setForm({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      password: '',
      role: user.role,
      shopId: user.shopId ?? '',
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const payload = {
        username: form.username.trim().toLowerCase(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        shopId: form.role === 'manager' ? null : form.shopId || null,
      };
      if (editingId) {
        await api.users.update(session.token, editingId, payload);
        setNotice('Пользователь обновлен.');
      } else {
        await api.users.create(session.token, { ...payload, password: form.password });
        setNotice('Пользователь создан.');
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordUser) {
      return;
    }
    try {
      await api.users.resetPassword(session.token, passwordUser.id, newPassword);
      setNotice(`Пароль для ${passwordUser.username} обновлен.`);
      setPasswordUser(null);
      setNewPassword('');
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const remove = async (user: ManagedUser) => {
    if (!window.confirm(`Удалить пользователя ${user.username}?`)) {
      return;
    }
    try {
      await api.users.delete(session.token, user.id);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const shopName = (user: ManagedUser) => shops.find((shop) => shop.id === user.shopId)?.name ?? 'Не назначен';

  return (
    <section className="page-section">
      <PageHeader title="Пользователи" subtitle="Управление доступом, ролями, магазинами и сбросом паролей." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} notice={notice} />
      <form className="form-grid website-form" onSubmit={save}>
        <input placeholder="Логин" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <input placeholder="Имя" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        <input placeholder="Фамилия" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        {!editingId && <input placeholder="Пароль" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />}
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
          <option value="worker">Работник</option>
          <option value="manager">Менеджер</option>
          <option value="store_tablet">Планшет магазина</option>
        </select>
        <select value={form.shopId} disabled={form.role === 'manager'} onChange={(event) => setForm({ ...form, shopId: event.target.value })}>
          <option value="">Без магазина</option>
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select>
        <button>{editingId ? 'Сохранить' : 'Создать'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => {
          setEditingId(null);
          setForm(emptyForm);
        }}>Отмена</button>}
      </form>
      {loading ? <p>Загружаем пользователей...</p> : (
        <Table>
          <thead><tr><th>Логин</th><th>ФИО</th><th>Роль</th><th>Магазин</th><th>Действия</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.fullName}</td>
                <td>{user.role === 'manager' ? 'Менеджер' : user.role === 'store_tablet' ? 'Планшет магазина' : 'Работник'}</td>
                <td>{user.role === 'manager' ? '-' : shopName(user)}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => edit(user)}>Редактировать</button>
                  <button className="secondary" onClick={() => {
                    setPasswordUser(user);
                    setNewPassword('');
                  }}>Сбросить пароль</button>
                  <button className="danger" onClick={() => void remove(user)} disabled={user.id === session.user.id}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {passwordUser && (
        <Modal title={`Сброс пароля: ${passwordUser.username}`} onClose={() => setPasswordUser(null)}>
          <form className="modal-form" onSubmit={resetPassword}>
            <label>
              Новый пароль
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoFocus />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setPasswordUser(null)}>Отмена</button>
              <button disabled={newPassword.length < 5}>Обновить пароль</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
};
