import type { AppIconName } from './AppIcon';

export type HomeSectionKey =
  | 'stock'
  | 'inventory'
  | 'markdown'
  | 'orders'
  | 'orderSheet'
  | 'fob'
  | 'tasks'
  | 'support'
  | 'audioQc'
  | 'users';

export type HomeSection = { key: HomeSectionKey; label: string; icon: AppIconName; badge?: number };

export type HomeSectionGroup = { key: string; title: string; sections: HomeSection[] };

export type HomeRole = { canManage: boolean; isWorker: boolean; isStoreTablet: boolean };

export const buildHomeGroups = ({ canManage, isWorker, isStoreTablet }: HomeRole): HomeSectionGroup[] => {
  const groups: HomeSectionGroup[] = [
    {
      key: 'shelf',
      title: 'Товар на полке',
      sections: [
        { key: 'stock', label: 'Остатки', icon: 'list' },
        { key: 'inventory', label: 'Инвентаризация', icon: 'squareCheck' },
        { key: 'markdown', label: 'Уценка', icon: 'tag' },
      ],
    },
    {
      key: 'supply',
      title: 'Поставки',
      sections: [
        canManage
          ? { key: 'orderSheet', label: 'Заказ', icon: 'cart' }
          : { key: 'orders', label: 'Заказы', icon: 'truck' },
        ...(isWorker || isStoreTablet
          ? [{ key: 'fob' as const, label: isStoreTablet ? 'FOB-сканер' : 'FOB', icon: 'scan' as const }]
          : []),
      ],
    },
    {
      key: 'shift',
      title: 'Смена',
      sections: [
        { key: 'tasks', label: 'Задачи', icon: 'clipboardCheck' },
        { key: 'support', label: 'Поддержка', icon: 'help' },
      ],
    },
  ];
  if (canManage) {
    groups.push({
      key: 'admin',
      title: 'Управление',
      sections: [
        { key: 'audioQc', label: 'AI QC', icon: 'mic' },
        { key: 'users', label: 'Пользователи', icon: 'users' },
      ],
    });
  }
  return groups;
};

export const applySectionOrder = (groups: HomeSectionGroup[], order: string[]): HomeSectionGroup[] => {
  if (order.length === 0) return groups;
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return groups.map((group) => ({
    ...group,
    sections: group.sections
      .map((section, index) => ({ section, index }))
      .sort((a, b) => rank(a.section.key) - rank(b.section.key) || a.index - b.index)
      .map(({ section }) => section),
  }));
};

export const moveSection = (groups: HomeSectionGroup[], key: string, direction: -1 | 1): string[] => {
  const next = groups.map((group) => {
    const keys = group.sections.map((section) => section.key as string);
    const index = keys.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= keys.length) return keys;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    return keys;
  });
  return next.flat();
};

export const tasksWord = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'задача';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи';
  return 'задач';
};

export const greetingFor = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
};
