import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Login } from './app/Login';
import { AudioQcPanel } from './panels/audioQc/AudioQcPanel';
import { AttendancePanel } from './panels/attendance/AttendancePanel';
import { AppDownloadPanel } from './panels/app/AppDownloadPanel';
import { DeliveriesPanel } from './panels/deliveries/DeliveriesPanel';
import { OrdersPanel } from './panels/orders/OrdersPanel';
import { ProductsPanel } from './panels/products/ProductsPanel';
import { PromotionsPanel } from './panels/promotions/PromotionsPanel';
import { ShopsPanel } from './panels/shops/ShopsPanel';
import { TasksPanel } from './panels/tasks/TasksPanel';
import { UsersPanel } from './panels/users/UsersPanel';
import './styles.css';
import { Session } from './types';

type Section = 'attendance' | 'audioQc' | 'users' | 'tasks' | 'shops' | 'products' | 'inventory' | 'orders' | 'deliveries' | 'promotions' | 'app';

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
    let parsed: Session;
    try {
      parsed = JSON.parse(saved) as Session;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setBooting(false);
      return;
    }
    if (!parsed.token) {
      localStorage.removeItem(STORAGE_KEY);
      setBooting(false);
      return;
    }
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
  const [section, setSection] = useState<Section>(() => new URLSearchParams(window.location.search).has('gmail') ? 'promotions' : 'attendance');
  const nav: Array<{ key: Section; label: string }> = [
    { key: 'attendance', label: 'Посещаемость' },
    { key: 'audioQc', label: 'AI QC' },
    { key: 'users', label: 'Пользователи' },
    { key: 'tasks', label: 'Задачи' },
    { key: 'shops', label: 'Магазины' },
    { key: 'products', label: 'Остатки' },
    { key: 'inventory', label: 'Инвентаризация' },
    { key: 'orders', label: 'Заказ' },
    { key: 'deliveries', label: 'Приёмка' },
    { key: 'promotions', label: 'Акции' },
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
          <span className="account-avatar" aria-hidden="true">{session.user.fullName.trim().charAt(0).toUpperCase()}</span>
          <span className="account-name" title={session.user.fullName}>{session.user.fullName}</span>
          <button className="secondary" onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <main className={section === 'products' || section === 'inventory' ? 'content stock-content' : 'content'}>
        {section === 'attendance' && <AttendancePanel session={session} />}
        {section === 'audioQc' && <AudioQcPanel session={session} />}
        {section === 'users' && <UsersPanel session={session} />}
        {section === 'tasks' && <TasksPanel session={session} />}
        {section === 'shops' && <ShopsPanel session={session} />}
        {section === 'products' && <ProductsPanel session={session} />}
        {section === 'inventory' && <ProductsPanel session={session} mode="inventory" />}
        {section === 'orders' && <OrdersPanel session={session} />}
        {section === 'deliveries' && <DeliveriesPanel session={session} />}
        {section === 'promotions' && <PromotionsPanel session={session} />}
        {section === 'app' && <AppDownloadPanel />}
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
