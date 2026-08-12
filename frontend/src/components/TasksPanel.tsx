import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { tasksApi } from "../api/tasks";
import { Session, Task, TaskStatus, Worker } from "../types/models";

type TasksPanelProps = {
  session: Session;
  fullHeight?: boolean;
  onTasksViewed?: (tasks: Task[]) => void;
};

type CalendarCell = {
  key: string;
  day: number;
  inCurrentMonth: boolean;
};

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Ошибка сервера.";

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const statusLabel = (status: TaskStatus) =>
  status === "open" ? "Открыта" : "Выполнена";

const monthTitle = (date: Date) =>
  date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

const buildCalendarCells = (monthCursor: Date): CalendarCell[] => {
  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(
    monthCursor.getFullYear(),
    monthCursor.getMonth(),
    1 - firstWeekday,
  );
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    return {
      key: toDateKey(current),
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === monthCursor.getMonth(),
    };
  });
};

const buildDeadlineIso = (dateKey: string | null, time: string) => {
  if (!dateKey) {
    return null;
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localDate = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
  if (Number.isNaN(localDate.valueOf())) {
    return null;
  }
  return localDate.toISOString();
};

export const TasksPanel = ({ session, fullHeight = false, onTasksViewed }: TasksPanelProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<string | null>(null);
  const [pendingDeadlineDate, setPendingDeadlineDate] = useState<string | null>(null);
  const [deadlineTime, setDeadlineTime] = useState("09:00");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() => new Date());
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [requiresPhotoConfirmation, setRequiresPhotoConfirmation] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({});

  const canManage = session.user.role === "manager";

  const calendarCells = useMemo(
    () => buildCalendarCells(calendarMonthCursor),
    [calendarMonthCursor],
  );

  const selectedWorkerName =
    workers.find((worker) => worker.id === selectedWorkerId)?.fullName ??
    "Выберите сотрудника";

  const setTaskPending = (taskId: string, value: boolean) => {
    setPendingTaskIds((current) => ({ ...current, [taskId]: value }));
  };

  const closeSelectors = () => {
    setShowAssigneeDropdown(false);
    setShowTimeDropdown(false);
    setShowCalendar(false);
    setPendingDeadlineDate(null);
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError("");
      if (canManage) {
        const [nextTasks, nextWorkers] = await Promise.all([
          tasksApi.list(session.token),
          tasksApi.listWorkers(session.token),
        ]);
        setTasks(nextTasks);
        setWorkers(nextWorkers);
        setSelectedWorkerId((current) => current || nextWorkers[0]?.id || "");
      } else {
        const nextTasks = await tasksApi.list(session.token);
        setTasks(nextTasks);
        onTasksViewed?.(nextTasks);
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
    if (!canManage || savingTask) {
      return;
    }
    const normalizedTitle = title.trim();
    if (normalizedTitle.length < 2) {
      setError("Введите текст задачи.");
      return;
    }
    if (!selectedWorkerId) {
      setError("Выберите сотрудника.");
      return;
    }
    try {
      setSavingTask(true);
      const created = await tasksApi.create(
        session.token,
        normalizedTitle,
        selectedWorkerId,
        buildDeadlineIso(deadlineDate, deadlineTime),
        requiresPhotoConfirmation,
      );
      setTasks((current) => [created, ...current]);
      setTitle("");
      setDeadlineDate(null);
      setDeadlineTime("09:00");
      setRequiresPhotoConfirmation(false);
      closeSelectors();
      setError("");
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
      setError("");
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
    Alert.alert(
      "Удалить задачу?",
      "Задача будет удалена без возможности восстановления.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            try {
              setTaskPending(task.id, true);
              await tasksApi.remove(session.token, task.id);
              setTasks((current) => current.filter((item) => item.id !== task.id));
              setError("");
            } catch (removeError) {
              setError(errorMessage(removeError));
            } finally {
              setTaskPending(task.id, false);
            }
          },
        },
      ],
    );
  };

  const renderCreateControls = () => (
    <View style={styles.createBox}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={styles.titleInput}
        placeholder="Новая задача"
        placeholderTextColor="#7a8b7f"
        maxLength={240}
      />

      <View style={styles.selectorGroup}>
        <Text style={styles.selectorLabel}>Исполнитель</Text>
        <Pressable
          style={styles.dropdownTrigger}
          onPress={() => {
            setShowAssigneeDropdown((current) => !current);
            setShowCalendar(false);
            setShowTimeDropdown(false);
          }}
        >
          <Text style={styles.dropdownText}>{selectedWorkerName}</Text>
          <Text style={styles.dropdownArrow}>{showAssigneeDropdown ? "▲" : "▼"}</Text>
        </Pressable>
        {showAssigneeDropdown && (
          <View style={styles.dropdownMenu}>
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {workers.map((worker) => {
                const active = worker.id === selectedWorkerId;
                return (
                  <Pressable
                    key={worker.id}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedWorkerId(worker.id);
                      setShowAssigneeDropdown(false);
                    }}
                  >
                    <Text
                      style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}
                    >
                      {worker.fullName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.selectorRow}>
        <View style={[styles.selectorGroup, styles.selectorHalf]}>
          <Text style={styles.selectorLabel}>Дата дедлайна</Text>
          <Pressable
            style={styles.dropdownTrigger}
            onPress={() => {
              setShowCalendar((current) => {
                const next = !current;
                if (next) {
                  setPendingDeadlineDate(deadlineDate);
                } else {
                  setPendingDeadlineDate(null);
                }
                return next;
              });
              setShowAssigneeDropdown(false);
              setShowTimeDropdown(false);
            }}
          >
            <Text style={styles.dropdownText}>
              {deadlineDate ? formatDateKey(deadlineDate) : "Без дедлайна"}
            </Text>
            <Text style={styles.dropdownArrow}>{showCalendar ? "▲" : "▼"}</Text>
          </Pressable>
        </View>
        <View style={[styles.selectorGroup, styles.selectorHalf]}>
          <Text style={styles.selectorLabel}>Время</Text>
          <Pressable
            style={styles.dropdownTrigger}
            onPress={() => {
              setShowTimeDropdown((current) => !current);
              setShowAssigneeDropdown(false);
              setShowCalendar(false);
            }}
          >
            <Text style={styles.dropdownText}>{deadlineTime}</Text>
            <Text style={styles.dropdownArrow}>{showTimeDropdown ? "▲" : "▼"}</Text>
          </Pressable>
        </View>
      </View>

      {showCalendar && (
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable
              style={styles.calendarNavButton}
              onPress={() =>
                setCalendarMonthCursor(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
            >
              <Text style={styles.calendarNavButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.calendarMonthTitle}>{monthTitle(calendarMonthCursor)}</Text>
            <Pressable
              style={styles.calendarNavButton}
              onPress={() =>
                setCalendarMonthCursor(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
            >
              <Text style={styles.calendarNavButtonText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.calendarWeekdays}>
            {weekdayLabels.map((label) => (
              <Text key={label} style={styles.calendarWeekdayText}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarCells.map((cell) => {
              const selected = cell.key === pendingDeadlineDate;
              return (
                <Pressable
                  key={cell.key}
                  style={[
                    styles.calendarCell,
                    selected && styles.calendarCellSelected,
                    !cell.inCurrentMonth && styles.calendarCellDimmed,
                  ]}
                  onPress={() => {
                    setPendingDeadlineDate(cell.key);
                  }}
                >
                  <Text
                    style={[
                      styles.calendarCellText,
                      selected && styles.calendarCellTextSelected,
                      !cell.inCurrentMonth && styles.calendarCellTextDimmed,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.calendarActions}>
            <Pressable
              style={styles.calendarClearButton}
              onPress={() => {
                setPendingDeadlineDate(null);
              }}
            >
              <Text style={styles.calendarClearButtonText}>Очистить</Text>
            </Pressable>
            <Pressable
              style={styles.calendarConfirmButton}
              onPress={() => {
                setDeadlineDate(pendingDeadlineDate);
                setShowCalendar(false);
                setPendingDeadlineDate(null);
              }}
            >
              <Text style={styles.calendarConfirmButtonText}>Подтвердить</Text>
            </Pressable>
          </View>
        </View>
      )}

      {showTimeDropdown && (
        <View style={styles.dropdownMenu}>
          <ScrollView style={styles.timeMenuScroll} nestedScrollEnabled>
            {timeOptions.map((time) => {
              const active = time === deadlineTime;
              return (
                <Pressable
                  key={time}
                  style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  onPress={() => {
                    setDeadlineTime(time);
                    setShowTimeDropdown(false);
                  }}
                >
                  <Text
                    style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}
                  >
                    {time}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Pressable
        style={[styles.workerChip, requiresPhotoConfirmation && styles.workerChipActive]}
        onPress={() => setRequiresPhotoConfirmation((current) => !current)}
      >
        <Text
          style={[
            styles.workerChipText,
            requiresPhotoConfirmation && styles.workerChipTextActive,
          ]}
        >
          Фото-подтверждение{" "}
          {requiresPhotoConfirmation ? "обязательно" : "необязательно"}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.createButton, savingTask && styles.createButtonDisabled]}
        onPress={createTask}
        disabled={savingTask}
      >
        <Text style={styles.createButtonText}>
          {savingTask ? "Сохранение..." : "Назначить задачу"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.panel, fullHeight ? styles.panelFull : styles.panelCompact]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Задачи</Text>
        <Pressable
          style={styles.refreshButton}
          onPress={() => {
            closeSelectors();
            loadTasks();
          }}
        >
          <Text style={styles.refreshButtonText}>Обновить</Text>
        </Pressable>
      </View>

      {canManage && renderCreateControls()}

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
                  {canManage
                    ? `Исполнитель: ${task.assigneeDisplayName}`
                    : `Поставил: ${task.createdByDisplayName}`}{" "}
                  · {statusLabel(task.status)}
                </Text>
                <Text style={styles.taskDate}>Создана: {formatDate(task.createdAt)}</Text>
                {!!task.deadlineAt && (
                  <Text style={styles.taskDate}>Дедлайн: {formatDate(task.deadlineAt)}</Text>
                )}
                {!!task.completedAt && (
                  <Text style={styles.taskDate}>Выполнена: {formatDate(task.completedAt)}</Text>
                )}
                {task.overdue && <Text style={styles.error}>Просрочена</Text>}
                {task.requiresPhotoConfirmation && (
                  <Text style={styles.taskMeta}>Требуется фото-подтверждение</Text>
                )}
                <View style={styles.taskActions}>
                  {canManage ? (
                    <>
                      <Pressable
                        style={[styles.actionButton, styles.statusButton]}
                        onPress={() => setStatus(task, task.status === "open" ? "done" : "open")}
                      >
                        <Text style={styles.actionButtonText}>
                          {task.status === "open"
                            ? "Отметить выполненной"
                            : "Открыть снова"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => removeTask(task)}
                      >
                        <Text style={styles.actionButtonText}>Удалить</Text>
                      </Pressable>
                    </>
                  ) : task.status === "open" ? (
                    <Pressable
                      style={[styles.actionButton, styles.statusButton]}
                      onPress={() => setStatus(task, "done")}
                    >
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
    borderColor: "#b7c5b8",
    backgroundColor: "#f3f7f3",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1f2f26",
  },
  refreshButton: {
    borderRadius: 12,
    backgroundColor: "#dbe4dc",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: "#294033",
    fontSize: 13,
    fontWeight: "700",
  },
  createBox: {
    gap: 8,
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c6d3c8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2f26",
    fontWeight: "500",
  },
  selectorGroup: {
    gap: 6,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectorHalf: {
    flex: 1,
  },
  selectorLabel: {
    color: "#405649",
    fontSize: 12,
    fontWeight: "700",
  },
  dropdownTrigger: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c6d3c8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dropdownText: {
    color: "#1f2f26",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  dropdownArrow: {
    color: "#5f7467",
    fontSize: 12,
    fontWeight: "700",
  },
  dropdownMenu: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7d4c9",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  timeMenuScroll: {
    maxHeight: 210,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2ed",
  },
  dropdownItemActive: {
    backgroundColor: "#2f6f4f",
  },
  dropdownItemText: {
    color: "#2f4437",
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownItemTextActive: {
    color: "#ffffff",
  },
  calendarCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7d4c9",
    backgroundColor: "#ffffff",
    padding: 10,
    gap: 8,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarNavButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c8d3ca",
    backgroundColor: "#eff4ef",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarNavButtonText: {
    color: "#3b5244",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  calendarMonthTitle: {
    color: "#223529",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  calendarWeekdays: {
    flexDirection: "row",
  },
  calendarWeekdayText: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#6a7d71",
    fontSize: 11,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginBottom: 2,
  },
  calendarCellSelected: {
    backgroundColor: "#2f6f4f",
    borderWidth: 1,
    borderColor: "#245a40",
  },
  calendarCellDimmed: {
    opacity: 0.35,
  },
  calendarCellText: {
    color: "#284034",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 14,
  },
  calendarCellTextSelected: {
    color: "#ffffff",
  },
  calendarCellTextDimmed: {
    color: "#8ea095",
  },
  calendarActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calendarClearButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarConfirmButton: {
    borderRadius: 8,
    backgroundColor: "#2f6f4f",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarClearButtonText: {
    color: "#9f4038",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarConfirmButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  workerChip: {
    borderRadius: 12,
    backgroundColor: "#edf3ee",
    borderWidth: 1,
    borderColor: "#c8d3ca",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  workerChipActive: {
    backgroundColor: "#2f6f4f",
    borderColor: "#2f6f4f",
  },
  workerChipText: {
    color: "#334b3d",
    fontWeight: "700",
    fontSize: 13,
  },
  workerChipTextActive: {
    color: "#ffffff",
  },
  createButton: {
    borderRadius: 12,
    backgroundColor: "#2f6f4f",
    paddingVertical: 12,
    alignItems: "center",
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  error: {
    color: "#af4234",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 6,
  },
  loadingBox: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyText: {
    color: "#5d7163",
    fontWeight: "600",
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
    borderColor: "#cfdbd1",
    backgroundColor: "#ffffff",
    padding: 10,
    gap: 4,
  },
  taskCardPending: {
    opacity: 0.7,
  },
  taskTitle: {
    color: "#1d2f24",
    fontSize: 15,
    fontWeight: "700",
  },
  taskMeta: {
    color: "#4c6153",
    fontSize: 12,
    fontWeight: "600",
  },
  taskDate: {
    color: "#64786b",
    fontSize: 12,
    fontWeight: "500",
  },
  taskActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    alignItems: "center",
  },
  actionButton: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  statusButton: {
    backgroundColor: "#2f6f4f",
  },
  deleteButton: {
    backgroundColor: "#9f4038",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  doneText: {
    color: "#496050",
    fontSize: 12,
    fontWeight: "700",
  },
});
