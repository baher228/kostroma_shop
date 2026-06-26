import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Login } from './app/Login';
import { AttendancePanel } from './panels/attendance/AttendancePanel';
import { AppDownloadPanel } from './panels/app/AppDownloadPanel';
import { OrdersPanel } from './panels/orders/OrdersPanel';
import { OverviewPanel } from './panels/overview/OverviewPanel';
import { ProductsPanel } from './panels/products/ProductsPanel';
import { ShopsPanel } from './panels/shops/ShopsPanel';
import { UsersPanel } from './panels/users/UsersPanel';
import './styles.css';
import { Session } from './types';

type Section = 'overview' | 'attendance' | 'users' | 'shops' | 'products' | 'orders' | 'app';

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
createRoot(document.getElementById('root')!).render(<App />);
