import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Feedback, PageHeader, RefreshButton, Table } from '../../components/ui';
import { intOrZero, messageOf } from '../../shared/format';
import type { Session, Shop } from '../../types';

export const ShopsPanel = ({ session }: { session: Session }) => {
  const emptyForm = { name: '', machineNumber: '1' };
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setShops(await api.shops.list(session.token));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = { name: form.name.trim(), machineNumber: intOrZero(form.machineNumber) || 1 };
      if (editingId) {
        await api.shops.update(session.token, editingId, payload);
      } else {
        await api.shops.create(session.token, payload);
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const remove = async (shop: Shop) => {
    if (!window.confirm(`Удалить магазин ${shop.name}?`)) {
      return;
    }
    try {
      await api.shops.delete(session.token, shop.id);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="page-section">
      <PageHeader title="Магазины" subtitle="Список точек и привязка к машинам." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} />
      <form className="form-grid compact website-form" onSubmit={save}>
        <input placeholder="Название магазина" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <select value={form.machineNumber} onChange={(event) => setForm({ ...form, machineNumber: event.target.value })}>
          <option value="1">Машина 1</option>
          <option value="2">Машина 2</option>
          <option value="3">Машина 3</option>
        </select>
        <button>{editingId ? 'Сохранить магазин' : 'Создать магазин'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => {
          setEditingId(null);
          setForm(emptyForm);
        }}>Отмена</button>}
      </form>
      {loading ? <p>Загружаем магазины...</p> : (
        <Table>
          <thead><tr><th>Название</th><th>Машина</th><th>Действия</th></tr></thead>
          <tbody>
            {shops.map((shop) => (
              <tr key={shop.id}>
                <td>{shop.name}</td>
                <td>{shop.machineNumber}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => {
                    setEditingId(shop.id);
                    setForm({ name: shop.name, machineNumber: String(shop.machineNumber) });
                  }}>Редактировать</button>
                  <button className="danger" onClick={() => void remove(shop)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
};
