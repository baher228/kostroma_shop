import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { tasksApi } from "../api/tasks";
import { ruApiUrl } from "../api/http";
import { Session, StoreTablet, Task, TaskStatus } from "../types/models";
import {
  groupTasksByUrgency,
  TaskGroupKey,
  taskDueLabel,
  taskTimeParts,
} from "../../../shared/task-timeline";

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

const timeStepMinutes = 5;
const timeOptions = Array.from({ length: (24 * 60) / timeStepMinutes }, (_, index) => {
  const totalMinutes = index * timeStepMinutes;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

const reviewLabel = (task: Task) => {
  if (!task.requiresPhotoConfirmation) return "";
  if (task.photoReviewStatus === "pending") return "Фото на проверке";
  if (task.photoReviewStatus === "approved") return "Фото подтверждено";
  if (task.photoReviewStatus === "declined") return "Фото отклонено";
  return "Требуется фото-подтверждение";
};

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
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [storeTablets, setStoreTablets] = useState<StoreTablet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [selectedTabletId, setSelectedTabletId] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<string | null>(null);
  const [pendingDeadlineDate, setPendingDeadlineDate] = useState<string | null>(null);
  const [deadlineTime, setDeadlineTime] = useState("09:00");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() => new Date());
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [requiresPhotoConfirmation, setRequiresPhotoConfirmation] = useState(false);
  const [instructionTask, setInstructionTask] = useState<Task | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({});
  const [cameraTaskId, setCameraTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const canManage = session.user.role === "manager";

  const calendarCells = useMemo(
    () => buildCalendarCells(calendarMonthCursor),
    [calendarMonthCursor],
  );

  const selectedTabletName =
    storeTablets.find((tablet) => tablet.id === selectedTabletId)?.fullName ??
    "Выберите планшет";

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
        const [nextTasks, nextStoreTablets] = await Promise.all([
          tasksApi.list(session.token),
          tasksApi.listStoreTablets(session.token),
        ]);
        setTasks(nextTasks);
        setStoreTablets(nextStoreTablets);
        setSelectedTabletId((current) => current || nextStoreTablets[0]?.id || "");
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
    if (!selectedTabletId) {
      setError("Выберите планшет магазина.");
      return;
    }
    try {
      setSavingTask(true);
      const created = await tasksApi.create(
        session.token,
        normalizedTitle,
        selectedTabletId,
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

  const beginPhotoConfirmation = async (task: Task) => {
    if (cameraPermission?.granted) {
      setCameraTaskId(task.id);
      setError("");
      return;
    }

    if (cameraPermission && !cameraPermission.canAskAgain) {
      Alert.alert(
        "Нет доступа к камере",
        "Разрешите камеру в настройках устройства, чтобы прикрепить фото к задаче.",
        [
          { text: "Отмена", style: "cancel" },
          { text: "Настройки", onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }

    const permission = await requestCameraPermission();
    if (permission.granted) {
      setCameraTaskId(task.id);
      setError("");
    } else {
      setError("Камера нужна, чтобы прикрепить фото-подтверждение.");
    }
  };

  const completeTask = async (task: Task) => {
    if (task.requiresPhotoConfirmation && task.photoReviewStatus !== "approved") {
      await beginPhotoConfirmation(task);
      return;
    }
    await setStatus(task, "done");
  };

  const captureTaskPhoto = async (task: Task) => {
    const camera = cameraRef.current;
    if (!camera) {
      setError("Камера еще не готова.");
      return;
    }
    try {
      setTaskPending(task.id, true);
      const photo = await camera.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) {
        setError("Не удалось получить фото. Попробуйте еще раз.");
        return;
      }
      const updated = await tasksApi.uploadPhoto(session.token, task.id, `data:image/jpeg;base64,${photo.base64}`);
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
      setCameraTaskId(null);
      setError("");
    } catch (photoError) {
      setError(errorMessage(photoError));
      await loadTasks();
    } finally {
      setTaskPending(task.id, false);
    }
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
        <Text style={styles.selectorLabel}>Планшет магазина</Text>
        <Pressable
          style={styles.dropdownTrigger}
          onPress={() => {
            setShowAssigneeDropdown((current) => !current);
            setShowCalendar(false);
            setShowTimeDropdown(false);
          }}
        >
          <Text style={styles.dropdownText}>{selectedTabletName}</Text>
          <Text style={styles.dropdownArrow}>{showAssigneeDropdown ? "▲" : "▼"}</Text>
        </Pressable>
        {showAssigneeDropdown && (
          <View style={styles.dropdownMenu}>
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {storeTablets.map((tablet) => {
                const active = tablet.id === selectedTabletId;
                return (
                  <Pressable
                    key={tablet.id}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedTabletId(tablet.id);
                      setShowAssigneeDropdown(false);
                    }}
                  >
                    <Text
                      style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}
                    >
                      {tablet.fullName}
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
          {groupTasksByUrgency(tasks, now).map((group) => (
            <View key={group.key} style={styles.taskGroup}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, groupDotStyles[group.key]]} />
                <Text style={[styles.groupTitle, group.key === "overdue" && styles.groupTitleOverdue]}>{group.label}</Text>
                <Text style={[styles.groupCount, group.key === "overdue" && styles.groupCountOverdue]}>{group.tasks.length}</Text>
              </View>
              {group.tasks.map((task) => {
                const pending = pendingTaskIds[task.id];
                const time = taskTimeParts(task.deadlineAt, now);
                const due = taskDueLabel(task, now);
                const meta = [
                  reviewLabel(task),
                  task.completedAt ? `Выполнена ${formatDate(task.completedAt)}` : "",
                ].filter(Boolean);
                return (
                  <View key={task.id} style={[styles.taskCard, group.key === "overdue" && styles.taskCardOverdue, group.key === "soon" && styles.taskCardSoon, pending && styles.taskCardPending]}>
                    <View style={[styles.timeBlock, timeBlockStyles[group.key]]}>
                      <Text style={[styles.timeText, timeTextStyles[group.key]]}>{time.time}</Text>
                      <Text style={[styles.timeDay, timeTextStyles[group.key]]}>{time.day}</Text>
                    </View>
                    <View style={styles.taskBody}>
                      <View style={styles.taskHeaderRow}>
                        <View style={styles.taskTitleRow}>
                          {task.requiresPhotoConfirmation && <Text style={styles.photoBadge}>Фото</Text>}
                          <Text style={[styles.taskTitle, group.key === "done" && styles.taskTitleDone]}>
                            {task.title}
                          </Text>
                        </View>
                        {!!due && (
                          <Text style={[styles.dueText, dueChipStyles[group.key]]}>
                            {due}
                          </Text>
                        )}
                      </View>
                      {meta.length > 0 && <Text style={styles.taskMeta}>{meta.join("  ·  ")}</Text>}
                      {!!task.instructionPhotoUrl && (
                        <Pressable style={styles.instructionButton} onPress={() => setInstructionTask(task)}>
                          <Image
                            source={{ uri: ruApiUrl(task.instructionPhotoUrl), headers: { Authorization: `Bearer ${session.token}` } }}
                            style={styles.instructionThumb}
                            resizeMode="cover"
                          />
                          <Text style={styles.instructionButtonText}>Фото-инструкция · открыть</Text>
                        </Pressable>
                      )}
                      {cameraTaskId === task.id && (
                        <View style={styles.photoCameraBox}>
                          <CameraView ref={cameraRef} style={styles.photoCamera} facing="back" />
                          <View style={styles.photoCameraActions}>
                            <Pressable
                              style={[styles.actionButton, styles.statusButton]}
                              onPress={() => void captureTaskPhoto(task)}
                              disabled={pending}
                            >
                              <Text style={styles.actionButtonText}>{pending ? "Отправляем..." : "Снять и отправить"}</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.actionButton, styles.cancelButton]}
                              onPress={() => setCameraTaskId(null)}
                              disabled={pending}
                            >
                              <Text style={styles.cancelButtonText}>Отмена</Text>
                            </Pressable>
                          </View>
                        </View>
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
                          </>
                        ) : task.status === "open" ? (
                          <Pressable
                            style={[styles.actionButton, styles.statusButton]}
                            onPress={() => void completeTask(task)}
                            disabled={pending}
                          >
                            <Text style={styles.actionButtonText}>
                              {task.requiresPhotoConfirmation && task.photoReviewStatus !== "approved" ? "Сделать фото" : "Выполнено"}
                            </Text>
                          </Pressable>
                        ) : task.photoReviewStatus === "pending" ? (
                          <Text style={styles.doneText}>На проверке</Text>
                        ) : (
                          <Text style={styles.doneText}>Завершено</Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
      <Modal visible={!!instructionTask} transparent animationType="fade" onRequestClose={() => setInstructionTask(null)}>
        <Pressable style={styles.instructionModal} onPress={() => setInstructionTask(null)}>
          {!!instructionTask?.instructionPhotoUrl && (
            <Image
              source={{ uri: ruApiUrl(instructionTask.instructionPhotoUrl), headers: { Authorization: `Bearer ${session.token}` } }}
              style={styles.instructionModalImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.instructionModalClose}>Закрыть</Text>
        </Pressable>
      </Modal>
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bccabf',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#2f4437',
    fontSize: 13,
    fontWeight: '700',
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
    color: "#ffffff",
    backgroundColor: "#ff2d20",
    borderRadius: 10,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 8,
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
    gap: 16,
    paddingBottom: 4,
  },
  taskGroup: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  groupDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#9aabb8",
  },
  groupTitle: {
    color: "#1d2f24",
    fontSize: 16,
    fontWeight: "800",
  },
  groupCount: {
    minWidth: 22,
    borderRadius: 11,
    backgroundColor: "#e6ece7",
    color: "#5f7266",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 20,
    paddingHorizontal: 7,
    textAlign: "center",
    overflow: "hidden",
  },
  taskCard: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cfdbd1",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    minHeight: 76,
  },
  timeBlock: {
    width: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: "#e5ebf0",
  },
  timeText: {
    color: "#1f2a23",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  timeDay: {
    color: "#1f2a23",
    fontSize: 11,
    fontWeight: "800",
    opacity: 0.9,
    marginTop: 3,
  },
  taskBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 5,
    justifyContent: "center",
  },
  taskHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  taskTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  instructionButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#c9d6ee",
    borderRadius: 10,
    backgroundColor: "#eef3fc",
    padding: 6,
    paddingRight: 12,
  },
  instructionThumb: {
    width: 64,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#dfe7f5",
  },
  instructionButtonText: {
    color: "#2c4f8a",
    fontSize: 13,
    fontWeight: "800",
  },
  instructionModal: {
    flex: 1,
    backgroundColor: "rgba(10, 20, 15, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  instructionModalImage: {
    width: "100%",
    height: "85%",
  },
  instructionModalClose: {
    marginTop: 14,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  photoBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#c8d9cd",
    backgroundColor: "#e8f2eb",
    color: "#245d43",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
  taskTitleDone: {
    color: "#6b7a71",
    textDecorationLine: "line-through",
  },
  dueText: {
    borderRadius: 10,
    backgroundColor: "#eef2f6",
    color: "#33465a",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  taskCardOverdue: {
    borderColor: "#ff8a80",
    backgroundColor: "#fff5f4",
  },
  taskCardSoon: {
    borderColor: "#ffd24d",
    backgroundColor: "#fff8db",
  },
  groupTitleOverdue: {
    color: "#d91e18",
  },
  groupCountOverdue: {
    backgroundColor: "#ff2d20",
    color: "#ffffff",
  },
  taskCardPending: {
    opacity: 0.7,
  },
  taskTitle: {
    color: "#1d2f24",
    fontSize: 15,
    fontWeight: "800",
  },
  taskMeta: {
    color: "#64786b",
    fontSize: 12,
    fontWeight: "600",
  },
  taskActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    alignItems: "center",
  },
  actionButton: {
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  statusButton: {
    backgroundColor: "#2f6f4f",
  },
  cancelButton: {
    backgroundColor: "#edf3ee",
    borderWidth: 1,
    borderColor: "#c8d3ca",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  cancelButtonText: {
    color: "#334b3d",
    fontSize: 12,
    fontWeight: "700",
  },
  doneText: {
    color: "#496050",
    fontSize: 12,
    fontWeight: "700",
  },
  photoCameraBox: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#c6d3c8",
    backgroundColor: "#17251c",
  },
  photoCamera: {
    height: 260,
  },
  photoCameraActions: {
    flexDirection: "row",
    gap: 8,
    padding: 8,
    backgroundColor: "#ffffff",
  },
});

const timeBlockStyles = StyleSheet.create<Record<TaskGroupKey, object>>({
  overdue: { backgroundColor: "#ff2d20" },
  soon: { backgroundColor: "#ffc61a" },
  later: { backgroundColor: "#e3e9ef" },
  noDeadline: { backgroundColor: "#eef3ee" },
  done: { backgroundColor: "#dceee3" },
});

const timeTextStyles = StyleSheet.create<Record<TaskGroupKey, object>>({
  overdue: { color: "#ffffff" },
  soon: { color: "#2b2100" },
  later: { color: "#1f2a23" },
  noDeadline: { color: "#5b6b62" },
  done: { color: "#245236" },
});

const groupDotStyles = StyleSheet.create<Record<TaskGroupKey, object>>({
  overdue: { backgroundColor: "#ff2d20" },
  soon: { backgroundColor: "#ffb800" },
  later: { backgroundColor: "#9aabb8" },
  noDeadline: { backgroundColor: "#b7c2bb" },
  done: { backgroundColor: "#4f9a6c" },
});

const dueChipStyles = StyleSheet.create<Record<TaskGroupKey, object>>({
  overdue: { backgroundColor: "#ff2d20", color: "#ffffff" },
  soon: { backgroundColor: "#ffc61a", color: "#2b2100" },
  later: { backgroundColor: "#e3e9ef", color: "#2c3e50" },
  noDeadline: {},
  done: {},
});
