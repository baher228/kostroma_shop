import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Metric, PageHeader } from '../../components/ui';
import { addDays, startOfWeek } from '../../dateUtils';
import type { CheckInStats, ManagedUser, SellerOrder, Session, Shop } from '../../types';

type OverviewSection = 'overview' | 'attendance' | 'users' | 'tasks' | 'shops' | 'products' | 'orders' | 'app';

export const OverviewPanel = ({
  session,
  setSection,
}: {
  session: Session;
  setSection: (section: OverviewSection) => void;
}) => {
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
          ['Задачи', 'Назначение задач сотрудникам и контроль выполнения.', 'tasks'],
          ['Остатки', 'Менеджерская таблица остатков, заказов и продаж.', 'products'],
          ['Заказ', 'Сводная таблица заказов по магазинам, машинам и товарам.', 'orders'],
          ['Приложение', 'Скачать актуальный APK для Android.', 'app'],
        ].map(([title, text, target]) => (
          <button key={target} className="landing-card" onClick={() => setSection(target as OverviewSection)}>
            <span>{title}</span>
            <small>{text}</small>
          </button>
        ))}
      </div>
    </section>
  );
};
