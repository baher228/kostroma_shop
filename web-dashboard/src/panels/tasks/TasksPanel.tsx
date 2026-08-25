import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback, RefreshButton, Table } from '../../components/ui';
import { formatDateTime, messageOf } from '../../shared/format';
import type { Session, StoreTablet, Task } from '../../types';

const statusLabel = (task: Task) => {
  if (task.photoReviewStatus === 'pending') return 'На проверке';
  if (task.photoReviewStatus === 'declined') return 'Фото отклонено';
  if (task.photoReviewStatus === 'approved') return 'Подтверждена';
  return task.status === 'open' ? 'Открыта' : 'Выполнена';
};

const photoStatusLabel = (task: Task) => {
  if (!task.requiresPhotoConfirmation) return '—';
  if (task.photoReviewStatus === 'pending') return 'Ожидает review';
  if (task.photoReviewStatus === 'approved') return 'Approved';
  if (task.photoReviewStatus === 'declined') return 'Declined';
  return 'Ожидается';
};

const TaskPhotoPreview = ({ token, task }: { token: string; task: Task }) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!task.photoConfirmationUrl) {
      setPhotoUrl(null);
      setError('');
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    api.tasks.photoBlob(token, task.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(messageOf(err));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [task.id, task.photoConfirmationUrl, token]);

  if (!task.photoConfirmationUrl) {
    return <span>{photoStatusLabel(task)}</span>;
  }

  if (error) {
    return <span className="task-photo-error">{error}</span>;
  }

  if (!photoUrl) {
    return <span>Загружаем фото...</span>;
  }

  return (
    <a className="task-photo-preview" href={photoUrl} target="_blank" rel="noreferrer">
      <img src={photoUrl} alt={`Фото-подтверждение: ${task.title}`} />
      <span>{photoStatusLabel(task)}</span>
    </a>
  );
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, '0');
  const minute = index % 2 ? '30' : '00';
  return `${hour}:${minute}`;
});

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const calendarDays = (month: Date) => {
  const first = monthStart(month);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth(), index - offset + 1);
    return { date, key: toDateKey(date), inCurrentMonth: date.getMonth() === first.getMonth() };
  });
};

