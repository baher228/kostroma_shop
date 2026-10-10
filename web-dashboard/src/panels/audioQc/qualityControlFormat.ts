import type { AudioQcRecordingStatus, QcSessionStatus, QualityClass } from '../../types';

export const recordingStatusLabels: Record<AudioQcRecordingStatus, string> = {
  recording: 'Записывается', recorded: 'Ждёт отправки', waiting_network: 'Нет сети',
  creating_ml_session: 'Создание сессии', uploading_audio: 'Отправка аудио', audio_uploaded: 'Аудио отправлено',
  starting_processing: 'Запуск анализа', processing_started: 'AI обрабатывает', completed: 'Отправлено',
  failed_retryable: 'Повторная отправка', failed_permanent: 'Ошибка отправки',
};

export const qcStatusLabels: Record<QcSessionStatus, string> = {
  created: 'Сессия создана', queued: 'В очереди на расшифровку', transcribing: 'Расшифровывается',
  analysis_queued: 'В очереди на анализ', analyzing: 'AI анализирует', completed: 'Готово',
  transcription_failed: 'Ошибка расшифровки', analysis_failed: 'Ошибка анализа',
};

export const qualityLabels: Record<QualityClass, string> = { good: 'Хорошо', neutral: 'Нейтрально', bad: 'Плохо' };

export const criterionLabels = {
  greeting: 'Приветствие', politeness: 'Вежливость', needsDiscovery: 'Выявление потребностей',
  productKnowledge: 'Объяснение товара', objectionHandling: 'Работа с возражениями',
  closing: 'Завершение разговора', scriptCompliance: 'Соблюдение сценария',
} as const;

export const criterionStatusLabels = {
  good: 'Хорошо', neutral: 'Нейтрально', needs_improvement: 'Нужно улучшить', not_applicable: 'Не оценивалось',
} as const;
export const sentimentLabels = { positive: 'Положительное', neutral: 'Нейтральное', negative: 'Негативное', unknown: 'Не определено' } as const;
export const satisfactionLabels = { satisfied: 'Доволен', neutral: 'Нейтрально', dissatisfied: 'Недоволен', unknown: 'Не определено' } as const;
export const severityLabels = { low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Критическая' } as const;

export const formatDateTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' })
  : 'Нет данных';

export const formatDuration = (seconds: number | null) => {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds} сек`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const formatBytes = (bytes: number | null) => {
  if (bytes === null) return 'Нет данных';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

export const formatTimestamp = (seconds: number | null) => {
  if (seconds === null) return null;
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

export const displaySpeaker = (speaker: string, index: number) => {
  const match = speaker.match(/^speaker_(\d+)$/i);
  return match ? `Собеседник ${Number(match[1]) + 1}` : speaker.trim() || `Собеседник ${index + 1}`;
};
