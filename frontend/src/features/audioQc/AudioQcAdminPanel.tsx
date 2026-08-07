import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { createDefaultAudioQcPolicy, audioQcModeLabels, audioQcModes } from './audioQcPolicy';
import { AudioQcAdminPanelProps, AudioQcPolicy } from './audioQcTypes';
import { useAudioQc } from './AudioQcProvider';

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const numberPatch = (
  current: AudioQcPolicy | null,
  key: 'maxSegmentDurationSec' | 'silenceToStopSec' | 'preRollSec',
  delta: number,
): AudioQcPolicy | null => {
  if (!current) return current;
  const bounds = {
    maxSegmentDurationSec: { min: 30, max: 1800 },
    silenceToStopSec: { min: 1, max: 30 },
    preRollSec: { min: 0, max: 30 },
  }[key];
  return { ...current, [key]: Math.max(bounds.min, Math.min(bounds.max, current[key] + delta)) };
};

export const AudioQcAdminPanel = ({ shops, selectedShopId }: AudioQcAdminPanelProps) => {
  const {
    policies,
    managedRecordings,
    isPolicyLoading,
    isPolicySaving,
    isManagedRecordingsLoading,
    refreshPolicies,
    refreshManagedRecordings,
    savePolicy,
    lastError,
  } = useAudioQc();
  const [activeShopId, setActiveShopId] = useState<string | null>(selectedShopId ?? shops[0]?.id ?? null);
  const [draft, setDraft] = useState<AudioQcPolicy | null>(null);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    void refreshPolicies();
  }, [refreshPolicies]);

  useEffect(() => {
    if (activeShopId) void refreshManagedRecordings(activeShopId);
  }, [activeShopId, refreshManagedRecordings]);

  useEffect(() => {
    if (!activeShopId && (selectedShopId || shops[0]?.id)) {
      setActiveShopId(selectedShopId ?? shops[0]?.id ?? null);
    }
  }, [activeShopId, selectedShopId, shops]);

  const activePolicy = useMemo(() => {
    if (!activeShopId) return null;
    return policies.find((policy) => policy.shopId === activeShopId) ?? {
      ...createDefaultAudioQcPolicy(activeShopId),
      heartbeat: null,
    };
  }, [activeShopId, policies]);

  useEffect(() => {
    if (!activePolicy) {
      setDraft(null);
      return;
    }
    setDraft({
      enabled: activePolicy.enabled,
      mode: activePolicy.mode,
      shopId: activePolicy.shopId,
      targetRole: 'store_tablet',
      maxSegmentDurationSec: activePolicy.maxSegmentDurationSec,
      silenceToStopSec: activePolicy.silenceToStopSec,
      preRollSec: activePolicy.preRollSec,
      uploadImmediately: activePolicy.uploadImmediately,
      updatedAt: activePolicy.updatedAt,
    });
  }, [
    activePolicy?.enabled,
    activePolicy?.maxSegmentDurationSec,
    activePolicy?.mode,
    activePolicy?.preRollSec,
    activePolicy?.shopId,
    activePolicy?.silenceToStopSec,
    activePolicy?.updatedAt,
    activePolicy?.uploadImmediately,
  ]);

  const activeShopName = shops.find((shop) => shop.id === activeShopId)?.name ?? activeShopId ?? '-';
  const heartbeat = activePolicy?.heartbeat ?? null;
  const heartbeatMode = heartbeat?.currentMode ? audioQcModeLabels[heartbeat.currentMode] : '-';

  const onSave = async () => {
    if (!draft) return;
    try {
      await savePolicy(draft.shopId, draft);
      Alert.alert('AI-контроль', 'Настройки записи применены.');
    } catch (error) {
      Alert.alert('Не удалось применить настройки', error instanceof Error ? error.message : 'Неизвестная ошибка.');
    }
  };

  if (!activeShopId || !draft) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>AI-контроль</Text>
        <Text style={styles.emptyText}>Нет доступного магазина для настройки.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>AI-контроль записи</Text>
          <Text style={styles.subtitle}>Магазин: {activeShopName}</Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={() => void refreshPolicies()} disabled={isPolicyLoading}>
          <Text style={styles.secondaryButtonText}>{isPolicyLoading ? 'Загрузка...' : 'Обновить'}</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.shopPickerWrap}>
          <Text style={styles.stepperLabel}>Магазин для записи</Text>
          <Pressable
            style={styles.shopPickerButton}
            onPress={() => setShopPickerOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: shopPickerOpen }}
          >
            <Text style={styles.shopPickerButtonText}>{activeShopName}</Text>
            <Text style={styles.shopPickerChevron}>{shopPickerOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {shopPickerOpen && (
            <View style={styles.shopPickerMenu}>
              {shops.map((shop) => (
                <Pressable
                  key={shop.id}
                  style={[styles.shopPickerOption, shop.id === activeShopId && styles.shopPickerOptionActive]}
                  onPress={() => {
                    setActiveShopId(shop.id);
                    setShopPickerOpen(false);
                  }}
                >
                  <Text style={[styles.shopPickerOptionText, shop.id === activeShopId && styles.shopPickerOptionTextActive]}>
                    {shop.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={styles.sectionTitle}>Планшет</Text>
          <Text style={styles.sectionMeta}>
            {heartbeat?.deviceId ? `Выбран планшет ${heartbeat.deviceId}` : 'Планшет пока не прислал диагностический сигнал'}
          </Text>
        </View>

        <View style={styles.switchRow}>
          <View>
            <Text style={styles.sectionTitle}>Запись</Text>
            <Text style={styles.sectionMeta}>{draft.enabled ? 'включена' : 'выключена'}</Text>
          </View>
          <Switch
            value={draft.enabled}
            onValueChange={(enabled) => setDraft((current) => (current ? { ...current, enabled } : current))}
            trackColor={{ false: '#c5d0c7', true: '#8bc79b' }}
            thumbColor={draft.enabled ? '#2f6f4f' : '#f4f4f4'}
          />
        </View>

        <View style={styles.modeRow}>
          {audioQcModes.map((mode) => {
            const active = draft.mode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.modeButton, active && styles.modeButtonActive]}
                onPress={() => setDraft((current) => (current ? { ...current, mode } : current))}
              >
                <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{audioQcModeLabels[mode]}</Text>
              </Pressable>
            );
          })}
        </View>

        {draft.mode === 'vad_auto' && (
          <View style={styles.stepperGrid}>
            {([
              ['maxSegmentDurationSec', 'Максимальная длина', 30, 'с'],
              ['silenceToStopSec', 'Тишина до остановки', 1, 'с'],
              ['preRollSec', 'Запас перед речью', 1, 'с'],
            ] as const).map(([key, label, step, suffix]) => (
              <View key={key} style={styles.stepper}>
                <Text style={styles.stepperLabel}>{label}</Text>
                <View style={styles.stepperControls}>
                  <Pressable style={styles.stepperButton} onPress={() => setDraft((current) => numberPatch(current, key, -step))}>
                    <Text style={styles.stepperButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.stepperValue}>{draft[key]} {suffix}</Text>
                  <Pressable style={styles.stepperButton} onPress={() => setDraft((current) => numberPatch(current, key, step))}>
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.switchRow}>
          <View>
            <Text style={styles.sectionTitle}>Отправка</Text>
            <Text style={styles.sectionMeta}>{draft.uploadImmediately ? 'сразу после записи' : 'только вручную'}</Text>
          </View>
          <Switch
            value={draft.uploadImmediately}
            onValueChange={(uploadImmediately) => setDraft((current) => (current ? { ...current, uploadImmediately } : current))}
            trackColor={{ false: '#c5d0c7', true: '#8bc79b' }}
            thumbColor={draft.uploadImmediately ? '#2f6f4f' : '#f4f4f4'}
          />
        </View>

        <Pressable style={[styles.saveButton, isPolicySaving && styles.disabledButton]} onPress={() => void onSave()} disabled={isPolicySaving}>
          <Text style={styles.saveButtonText}>{isPolicySaving ? 'Применяем...' : 'Применить настройки'}</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Диагностика планшета</Text>
        <Text style={styles.sectionMeta}>Тестовый блок. Ручная запись работает независимо от этого сигнала.</Text>
        <View style={styles.heartbeatGrid}>
          <Text style={styles.heartbeatItem}>Планшет: {heartbeat?.deviceId ?? '-'}</Text>
          <Text style={styles.heartbeatItem}>Статус: {heartbeat?.online ? 'онлайн' : 'офлайн'}</Text>
          <Text style={styles.heartbeatItem}>Последний сигнал: {formatDateTime(heartbeat?.lastSeenAt)}</Text>
          <Text style={styles.heartbeatItem}>Режим: {heartbeatMode}</Text>
          <Text style={styles.heartbeatItem}>Очередь: {heartbeat?.queueSize ?? 0}</Text>
          <Text style={styles.heartbeatItem}>Последняя отправка: {formatDateTime(heartbeat?.lastUploadAt)}</Text>
          <Text style={styles.heartbeatItem}>Сейчас пишет: {heartbeat?.isRecording ? 'да' : 'нет'}</Text>
          <Text style={styles.heartbeatItem}>Ошибка: {heartbeat?.lastError ?? '-'}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Pressable
          style={styles.historyHeader}
          onPress={() => setHistoryExpanded((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: historyExpanded }}
        >
          <View>
            <Text style={styles.sectionTitle}>История записей</Text>
            <Text style={styles.sectionMeta}>{activeShopName} · {managedRecordings.length}</Text>
          </View>
          <Text style={styles.shopPickerChevron}>{historyExpanded ? '▲' : '▼'}</Text>
        </Pressable>
        {historyExpanded && (
          isManagedRecordingsLoading ? (
            <Text style={styles.sectionMeta}>Загрузка истории...</Text>
          ) : managedRecordings.length === 0 ? (
            <Text style={styles.sectionMeta}>Для этого магазина записей пока нет.</Text>
          ) : (
            <View style={styles.historyList}>
              {managedRecordings.slice(0, 30).map((recording) => (
                <View key={recording.localRecordingId} style={styles.historyItem}>
                  <Text style={styles.historyTitle}>{activeShopName} · {formatDateTime(recording.startedAt)}</Text>
                  <Text style={styles.sectionMeta}>
                    {audioQcModeLabels[recording.recordingMode]} · {recording.durationSec ?? '-'} сек · {recording.status}
                  </Text>
                  {!!recording.lastError && <Text style={styles.error}>{recording.lastError}</Text>}
                </View>
              ))}
            </View>
          )
        )}
      </View>

      {!!lastError && <Text style={styles.error}>Ошибка: {lastError}</Text>}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 12,
  },
  empty: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c3d0c5',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  emptyTitle: {
    color: '#1f2f26',
    fontSize: 22,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: 6,
    color: '#506358',
    fontSize: 14,
    fontWeight: '700',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: '#1f2f26',
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 3,
    color: '#4c5f53',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 8,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#223529',
    fontSize: 13,
    fontWeight: '900',
  },
  shopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shopPickerWrap: {
    gap: 6,
  },
  shopPickerButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c5d0c7',
    backgroundColor: '#f7faf7',
    paddingHorizontal: 12,
  },
  shopPickerButtonText: {
    color: '#1f2f26',
    fontSize: 14,
    fontWeight: '900',
  },
  shopPickerChevron: {
    color: '#506358',
    fontSize: 11,
    fontWeight: '900',
  },
  shopPickerMenu: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c5d0c7',
    overflow: 'hidden',
  },
  shopPickerOption: {
    minHeight: 42,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8e3',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
  },
  shopPickerOptionActive: {
    backgroundColor: '#e7f2e9',
  },
  shopPickerOptionText: {
    color: '#334b3d',
    fontSize: 13,
    fontWeight: '800',
  },
  shopPickerOptionTextActive: {
    color: '#1f4f37',
  },
  shopChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8d3ca',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shopChipActive: {
    backgroundColor: '#1f4f37',
    borderColor: '#1f4f37',
  },
  shopChipText: {
    color: '#334b3d',
    fontSize: 12,
    fontWeight: '800',
  },
  shopChipTextActive: {
    color: '#ffffff',
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b9c8bd',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: '#1f2f26',
    fontSize: 15,
    fontWeight: '900',
  },
  sectionMeta: {
    marginTop: 2,
    color: '#526459',
    fontSize: 12,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c5d0c7',
    backgroundColor: '#f3f7f3',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2f6f4f',
    borderColor: '#2f6f4f',
  },
  modeButtonText: {
    color: '#334b3d',
    fontSize: 12,
    fontWeight: '900',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  stepperGrid: {
    gap: 10,
  },
  stepper: {
    gap: 6,
  },
  stepperLabel: {
    color: '#445a4b',
    fontSize: 12,
    fontWeight: '800',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#dbe4dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: '#223529',
    fontSize: 20,
    fontWeight: '900',
  },
  stepperValue: {
    minWidth: 80,
    color: '#1f2f26',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  saveButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#2f6f4f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.65,
  },
  heartbeatGrid: {
    gap: 6,
  },
  heartbeatItem: {
    color: '#3c5044',
    fontSize: 12,
    fontWeight: '800',
  },
  error: {
    color: '#af4234',
    fontSize: 13,
    fontWeight: '800',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7e0d9',
    backgroundColor: '#f7faf7',
    padding: 9,
    gap: 3,
  },
  historyTitle: {
    color: '#1f2f26',
    fontSize: 13,
    fontWeight: '900',
  },
});
