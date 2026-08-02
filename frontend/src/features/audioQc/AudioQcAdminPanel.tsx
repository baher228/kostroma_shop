import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { createDefaultAudioQcPolicy, audioQcModeLabels } from './audioQcPolicy';
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

export const AudioQcAdminPanel = ({ shops, selectedShopId }: AudioQcAdminPanelProps) => {
  const { policies, isPolicyLoading, isPolicySaving, refreshPolicies, savePolicy, lastError } = useAudioQc();
  const [activeShopId, setActiveShopId] = useState<string | null>(selectedShopId ?? shops[0]?.id ?? null);
  const [draft, setDraft] = useState<AudioQcPolicy | null>(null);

  useEffect(() => {
    void refreshPolicies();
  }, [refreshPolicies]);

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

      {shops.length > 1 && (
        <View style={styles.shopRow}>
          {shops.map((shop) => {
            const active = shop.id === activeShopId;
            return (
              <Pressable
                key={shop.id}
                style={[styles.shopChip, active && styles.shopChipActive]}
                onPress={() => setActiveShopId(shop.id)}
              >
                <Text style={[styles.shopChipText, active && styles.shopChipTextActive]}>{shop.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.panel}>
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
});
