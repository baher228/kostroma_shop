import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { audioQcModeLabels } from './audioQcPolicy';
import { useAudioQc } from './AudioQcProvider';
import { AudioQcRecording } from './audioQcTypes';

const statusLabels: Record<AudioQcRecording['status'], string> = {
  recording: 'записывается',
  recorded: 'ждет отправки',
  waiting_network: 'нет сети',
  creating_ml_session: 'создание ML-сессии',
  uploading_audio: 'отправка аудио',
  audio_uploaded: 'аудио отправлено',
  starting_processing: 'запуск AI',
  processing_started: 'AI обрабатывает',
  completed: 'готово',
  failed_retryable: 'ошибка, повторим',
  failed_permanent: 'ошибка',
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '-';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} мин ${rest} сек` : `${rest} сек`;
};

const formatSize = (bytes: number | null): string => {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

export const AudioQcRecordingsList = () => {
  const { recordings } = useAudioQc();
  const [expanded, setExpanded] = useState(false);
  const visibleRecordings = recordings.slice(0, 6);
  const hiddenCount = Math.max(0, recordings.length - visibleRecordings.length);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.headerRow}
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="История записей"
      >
        <Text style={styles.title}>История записей</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.count}>{recordings.length}</Text>
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      {expanded && (visibleRecordings.length === 0 ? (
        <Text style={styles.empty}>Фрагменты появятся здесь после остановки записи.</Text>
      ) : (
        <View style={styles.list}>
          {visibleRecordings.map((recording) => (
            <View key={recording.localRecordingId} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>Фрагмент {recording.localRecordingId.slice(-6)}</Text>
                <Text style={styles.status}>{statusLabels[recording.status]}</Text>
              </View>
              <Text style={styles.meta}>
                {formatDateTime(recording.startedAt)} · {formatDuration(recording.durationSec)} · {audioQcModeLabels[recording.recordingMode]}
              </Text>
              <Text style={styles.meta}>Файл: {formatSize(recording.fileSizeBytes)}</Text>
              {!!recording.mlSessionId && <Text style={styles.meta}>ML: {recording.mlSessionId.slice(0, 8)}</Text>}
              {!!recording.lastError && <Text style={styles.error}>Ошибка: {recording.lastError}</Text>}
            </View>
          ))}
          {hiddenCount > 0 && <Text style={styles.more}>Еще фрагментов: {hiddenCount}</Text>}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c3d0c5',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevron: {
    color: '#506358',
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: '#1f2f26',
    fontSize: 15,
    fontWeight: '900',
  },
  count: {
    minWidth: 28,
    borderRadius: 8,
    backgroundColor: '#dbe4dc',
    color: '#223529',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
  },
  empty: {
    color: '#506358',
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    gap: 8,
  },
  item: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7e0d9',
    backgroundColor: '#f7faf7',
    padding: 9,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    color: '#1f2f26',
    fontSize: 13,
    fontWeight: '900',
  },
  status: {
    color: '#2f6f4f',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  meta: {
    color: '#445a4b',
    fontSize: 11,
    fontWeight: '700',
  },
  error: {
    color: '#af4234',
    fontSize: 11,
    fontWeight: '800',
  },
  more: {
    color: '#506358',
    fontSize: 12,
    fontWeight: '800',
  },
});
