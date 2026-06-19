import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Login } from './app/Login';
import { Feedback, Metric, Modal, NumberInput, PageHeader, RefreshButton, Table } from './components/ui';
import { addDays, startOfWeek } from './dateUtils';
import './styles.css';
import { OrdersPanel } from './panels/orders/OrdersPanel';
import { ProductsPanel } from './panels/products/ProductsPanel';
import {
  formatDate,
  formatDateTime,
  formatMinutes,
  intOrZero,
  messageOf,
  numberOrZero,
  orderStatusLabel,
  statusLabel,
} from './shared/format';
import {
  CheckInStats,
  ManagedUser,
  Role,
  SellerOrder,
  Session,
  Shop,
  WorkerCheckInEvent,
} from './types';

type Section = 'overview' | 'attendance' | 'users' | 'shops' | 'products' | 'orders' | 'app';

type ApkManifest = {
  version: string;
  fileName: string;
  url: string;
  buildSha: string;
  updatedAt: string;
};

const STORAGE_KEY = 'analitika_dashboard_session_v1';

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setBooting(false);
      return;
    }
    const parsed = JSON.parse(saved) as Session;
    api.me(parsed.token)
      .then((user) => {
        if (user.username !== 'admin') {
          throw new Error('Доступ к панели разрешен только пользователю admin.');
        }
        setSession({ token: parsed.token, user });
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return <main className="loading">Загрузка панели...</main>;
  }
  if (!session) {
    return <Login onLogin={(nextSession) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
    }} />;
  }
  return <Dashboard session={session} onLogout={() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }} />;
};

