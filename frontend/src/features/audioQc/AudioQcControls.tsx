import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioQc } from './AudioQcProvider';

const formatTimer = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

export const AudioQcControls = () => {
  const {
    elapsedSec,
    isRecording,
    isPaused,
    currentRecording,
    policy,
    vadStatus,
    lastError,
    isQueueProcessing,
    queueSummary,
    startManualRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    retryUpload,
  } = useAudioQc();
  const hasRetryableError = queueSummary.retryableFailures > 0;
  const isVadMode = policy?.mode === 'vad_auto';
  const isManualRecording = Boolean(currentRecording);

  const runSafely = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
    } catch (error) {
      Alert.alert(fallback, error instanceof Error ? error.message : 'Неизвестная ошибка.');
    }
  };

  const recordingLabel = isVadMode
    ? vadStatus.state === 'recording' || vadStatus.state === 'possible_end'
      ? 'Идёт запись сегмента'
      : vadStatus.state === 'finalizing'
        ? 'Сегмент сохраняется'
        : vadStatus.active
          ? 'Ожидание речи'
          : 'VAD неактивен'
    : isRecording
      ? isPaused
        ? 'Запись на паузе'
        : 'Идет запись'
      : 'Запись выключена';
  const pauseLabel = isPaused ? 'Продолжить' : 'Пауза';
  const queueStateLabel = isQueueProcessing
    ? 'Отправка идет'
    : queueSummary.queueSize > 0
      ? 'Отправится автоматически'
      : 'Очередь пустая';

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Запись разговора</Text>
          <Text style={styles.stateText}>{recordingLabel}</Text>
        </View>
        <Text style={styles.timerValue}>{formatTimer(elapsedSec)}</Text>
      </View>
      <View style={styles.actions}>
        {isVadMode ? (
          <View style={styles.vadPanel}>
            <Text style={styles.vadTitle}>{vadStatus.active ? 'VAD активен' : 'VAD остановлен'}</Text>
            <Text style={styles.queueText}>Состояние: {vadStatus.state}</Text>
            <Text style={styles.queueText}>Сегмент: {formatTimer(Math.round(vadStatus.currentSegmentDurationSec))}</Text>
            <Text style={styles.queueText}>
              Последний: {vadStatus.lastSegmentAt ? new Date(vadStatus.lastSegmentAt).toLocaleTimeString('ru-RU') : '-'}
            </Text>
          </View>
        ) : isManualRecording ? (
          <>
            <Pressable
              style={[styles.button, styles.stopButton]}
              onPress={() => void runSafely(stopRecording, 'Не удалось выключить запись')}
            >
              <Text style={styles.stopText}>Выключить запись</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.pauseButton]}
              onPress={() => void runSafely(isPaused ? resumeRecording : pauseRecording, 'Не удалось изменить паузу')}
            >
              <Text style={styles.pauseText}>{pauseLabel}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.button, styles.startButton]}
            onPress={() => void runSafely(startManualRecording, 'Не удалось начать запись')}
          >
            <Text style={styles.startText}>Включить запись</Text>
          </Pressable>
        )}
        {hasRetryableError && (
          <Pressable
            style={[styles.button, styles.retryButton, isQueueProcessing && styles.disabledButton]}
            onPress={() => void runSafely(retryUpload, 'Не удалось отправить запись')}
            disabled={isQueueProcessing}
          >
            <Text style={styles.retryText}>{isQueueProcessing ? 'Отправка...' : 'Повторить отправку'}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.queueRow}>
        <Text style={styles.queueText}>Ждет отправки: {queueSummary.queueSize}</Text>
        <Text style={styles.queueText}>{queueStateLabel}</Text>
        <Text style={styles.queueText}>Ошибки: {queueSummary.retryableFailures + queueSummary.permanentFailures}</Text>
      </View>
      {!!lastError && <Text style={styles.errorText}>Последняя ошибка: {lastError}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c3d0c5',
    backgroundColor: '#f7faf7',
    padding: 10,
    gap: 9,
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
  stateText: {
    marginTop: 2,
    color: '#445a4b',
    fontSize: 12,
    fontWeight: '700',
  },
  timerValue: {
    color: '#1f2f26',
    fontSize: 18,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vadPanel: {
    flex: 1,
    gap: 4,
    borderRadius: 8,
    backgroundColor: '#e7f2e9',
    padding: 9,
  },
  vadTitle: {
    color: '#215c40',
    fontSize: 13,
    fontWeight: '900',
  },
  button: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    backgroundColor: '#2f6f4f',
  },
  stopButton: {
    backgroundColor: '#a54338',
  },
  pauseButton: {
    backgroundColor: '#ead8a0',
  },
  retryButton: {
    backgroundColor: '#dbe4dc',
  },
  disabledButton: {
    opacity: 0.65,
  },
  startText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  stopText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  pauseText: {
    color: '#3e3312',
    fontSize: 13,
    fontWeight: '900',
  },
  retryText: {
    color: '#223529',
    fontSize: 13,
    fontWeight: '900',
  },
  queueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  queueText: {
    color: '#445a4b',
    fontSize: 12,
    fontWeight: '800',
  },
  errorText: {
    color: '#af4234',
    fontSize: 12,
    fontWeight: '800',
  },
});