const dateLabel = (key: string) => dateFromKey(key).toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DeadlinePicker = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const selectedDateKey = value.slice(0, 10);
  const selectedTime = value.slice(11, 16) || '09:00';
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedDateKey) ? dateFromKey(selectedDateKey) : null;
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const [month, setMonth] = useState(() => monthStart(selectedDate ?? new Date()));
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(null);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(null);
    triggerRef.current?.focus();
  };

  const chooseDate = (key: string) => {
    onChange(`${key}T${selectedTime}`);
    close();
  };

  return (
    <div className="deadline-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="deadline-picker-trigger"
        aria-label="Выбрать дату дедлайна"
        aria-expanded={open === 'date'}
        onClick={() => {
          if (open !== 'date') setMonth(monthStart(selectedDate ?? new Date()));
          setOpen((current) => current === 'date' ? null : 'date');
        }}
      >
        <span>{selectedDate ? dateLabel(selectedDateKey) : 'Выберите дату'}</span>
        <span className="deadline-picker-icon" aria-hidden="true">▾</span>
      </button>
      {open === 'date' && (
        <section className="deadline-calendar" role="dialog" aria-label="Выбор даты дедлайна">
          <header className="deadline-calendar-header">
            <button type="button" className="deadline-calendar-nav" aria-label="Предыдущий месяц" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button>
            <strong>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" className="deadline-calendar-nav" aria-label="Следующий месяц" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button>
          </header>
          <div className="deadline-calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="deadline-calendar-days">
            {calendarDays(month).map(({ date, key, inCurrentMonth }) => (
              <button
                key={key}
                type="button"
                className={`deadline-calendar-day${inCurrentMonth ? '' : ' outside'}${key === selectedDateKey ? ' selected' : ''}${key === toDateKey(new Date()) ? ' today' : ''}`}
                aria-label={dateLabel(key)}
                aria-pressed={key === selectedDateKey}
                onClick={() => chooseDate(key)}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
          <div className="deadline-calendar-footer">
            <button type="button" className="ghost" onClick={() => {
              onChange('');
              close();
            }}>Очистить</button>
            <button type="button" className="secondary" onClick={close}>Готово</button>
          </div>
        </section>
      )}
      <button
        type="button"
        className="deadline-time-trigger"
        aria-label="Выбрать время дедлайна"
        aria-expanded={open === 'time'}
        title={selectedDate ? undefined : 'Сначала выберите дату'}
        disabled={!selectedDate}
        onClick={() => setOpen((current) => current === 'time' ? null : 'time')}
      >
        <span>{selectedTime}</span>
        <span className="deadline-picker-icon" aria-hidden="true">▾</span>
      </button>
      {open === 'time' && selectedDate && (
        <section className="deadline-time-menu" role="dialog" aria-label="Выбор времени дедлайна">
          <header>
            <strong>Время</strong>
            <span>{dateLabel(selectedDateKey)}</span>
          </header>
          <div className="deadline-time-options">
            {TIME_OPTIONS.map((time) => (
              <button
                key={time}
                type="button"
                className={time === selectedTime ? 'selected' : ''}
                onClick={() => {
                  onChange(`${selectedDateKey}T${time}`);
                  close();
                }}
              >
                {time}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export const TasksPanel = ({ session }: { session: Session }) => {
  const emptyForm = { title: '', assigneeId: '', deadlineAt: '', requiresPhotoConfirmation: false };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [storeTablets, setStoreTablets] = useState<StoreTablet[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openCount = tasks.filter((task) => task.status === 'open').length;
  const overdueCount = tasks.filter((task) => task.overdue).length;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextTasks, nextStoreTablets] = await Promise.all([api.tasks.list(session.token), api.tasks.listStoreTablets(session.token)]);
      setTasks(nextTasks);
      setStoreTablets(nextStoreTablets);
      setForm((current) => current.assigneeId || !nextStoreTablets[0] ? current : { ...current, assigneeId: nextStoreTablets[0].id });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!form.assigneeId) {
      setError('Выберите планшет магазина.');
      return;
    }
    try {
      setSaving(true);
      const task = await api.tasks.create(session.token, {
        title: form.title.trim(),
        assigneeId: form.assigneeId,
        deadlineAt: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : null,
        requiresPhotoConfirmation: form.requiresPhotoConfirmation,
      });
      setTasks((current) => [task, ...current]);
      setForm({ ...emptyForm, assigneeId: form.assigneeId });
      setNotice('Задача назначена.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (task: Task) => {
    try {
      setPendingId(task.id);
      const updated = await api.tasks.updateStatus(session.token, task.id, task.status === 'open' ? 'done' : 'open');
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPendingId(null);
    }
  };

  const reviewPhoto = async (task: Task, decision: 'approve' | 'decline') => {
    try {
      setPendingId(task.id);
      const updated = await api.tasks.reviewPhoto(session.token, task.id, decision);
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setNotice(decision === 'approve' ? 'Фото подтверждено. Оно удалится через час.' : 'Фото отклонено. Задача снова открыта, фото удалится через час.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    try {
      setPendingId(task.id);
      await api.tasks.delete(session.token, task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice('Задача удалена.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="page-section tasks-page">
      <header className="page-header tasks-page-header">
        <div>
          <div className="tasks-title-row">
            <h2>Задачи</h2>
            <span className={`tasks-summary${overdueCount ? ' overdue' : ''}`}>
              {overdueCount ? `${overdueCount} просрочено` : `${openCount} открыто`}
            </span>
          </div>
          <p>Назначайте задачи планшетам магазинов и отслеживайте их выполнение.</p>
        </div>
        <RefreshButton onClick={load} />
      </header>
      <Feedback id="tasks-feedback" error={error} notice={notice} />
      <form className="task-composer" onSubmit={create} aria-busy={saving}>
        <div className="task-composer-intro">
          <h3>Новая задача</h3>
          <p>Планшет магазина получит push-уведомление сразу после назначения.</p>
        </div>
        <div className="task-form-grid">
          <label className="task-field task-title-field">
            <span>Задача</span>
            <input required minLength={2} maxLength={240} aria-invalid={Boolean(error)} aria-describedby={error ? 'tasks-feedback' : undefined} placeholder="Например, проверить выкладку у витрины" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label className="task-field">
            <span>Планшет магазина</span>
            <select required aria-invalid={Boolean(error)} aria-describedby={error ? 'tasks-feedback' : undefined} value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              <option value="">Выберите планшет</option>
              {storeTablets.map((tablet) => <option key={tablet.id} value={tablet.id}>{tablet.fullName}</option>)}
            </select>
          </label>
          <div className="task-deadline-row">
            <label className="task-field task-deadline-field">
              <span>Дедлайн <small>необязательно</small></span>
              <DeadlinePicker value={form.deadlineAt} onChange={(deadlineAt) => setForm({ ...form, deadlineAt })} />
            </label>
            <label className="task-photo-control">
              <input type="checkbox" checked={form.requiresPhotoConfirmation} onChange={(event) => setForm({ ...form, requiresPhotoConfirmation: event.target.checked })} />
              <span>
                <strong>Фото-подтверждение</strong>
                <small>Запросить фото после выполнения</small>
              </span>
            </label>
          </div>
        </div>
        <footer className="task-composer-footer">
          <p id="task-form-hint">{storeTablets.length === 0 && !loading ? 'Сначала создайте планшет магазина, чтобы назначить задачу.' : 'Дедлайн можно оставить пустым, если задача без срока.'}</p>
          <button aria-describedby="task-form-hint" disabled={saving || storeTablets.length === 0}>{saving ? 'Назначаем...' : 'Назначить задачу'}</button>
        </footer>
      </form>
      {loading ? <p className="tasks-loading">Загружаем задачи...</p> : tasks.length === 0 ? (
        <section className="tasks-empty" aria-live="polite">
          <h3>Пока нет задач</h3>
          <p>Заполните форму выше, чтобы назначить первую задачу планшету магазина.</p>
        </section>
      ) : (
        <div className="tasks-table">
          <Table>
          <thead><tr><th scope="col">Задача</th><th scope="col">Планшет</th><th scope="col">Статус</th><th scope="col">Дедлайн</th><th scope="col">Фото</th><th scope="col">Действия</th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td className="task-name-cell"><strong>{task.title}</strong><small>Создана {formatDateTime(task.createdAt)}</small></td>
                <td>{task.assigneeDisplayName}</td>
                <td><span className={`pill ${task.overdue ? 'overdue' : task.photoReviewStatus === 'pending' ? 'new' : task.status === 'open' ? 'new' : 'processed'}`}>{task.overdue ? 'Просрочена' : statusLabel(task)}</span></td>
                <td>{task.deadlineAt ? formatDateTime(task.deadlineAt) : 'Без дедлайна'}</td>
                <td><TaskPhotoPreview token={session.token} task={task} /></td>
                <td className="actions">
                  {task.photoReviewStatus === 'pending' ? (
                    <>
                      <button className="secondary" onClick={() => void reviewPhoto(task, 'approve')} disabled={pendingId === task.id}>Approve</button>
                      <button className="danger" onClick={() => void reviewPhoto(task, 'decline')} disabled={pendingId === task.id}>Decline</button>
                    </>
                  ) : (
                    <button className="secondary" onClick={() => void updateStatus(task)} disabled={pendingId === task.id || (task.requiresPhotoConfirmation && task.status === 'open')}>
                      {task.status === 'open' ? 'Выполнена' : 'Открыть снова'}
                    </button>
                  )}
                  <button className="danger" onClick={() => void remove(task)} disabled={pendingId === task.id}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
          </Table>
        </div>
      )}
    </section>
  );
};