const Dashboard = ({ session, onLogout }: { session: Session; onLogout: () => void }) => {
  const [section, setSection] = useState<Section>('overview');
  const nav: Array<{ key: Section; label: string }> = [
    { key: 'overview', label: 'Обзор' },
    { key: 'attendance', label: 'Посещаемость' },
    { key: 'users', label: 'Пользователи' },
    { key: 'shops', label: 'Магазины' },
    { key: 'products', label: 'Остатки' },
    { key: 'orders', label: 'Заказ' },
    { key: 'app', label: 'Приложение' },
  ];

  return (
    <div className="site-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Analitika Admin</p>
          <h1>Панель управления</h1>
        </div>
        <nav className="top-nav">
          {nav.map((item) => (
            <button key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="account-box">
          <span>{session.user.fullName}</span>
          <button className="secondary" onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <main className={section === 'products' ? 'content stock-content' : 'content'}>
        {section === 'overview' && <OverviewPanel session={session} setSection={setSection} />}
        {section === 'attendance' && <AttendancePanel session={session} />}
        {section === 'users' && <UsersPanel session={session} />}
        {section === 'shops' && <ShopsPanel session={session} />}
        {section === 'products' && <ProductsPanel session={session} />}
        {section === 'orders' && <OrdersPanel session={session} />}
        {section === 'app' && <AppDownloadPanel />}
      </main>
    </div>
  );
};

const OverviewPanel = ({ session, setSection }: { session: Session; setSection: (section: Section) => void }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [stats, setStats] = useState<CheckInStats | null>(null);

  useEffect(() => {
    void Promise.all([
      api.users.list(session.token),
      api.shops.list(session.token),
      api.orders.list(session.token),
      api.checkin.stats(session.token, startOfWeek(), addDays(startOfWeek(), 6)),
    ]).then(([nextUsers, nextShops, nextOrders, nextStats]) => {
      setUsers(nextUsers);
      setShops(nextShops);
      setOrders(nextOrders);
      setStats(nextStats);
    });
  }, [session.token]);

  return (
    <section className="page-section">
      <PageHeader title="Обзор" subtitle="Ключевые показатели текущей недели и быстрый переход к управлению." />
      <div className="metric-grid">
        <Metric label="Пользователи" value={users.length} hint="Все роли" />
        <Metric label="Магазины" value={shops.length} hint="Активные точки" />
        <Metric label="Новые заказы" value={orders.filter((order) => order.status === 'new').length} hint="Ожидают обработки" />
        <Metric label="Сейчас на смене" value={stats?.currentlyIn ?? 0} hint="По check-in" />
      </div>
      <div className="landing-grid">
        {[
          ['Посещаемость', 'Статусы работников, часы, опоздания и графики.', 'attendance'],
          ['Пользователи', 'Создание, роли, привязка к магазинам и сброс пароля.', 'users'],
          ['Остатки', 'Менеджерская таблица остатков, заказов и продаж.', 'products'],
          ['Заказ', 'Сводная таблица заказов по магазинам, машинам и товарам.', 'orders'],
          ['Приложение', 'Скачать актуальный APK для Android.', 'app'],
        ].map(([title, text, target]) => (
          <button key={target} className="landing-card" onClick={() => setSection(target as Section)}>
            <span>{title}</span>
            <small>{text}</small>
          </button>
        ))}
      </div>
    </section>
  );
};

const AppDownloadPanel = () => {
  const [manifest, setManifest] = useState<ApkManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/downloads/analitika-latest.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('APK еще не опубликован. Запустите сборку Android APK.');
      }
      const nextManifest = await response.json() as ApkManifest;
      setManifest(nextManifest);
    } catch (err) {
      setManifest(null);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="page-section">
      <PageHeader title="Приложение" subtitle="Актуальный Android APK для установки на телефоны." action={<RefreshButton onClick={() => load()} />} />
      {loading ? <p>Проверяем доступную сборку...</p> : <Feedback error={error} />}
      {manifest && (
        <article className="download-card">
          <div>
            <p className="eyebrow">Android APK</p>
            <h3>Analitika v{manifest.version}</h3>
            <p>{manifest.fileName}</p>
            <small>Обновлено: {formatDateTime(manifest.updatedAt)} · commit {manifest.buildSha}</small>
          </div>
          <a className="download-button" href={manifest.url} download={manifest.fileName}>Скачать APK</a>
        </article>
      )}
    </section>
  );
};

const UsersPanel = ({ session }: { session: Session }) => {
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
        shopId: form.role === 'worker' ? form.shopId || null : null,
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
                <td>{user.role === 'manager' ? 'Менеджер' : 'Работник'}</td>
                <td>{user.role === 'worker' ? shopName(user) : '-'}</td>
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

const ShopsPanel = ({ session }: { session: Session }) => {
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

const AttendancePanel = ({ session }: { session: Session }) => {
  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(addDays(startOfWeek(), 6));
  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await api.checkin.stats(session.token, from, to));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  return (
    <section className="page-section">
      <PageHeader title="Посещаемость" subtitle="Check-in работников, часы, опоздания и отсутствия." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} />
      <div className="toolbar hero-toolbar">
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button onClick={() => void load()}>Показать период</button>
      </div>
      {loading ? <p>Считаем посещаемость...</p> : stats && (
        <>
          <div className="metric-grid">
            <Metric label="На смене" value={stats.currentlyIn} hint="Сейчас" />
            <Metric label="Вне смены" value={stats.currentlyOut} hint="Сейчас" />
            <Metric label="Check-in" value={stats.totalCheckIns} hint={`${formatDate(stats.from)} - ${formatDate(stats.to)}`} />
            <Metric label="Часы" value={formatMinutes(stats.workedMinutes)} hint="Оценка по событиям" />
            <Metric label="Опоздания" value={stats.lateCount} hint={`Позже ${stats.expectedStartTime}`} />
            <Metric label="Отсутствия" value={stats.missingCount} hint="Нет check-in за день" />
          </div>
          <div className="chart-grid">
            <BarChart title="Часы по работникам" items={stats.workers.map((worker) => ({ label: worker.workerDisplayName, value: Math.round(worker.workedMinutes / 60) }))} suffix="ч" />
            <BarChart title="Check-in по дням" items={stats.daily.map((day) => ({ label: day.date.slice(5), value: day.checkIns }))} suffix="" />
          </div>
          <div className="status-grid">
            {stats.workers.map((worker) => (
              <article key={worker.workerId} className="status-card">
                <span className={`status-dot ${worker.status}`} />
                <div>
                  <strong>{worker.workerDisplayName}</strong>
                  <p>{statusLabel(worker.status)} · {formatDateTime(worker.lastChangedAt)}</p>
                </div>
              </article>
            ))}
          </div>
          <Table>
            <thead><tr><th>Работник</th><th>Дней на смене</th><th>Часы</th><th>Check-in</th><th>Опоздания</th><th>Отсутствия</th><th>Текущий статус</th></tr></thead>
            <tbody>
              {stats.workers.map((worker) => (
                <tr key={worker.workerId}>
                  <td>{worker.workerDisplayName}</td>
                  <td>{worker.daysPresent}</td>
                  <td>{formatMinutes(worker.workedMinutes)}</td>
                  <td>{worker.totalCheckIns}</td>
                  <td>{worker.lateDays}</td>
                  <td>{worker.missingDays}</td>
                  <td><span className={`pill ${worker.status}`}>{statusLabel(worker.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </Table>
          <EventsTable events={stats.events} />
        </>
      )}
    </section>
  );
};

const EventsTable = ({ events }: { events: WorkerCheckInEvent[] }) => (
  <Table>
    <thead><tr><th>Время</th><th>Работник</th><th>Событие</th></tr></thead>
    <tbody>
      {events.slice(0, 80).map((event) => (
        <tr key={event.id}>
          <td>{formatDateTime(event.eventAt)}</td>
          <td>{event.workerDisplayName}</td>
          <td>{event.status === 'in' ? 'Пришел' : 'Ушел'}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

const BarChart = ({ title, items, suffix }: { title: string; items: Array<{ label: string; value: number }>; suffix: string }) => {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <article className="chart-card">
      <h3>{title}</h3>
      <div className="bars">
        {items.length === 0 ? <p>Нет данных</p> : items.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></div>
            <strong>{item.value}{suffix}</strong>
          </div>
        ))}
      </div>
    </article>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
