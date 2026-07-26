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
    isQueueProcessing,
    queueSummary,
    startManualRecording,
    stopRecording,
    retryUpload,
  } = useAudioQc();

  const runSafely = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
    } catch (error) {
      Alert.alert(fallback, error instanceof Error ? error.message : 'Неизвестная ошибка.');
    }
  };

  const retryLabel = queueSummary.retryableFailures > 0 || queueSummary.queueSize > 0 ? 'Повторить отправку' : 'Отправить сейчас';

  return (
    <View style={styles.wrap}>
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>Таймер</Text>
        <Text style={styles.timerValue}>{formatTimer(elapsedSec)}</Text>
      </View>
      <View style={styles.actions}>
        {isRecording ? (
          <Pressable style={[styles.button, styles.stopButton]} onPress={() => void runSafely(stopRecording, 'Не удалось остановить запись')}>
            <Text style={styles.stopText}>Остановить запись</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.startButton]}
            onPress={() => void runSafely(startManualRecording, 'Не удалось начать запись')}
          >
            <Text style={styles.startText}>Начать запись</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.button, styles.retryButton, isQueueProcessing && styles.disabledButton]}
          onPress={() => void runSafely(retryUpload, 'Не удалось отправить запись')}
          disabled={isQueueProcessing}
        >
          <Text style={styles.retryText}>{isQueueProcessing ? 'Отправка...' : retryLabel}</Text>
        </Pressable>
      </View>
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
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerLabel: {
    color: '#445a4b',
    fontSize: 12,
    fontWeight: '800',
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
  retryText: {
    color: '#223529',
    fontSize: 13,
    fontWeight: '900',
  },
});
