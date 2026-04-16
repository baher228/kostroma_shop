import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { tasksApi } from '../api/tasks';
import { Session, Task, TaskStatus, Worker } from '../types/models';

type TasksPanelProps = {
  session: Session;
  fullHeight?: boolean;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Ошибка сервера.');

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusLabel = (status: TaskStatus) => (status === 'open' ? 'Открыта' : 'Выполнена');

export const TasksPanel = ({ session, fullHeight = false }: TasksPanelProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({});

  const canManage = session.user.role === 'manager';

  const setTaskPending = (taskId: string, value: boolean) => {
    setPendingTaskIds((current) => ({ ...current, [taskId]: value }));
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError('');
      if (canManage) {
        const [nextTasks, nextWorkers] = await Promise.all([tasksApi.list(session.token), tasksApi.listWorkers(session.token)]);
        setTasks(nextTasks);
        setWorkers(nextWorkers);
        setSelectedWorkerId((current) => current || nextWorkers[0]?.id || '');
      } else {
        const nextTasks = await tasksApi.list(session.token);
        setTasks(nextTasks);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [session.token, session.user.role]);

  const createTask = async () => {
    if (!canManage) {
      return;
    }
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError('Введите текст задачи.');
      return;
    }
    if (!selectedWorkerId) {
      setError('Выберите сотрудника.');
      return;
    }
    try {
      setSavingTask(true);
      const created = await tasksApi.create(session.token, normalizedTitle, selectedWorkerId);
      setTasks((current) => [created, ...current]);
      setTitle('');
      setError('');
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSavingTask(false);
    }
  };

  const setStatus = async (task: Task, nextStatus: TaskStatus) => {
    try {
      setTaskPending(task.id, true);
      const updated = await tasksApi.updateStatus(session.token, task.id, nextStatus);
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
      setError('');
    } catch (updateError) {
      setError(errorMessage(updateError));
      await loadTasks();
    } finally {
      setTaskPending(task.id, false);
    }
  };

  const removeTask = (task: Task) => {
    if (!canManage) {
      return;
    }
    Alert.alert('Удалить задачу?', 'Задача будет удалена без возможности восстановления.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            setTaskPending(task.id, true);
            await tasksApi.remove(session.token, task.id);
            setTasks((current) => current.filter((item) => item.id !== task.id));
            setError('');
          } catch (removeError) {
            setError(errorMessage(removeError));
          } finally {
            setTaskPending(task.id, false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.panel, fullHeight ? styles.panelFull : styles.panelCompact]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Задачи</Text>
        <Pressable style={styles.refreshButton} onPress={loadTasks}>
          <Text style={styles.refreshButtonText}>Обновить</Text>
        </Pressable>
      </View>

      {canManage && (
        <View style={styles.createBox}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            placeholder="Новая задача"
            placeholderTextColor="#7a8b7f"
            maxLength={240}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workerList}>
            {workers.map((worker) => {
              const active = selectedWorkerId === worker.id;
              return (
                <Pressable
                  key={worker.id}
                  style={[styles.workerChip, active && styles.workerChipActive]}
                  onPress={() => setSelectedWorkerId(worker.id)}
                >
                  <Text style={[styles.workerChipText, active && styles.workerChipTextActive]}>{worker.displayName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={[styles.createButton, savingTask && styles.createButtonDisabled]} onPress={createTask} disabled={savingTask}>
            <Text style={styles.createButtonText}>{savingTask ? 'Сохранение...' : 'Назначить задачу'}</Text>
          </Pressable>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#2f6f4f" />
        </View>
      ) : tasks.length === 0 ? (
        <Text style={styles.emptyText}>Список задач пуст.</Text>
      ) : (
        <ScrollView style={styles.tasksList} contentContainerStyle={styles.tasksListContent}>
          {tasks.map((task) => {
            const pending = pendingTaskIds[task.id];
            return (
              <View key={task.id} style={[styles.taskCard, pending && styles.taskCardPending]}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskMeta}>
                  {canManage ? `Исполнитель: ${task.assigneeDisplayName}` : `Поставил: ${task.createdByDisplayName}`} ·{' '}
                  {statusLabel(task.status)}
                </Text>
                <Text style={styles.taskDate}>Создана: {formatDate(task.createdAt)}</Text>
                <View style={styles.taskActions}>
                  {canManage ? (
                    <>
                      <Pressable
                        style={[styles.actionButton, styles.statusButton]}
                        onPress={() => setStatus(task, task.status === 'open' ? 'done' : 'open')}
                      >
                        <Text style={styles.actionButtonText}>
                          {task.status === 'open' ? 'Отметить выполненной' : 'Открыть снова'}
                        </Text>
                      </Pressable>
                      <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={() => removeTask(task)}>
                        <Text style={styles.actionButtonText}>Удалить</Text>
                      </Pressable>
                    </>
                  ) : task.status === 'open' ? (
                    <Pressable style={[styles.actionButton, styles.statusButton]} onPress={() => setStatus(task, 'done')}>
                      <Text style={styles.actionButtonText}>Выполнено</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.doneText}>Завершено</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#f3f7f3',
    padding: 12,
  },
  panelCompact: {
    marginBottom: 10,
    maxHeight: 310,
  },
  panelFull: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2f26',
  },
  refreshButton: {
    borderRadius: 10,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#294033',
    fontSize: 13,
    fontWeight: '700',
  },
  createBox: {
    gap: 8,
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2f26',
    fontWeight: '500',
  },
  workerList: {
    gap: 8,
    paddingVertical: 2,
  },
  workerChip: {
    borderRadius: 10,
    backgroundColor: '#edf3ee',
    borderWidth: 1,
    borderColor: '#c8d3ca',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  workerChipActive: {
    backgroundColor: '#2f6f4f',
    borderColor: '#2f6f4f',
  },
  workerChipText: {
    color: '#334b3d',
    fontWeight: '700',
    fontSize: 13,
  },
  workerChipTextActive: {
    color: '#ffffff',
  },
  createButton: {
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingVertical: 10,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  error: {
    color: '#af4234',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 6,
  },
  loadingBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#5d7163',
    fontWeight: '600',
    fontSize: 13,
  },
  tasksList: {
    flex: 1,
  },
  tasksListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  taskCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cfdbd1',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 4,
  },
  taskCardPending: {
    opacity: 0.7,
  },
  taskTitle: {
    color: '#1d2f24',
    fontSize: 15,
    fontWeight: '700',
  },
  taskMeta: {
    color: '#4c6153',
    fontSize: 12,
    fontWeight: '600',
  },
  taskDate: {
    color: '#64786b',
    fontSize: 12,
    fontWeight: '500',
  },
  taskActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  actionButton: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusButton: {
    backgroundColor: '#2f6f4f',
  },
  deleteButton: {
    backgroundColor: '#9f4038',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  doneText: {
    color: '#496050',
    fontSize: 12,
    fontWeight: '700',
  },
});
