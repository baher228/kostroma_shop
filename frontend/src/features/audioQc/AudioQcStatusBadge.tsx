import { StyleSheet, Text, View } from 'react-native';
import { audioQcModeLabels } from './audioQcPolicy';
import { AudioQcActivityStatus, AudioQcRecordingStatus } from './audioQcTypes';
import { useAudioQc } from './AudioQcProvider';

const activityLabels: Record<AudioQcActivityStatus, string> = {
  idle: 'ожидание',
  listening: 'ожидание речи',
  recording: 'запись',
  queued: 'очередь',
  uploading: 'отправка',
  error: 'ошибка',
};

const recordingStatusLabels: Partial<Record<AudioQcRecordingStatus, string>> = {
  recording: 'запись',
  recorded: 'в очереди',
  waiting_network: 'нет сети',
  creating_ml_session: 'создание ML session',
  uploading_audio: 'загрузка аудио',
  audio_uploaded: 'аудио загружено',
  starting_processing: 'запуск обработки',
  processing_started: 'обработка запущена',
  completed: 'готово',
  failed_retryable: 'ошибка, можно повторить',
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

export const AudioQcStatusBadge = () => {
  const { policy, currentRecording, activityStatus, queueSummary, lastError, vadState, deviceId } = useAudioQc();
  const latestStatus = currentRecording?.status ? recordingStatusLabels[currentRecording.status] : activityLabels[activityStatus];
  const isEnabled = Boolean(policy?.enabled);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Audio QC: {isEnabled ? 'активно' : 'выключено'}</Text>
          <Text style={styles.meta}>
            режим: {policy ? audioQcModeLabels[policy.mode] : '-'} · статус: {latestStatus}
          </Text>
        </View>
        <View style={[styles.dot, isEnabled ? styles.dotActive : styles.dotOff]} />
      </View>

      <View style={styles.metricsRow}>
        <Text style={styles.metric}>очередь: {queueSummary.queueSize}</Text>
        <Text style={styles.metric}>последняя отправка: {formatDateTime(queueSummary.lastUploadAt)}</Text>
        <Text style={styles.metric}>device: {deviceId ?? '-'}</Text>
      </View>

      {vadState.enabled && <Text style={styles.warning}>{vadState.message}</Text>}
      {!!lastError && <Text style={styles.error}>Ошибка: {lastError}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b9c8bd',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: '#1f2f26',
    fontSize: 15,
    fontWeight: '900',
  },
  meta: {
    marginTop: 2,
    color: '#4a5d50',
    fontSize: 12,
    fontWeight: '700',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotActive: {
    backgroundColor: '#2f8d55',
  },
  dotOff: {
    backgroundColor: '#9aa79d',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    color: '#354a3c',
    fontSize: 11,
    fontWeight: '800',
  },
  warning: {
    color: '#7b5a19',
    fontSize: 11,
    fontWeight: '700',
  },
  error: {
    color: '#af4234',
    fontSize: 12,
    fontWeight: '800',
  },
});
