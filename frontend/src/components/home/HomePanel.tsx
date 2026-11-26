import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { tasksApi } from '../../api/tasks';
import { Session, Task } from '../../types/models';
import { AppIcon } from './AppIcon';
import { greetingFor, HomeSection, HomeSectionGroup, HomeSectionKey, tasksWord } from './sections';
import { homeTheme as t, initialsOf } from './theme';

type HomePanelProps = {
  session: Session;
  groups: HomeSectionGroup[];
  fontScale: number;
  refreshKey: number;
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  onOpenSection: (key: HomeSectionKey) => void;
  onSearchProducts: (query: string) => void;
  onOpenMore: () => void;
};

const pad = (value: number) => String(value).padStart(2, '0');

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const summarizeTodayTasks = (tasks: Task[], now: Date) => {
  const open = tasks.filter((task) => task.status === 'open');
  const today = open
    .map((task) => ({ task, deadline: task.deadlineAt ? new Date(task.deadlineAt) : null }))
    .filter(({ deadline }) => deadline && (isSameDay(deadline, now) || deadline < now))
    .sort((a, b) => (a.deadline as Date).getTime() - (b.deadline as Date).getTime());
  const first = today[0]?.deadline ?? null;
  return {
    openCount: open.length,
    todayCount: today.length,
    firstLabel: !first
      ? ''
      : first < now
        ? 'Есть просроченные'
        : `Первая — до ${pad(first.getHours())}:${pad(first.getMinutes())}`,
  };
};

export const HomePanel = ({
  session,
  groups,
  fontScale,
  refreshKey,
  updateAvailable,
  onApplyUpdate,
  onOpenSection,
  onSearchProducts,
  onOpenMore,
}: HomePanelProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const fs = (size: number) => Math.round(size * fontScale);

  useEffect(() => {
    let active = true;
    tasksApi
      .list(session.token)
      .then((nextTasks) => {
        if (active) setTasks(nextTasks);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session.token, refreshKey]);

  const summary = useMemo(() => summarizeTodayTasks(tasks, new Date()), [tasks]);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const matches = useMemo(
    () =>
      normalizedSearch
        ? groups.flatMap((group) => group.sections).filter((section) => section.label.toLocaleLowerCase('ru').includes(normalizedSearch))
        : [],
    [groups, normalizedSearch],
  );

  const name = session.user.firstName?.trim() || session.user.fullName;
  const subtitle = session.user.shopName ?? (session.user.role === 'manager' ? 'Менеджер' : 'Сотрудник');

  const renderCard = (section: HomeSection) => {
    const badge = section.key === 'tasks' ? summary.openCount : section.badge ?? 0;
    return (
      <Pressable
        key={section.key}
        accessibilityRole="button"
        accessibilityLabel={section.label}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => onOpenSection(section.key)}
      >
        <View style={styles.cardTop}>
          <AppIcon name={section.icon} size={Math.round(26 * fontScale)} color={t.accent} />
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { fontSize: fs(12) }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardLabel, { fontSize: fs(17) }]} numberOfLines={2}>
          {section.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.greeting, { fontSize: fs(26) }]} numberOfLines={1}>
            {greetingFor(new Date())}, {name}
          </Text>
          <Text style={[styles.subtitle, { fontSize: fs(15) }]}>{subtitle}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Открыть «Ещё»" style={styles.avatar} onPress={onOpenMore}>
          <Text style={[styles.avatarText, { fontSize: fs(17) }]}>{initialsOf(session.user.fullName)}</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <AppIcon name="search" size={20} color={t.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Найти раздел или товар"
          placeholderTextColor="#8a8984"
          style={[styles.searchInput, { fontSize: fs(16) }]}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (matches[0]) onOpenSection(matches[0].key);
            else if (search.trim()) onSearchProducts(search.trim());
          }}
        />
      </View>

      {updateAvailable && (
        <View style={styles.banner}>
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { fontSize: fs(15) }]}>Доступно обновление</Text>
            <Text style={[styles.bannerSubtitle, { fontSize: fs(14) }]}>Новая версия приложения готова</Text>
          </View>
          <Pressable accessibilityRole="button" style={styles.bannerButton} onPress={onApplyUpdate}>
            <Text style={[styles.bannerButtonText, { fontSize: fs(15) }]}>Обновить</Text>
          </Pressable>
        </View>
      )}

      {summary.todayCount > 0 && (
        <View style={styles.banner}>
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { fontSize: fs(15) }]}>
              {summary.todayCount} {tasksWord(summary.todayCount)} на сегодня
            </Text>
            <Text style={[styles.bannerSubtitle, { fontSize: fs(14) }]}>{summary.firstLabel}</Text>
          </View>
          <Pressable accessibilityRole="button" style={styles.bannerButton} onPress={() => onOpenSection('tasks')}>
            <Text style={[styles.bannerButtonText, { fontSize: fs(15) }]}>Открыть</Text>
          </Pressable>
        </View>
      )}

      {normalizedSearch ? (
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { fontSize: fs(13) }]}>РЕЗУЛЬТАТЫ ПОИСКА</Text>
          {matches.length > 0 && <View style={styles.grid}>{matches.map(renderCard)}</View>}
          <Pressable style={styles.productSearch} onPress={() => onSearchProducts(search.trim())}>
            <AppIcon name="list" size={20} color={t.accent} />
            <Text style={[styles.productSearchText, { fontSize: fs(15) }]} numberOfLines={1}>
              Найти товар «{search.trim()}» в остатках
            </Text>
            <AppIcon name="chevronRight" size={20} color={t.muted} />
          </Pressable>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={[styles.groupTitle, { fontSize: fs(13) }]}>{group.title.toLocaleUpperCase('ru')}</Text>
            <View style={styles.grid}>{group.sections.map(renderCard)}</View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  headerText: { flex: 1 },
  greeting: { fontWeight: '800', color: t.text },
  subtitle: { marginTop: 2, color: t.muted, fontWeight: '500' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: t.accent, fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  searchInput: { flex: 1, color: t.text, paddingVertical: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.bannerBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerText: { flex: 1 },
  bannerTitle: { color: t.bannerText, fontWeight: '800' },
  bannerSubtitle: { color: t.bannerText, marginTop: 2 },
  bannerButton: { backgroundColor: t.bannerButton, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  bannerButtonText: { color: '#ffffff', fontWeight: '800' },
  group: { gap: 10 },
  groupTitle: { color: t.muted, fontWeight: '700', letterSpacing: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    maxWidth: '49%',
    minHeight: 110,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
    gap: 14,
  },
  cardPressed: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { minWidth: 26, borderRadius: 10, backgroundColor: t.badgeBg, paddingHorizontal: 7, paddingVertical: 2, alignItems: 'center' },
  badgeText: { color: t.badgeText, fontWeight: '800' },
  cardLabel: { color: t.text, fontWeight: '700' },
  productSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    padding: 16,
  },
  productSearchText: { flex: 1, color: t.text, fontWeight: '600' },
});
