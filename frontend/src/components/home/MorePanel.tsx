import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Session } from '../../types/models';
import { AppIcon } from './AppIcon';
import { HomeSectionGroup, moveSection } from './sections';
import { HomeFontSize, homeTheme as t, initialsOf } from './theme';

type MorePanelProps = {
  session: Session;
  groups: HomeSectionGroup[];
  fontScale: number;
  fontSize: HomeFontSize;
  versionDetail: string | null;
  updateAvailable: boolean;
  checkingUpdate: boolean;
  onCheckUpdate: () => void;
  onChangeFontSize: (size: HomeFontSize) => void;
  onChangeSectionOrder: (order: string[]) => void;
  onOpenSupport: () => void;
  onLogout: () => void;
};

const ROLE_LABELS = { manager: 'Менеджер', worker: 'Продавец', store_tablet: 'Продавец' } as const;
const FONT_SIZE_LABELS: Record<HomeFontSize, string> = { normal: 'Обычный', large: 'Крупный' };

export const MorePanel = ({
  session,
  groups,
  fontScale,
  fontSize,
  versionDetail,
  updateAvailable,
  checkingUpdate,
  onCheckUpdate,
  onChangeFontSize,
  onChangeSectionOrder,
  onOpenSupport,
  onLogout,
}: MorePanelProps) => {
  const [orderOpen, setOrderOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const fs = (size: number) => Math.round(size * fontScale);
  const { user } = session;
  const profileDetails = [
    ROLE_LABELS[user.role],
    user.shopName,
    user.role === 'store_tablet' ? 'планшет магазина' : null,
  ].filter(Boolean).join(' · ');
  const versionStatus = updateAvailable ? 'доступно обновление' : 'актуальная';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { fontSize: fs(28) }]}>Ещё</Text>

      <View style={[styles.cardBlock, styles.profile]}>
        <View style={styles.avatar}>
          <Text style={[styles.avatarText, { fontSize: fs(19) }]}>{initialsOf(user.fullName)}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.profileName, { fontSize: fs(17) }]}>{user.fullName}</Text>
          {profileDetails ? <Text style={[styles.muted, { fontSize: fs(14) }]}>{profileDetails}</Text> : null}
        </View>
      </View>

      <View style={styles.cardBlock}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[styles.rowLabel, { fontSize: fs(16) }]}>Версия приложения</Text>
            <Text style={[styles.muted, { fontSize: fs(13) }]}>
              {versionDetail ? `${versionDetail} · ${versionStatus}` : versionStatus}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={[styles.outlineButton, checkingUpdate && styles.disabled]}
            disabled={checkingUpdate}
            onPress={onCheckUpdate}
          >
            <Text style={[styles.outlineButtonText, { fontSize: fs(15) }]}>{checkingUpdate ? 'Проверка...' : 'Проверить'}</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setOrderOpen(true)}>
          <Text style={[styles.rowLabel, styles.flex, { fontSize: fs(16) }]}>Порядок разделов на главной</Text>
          <AppIcon name="chevronRight" size={20} color={t.muted} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setFontOpen(true)}>
          <Text style={[styles.rowLabel, styles.flex, { fontSize: fs(16) }]}>Размер шрифта</Text>
          <Text style={[styles.muted, { fontSize: fs(15) }]}>{FONT_SIZE_LABELS[fontSize]}</Text>
          <AppIcon name="chevronRight" size={20} color={t.muted} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={onOpenSupport}>
          <Text style={[styles.rowLabel, styles.flex, { fontSize: fs(16) }]}>Поддержка</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" style={[styles.cardBlock, styles.row]} onPress={onLogout}>
        <AppIcon name="logOut" size={20} color={t.danger} />
        <Text style={[styles.logoutText, { fontSize: fs(16) }]}>Выйти из аккаунта</Text>
      </Pressable>

      <Text style={[styles.footnote, { fontSize: fs(13) }]}>
        Когда выйдет новая версия, на главной появится баннер «Доступно обновление» — отдельная кнопка больше не нужна.
      </Text>

      <Modal visible={orderOpen} transparent animationType="fade" onRequestClose={() => setOrderOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontSize: fs(19) }]}>Порядок разделов на главной</Text>
            <ScrollView style={styles.sheetBody}>
              {groups.map((group) => (
                <View key={group.key} style={styles.orderGroup}>
                  <Text style={[styles.groupTitle, { fontSize: fs(13) }]}>{group.title.toLocaleUpperCase('ru')}</Text>
                  {group.sections.map((section, index) => (
                    <View key={section.key} style={styles.orderRow}>
                      <AppIcon name={section.icon} size={22} color={t.accent} />
                      <Text style={[styles.rowLabel, styles.flex, { fontSize: fs(16) }]}>{section.label}</Text>
                      <Pressable
                        accessibilityLabel={`Поднять «${section.label}»`}
                        style={[styles.arrowButton, index === 0 && styles.disabled]}
                        disabled={index === 0}
                        onPress={() => onChangeSectionOrder(moveSection(groups, section.key, -1))}
                      >
                        <AppIcon name="chevronUp" size={20} color={t.text} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Опустить «${section.label}»`}
                        style={[styles.arrowButton, index === group.sections.length - 1 && styles.disabled]}
                        disabled={index === group.sections.length - 1}
                        onPress={() => onChangeSectionOrder(moveSection(groups, section.key, 1))}
                      >
                        <AppIcon name="chevronDown" size={20} color={t.text} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={styles.sheetActions}>
              <Pressable style={styles.outlineButton} onPress={() => onChangeSectionOrder([])}>
                <Text style={[styles.outlineButtonText, { fontSize: fs(15) }]}>Сбросить</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => setOrderOpen(false)}>
                <Text style={[styles.primaryButtonText, { fontSize: fs(15) }]}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={fontOpen} transparent animationType="fade" onRequestClose={() => setFontOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontSize: fs(19) }]}>Размер шрифта</Text>
            {(Object.keys(FONT_SIZE_LABELS) as HomeFontSize[]).map((size) => (
              <Pressable
                key={size}
                style={[styles.orderRow, size === fontSize && styles.optionActive]}
                onPress={() => {
                  onChangeFontSize(size);
                  setFontOpen(false);
                }}
              >
                <Text style={[styles.rowLabel, styles.flex, { fontSize: size === 'large' ? 19 : 16 }]}>{FONT_SIZE_LABELS[size]}</Text>
                {size === fontSize && <AppIcon name="squareCheck" size={20} color={t.accent} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: 14, paddingBottom: 24 },
  flex: { flex: 1 },
  title: { fontWeight: '800', color: t.text, paddingTop: 4 },
  cardBlock: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 16, overflow: 'hidden' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: t.accent, fontWeight: '800' },
  profileName: { color: t.text, fontWeight: '800' },
  muted: { color: t.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 16 },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowLabel: { color: t.text, fontWeight: '500' },
  outlineButton: { borderWidth: 1, borderColor: '#d6d3cc', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.card },
  outlineButtonText: { color: t.text, fontWeight: '600' },
  primaryButton: { backgroundColor: t.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.4 },
  logoutText: { color: t.danger, fontWeight: '700' },
  footnote: { color: t.muted, lineHeight: 20, paddingHorizontal: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 20, 18, 0.45)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: t.background, borderRadius: 18, padding: 18, gap: 10, maxHeight: '90%' },
  sheetTitle: { color: t.text, fontWeight: '800' },
  sheetBody: { flexGrow: 0 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  orderGroup: { gap: 6, marginBottom: 10 },
  groupTitle: { color: t.muted, fontWeight: '700', letterSpacing: 0.6 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionActive: { borderColor: t.accent },
  arrowButton: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
});
