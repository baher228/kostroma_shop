import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback, RefreshButton } from '../../components/ui';
import { formatDateTime, messageOf } from '../../shared/format';
import type { Session, Shop, StoreTablet, Task } from '../../types';
import { groupTasksByUrgency, taskDueLabel, taskTimeParts } from '../../../../shared/task-timeline';

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

const tabletShopLabel = (tablet: StoreTablet, shopsById: Record<string, Shop>) => {
  const shop = tablet.shopId ? shopsById[tablet.shopId] : null;
  if (!shop) return 'Магазин не назначен';
  return shop.name;
};

const tabletSearchText = (tablet: StoreTablet, shopsById: Record<string, Shop>) =>
  `${tablet.fullName} ${tablet.username} ${tabletShopLabel(tablet, shopsById)}`.trim().toLowerCase();

const taskShopLabel = (
  task: Task,
  tabletsById: Record<string, StoreTablet>,
  shopsById: Record<string, Shop>,
) => {
  const tablet = tabletsById[task.assigneeId];
  const shop = tablet?.shopId ? shopsById[tablet.shopId] : null;
  return shop?.name ?? task.assigneeDisplayName;
};

type TaskCard = {
  key: string;
  title: string;
  status: Task['status'];
  deadlineAt: string | null;
  completedAt: string | null;
  requiresPhotoConfirmation: boolean;
  members: Task[];
};

const latestIso = (values: (string | null)[]) =>
  values.reduce<string | null>((latest, value) => (value && (!latest || value > latest) ? value : latest), null);

const toTaskCards = (tasks: Task[]): TaskCard[] => {
  const byKey = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = task.groupId || task.id;
    byKey.set(key, [...(byKey.get(key) ?? []), task]);
  });
  return [...byKey.entries()].map(([key, members]) => {
    const allDone = members.every((member) => member.status === 'done');
    return {
      key,
      title: members[0].title,
      status: allDone ? 'done' : 'open',
      deadlineAt: members[0].deadlineAt,
      completedAt: allDone ? latestIso(members.map((member) => member.completedAt)) : null,
      requiresPhotoConfirmation: members.some((member) => member.requiresPhotoConfirmation),
      members,
    };
  });
};

const ShopMultiPicker = ({
  tablets,
  shopsById,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  tablets: StoreTablet[];
  shopsById: Record<string, Shop>;
  value: string[];
  onChange: (value: string[]) => void;
  invalid: boolean;
  describedBy?: string;
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = new Set(value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTablets = tablets.filter((tablet) => !normalizedQuery || tabletSearchText(tablet, shopsById).includes(normalizedQuery));
  const allFilteredSelected = filteredTablets.length > 0 && filteredTablets.every((tablet) => selected.has(tablet.id));
  const someFilteredSelected = filteredTablets.some((tablet) => selected.has(tablet.id));
  const selectedTablets = tablets.filter((tablet) => selected.has(tablet.id));
  const summary = selectedTablets.length === 0
    ? 'Выберите магазины'
    : selectedTablets.length === tablets.length
      ? `Все магазины (${tablets.length})`
      : selectedTablets.length <= 2
        ? selectedTablets.map((tablet) => tabletShopLabel(tablet, shopsById)).join(', ')
        : `${tabletShopLabel(selectedTablets[0], shopsById)} и ещё ${selectedTablets.length - 1}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (tabletId: string) => {
    onChange(selected.has(tabletId) ? value.filter((id) => id !== tabletId) : [...value, tabletId]);
  };

  const toggleAllFiltered = () => {
    const filteredIds = new Set(filteredTablets.map((tablet) => tablet.id));
    onChange(allFilteredSelected
      ? value.filter((id) => !filteredIds.has(id))
      : [...value, ...filteredTablets.map((tablet) => tablet.id).filter((id) => !selected.has(id))]);
  };

  return (
    <div className="shop-multi-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`shop-multi-trigger${selectedTablets.length ? '' : ' empty'}`}
        aria-label="Магазины"
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-invalid={invalid && selectedTablets.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{summary}</span>
        {selectedTablets.length > 0 && <b>{selectedTablets.length}</b>}
        <span className="deadline-picker-icon" aria-hidden="true">▾</span>
      </button>
      {open && (
        <section className="shop-multi-menu" role="dialog" aria-label="Выбор магазинов">
          <input
            autoFocus
            type="search"
            aria-label="Поиск магазина"
            placeholder="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="shop-multi-options">
            {filteredTablets.length > 0 && (
              <label className="shop-multi-option shop-multi-all">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someFilteredSelected && !allFilteredSelected;
                  }}
                  onChange={toggleAllFiltered}
                />
                <span>{normalizedQuery ? '(Выделить найденные)' : '(Выделить все)'}</span>
              </label>
            )}
            {filteredTablets.length ? filteredTablets.map((tablet) => (
              <label key={tablet.id} className="shop-multi-option">
                <input type="checkbox" checked={selected.has(tablet.id)} onChange={() => toggle(tablet.id)} />
                <span>
                  <strong>{tabletShopLabel(tablet, shopsById)}</strong>
                  <small>{tablet.fullName} · @{tablet.username}</small>
                </span>
              </label>
            )) : <p>Ничего не найдено</p>}
          </div>
          <footer>
            <span>Выбрано: {selectedTablets.length}</span>
            <button type="button" className="ghost" disabled={value.length === 0} onClick={() => onChange([])}>Очистить</button>
            <button type="button" className="secondary" onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}>Готово</button>
          </footer>
        </section>
      )}
    </div>
  );
};

export const TasksPanel = ({ session }: { session: Session }) => {
  const emptyForm = { title: '', assigneeIds: [] as string[], deadlineAt: '', requiresPhotoConfirmation: false };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [storeTablets, setStoreTablets] = useState<StoreTablet[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const taskCards = toTaskCards(tasks);
  const openCount = taskCards.filter((card) => card.status === 'open').length;
  const overdueCount = taskCards.filter((card) => card.members.some((member) => member.overdue)).length;
  const shopsById = Object.fromEntries(shops.map((shop) => [shop.id, shop]));
  const tabletsById = Object.fromEntries(storeTablets.map((tablet) => [tablet.id, tablet]));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextTasks, nextStoreTablets, nextShops] = await Promise.all([
        api.tasks.list(session.token),
        api.tasks.listStoreTablets(session.token),
        api.shops.list(session.token),
      ]);
      setTasks(nextTasks);
      setStoreTablets(nextStoreTablets);
      setShops(nextShops);
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
    const assigneeIds = form.assigneeIds.filter((id) => tabletsById[id]);
    if (assigneeIds.length === 0) {
      setError('Выберите хотя бы один магазин.');
      return;
    }
    try {
      setSaving(true);
      const createdTasks = await api.tasks.create(session.token, {
        title: form.title.trim(),
        assigneeIds,
        deadlineAt: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : null,
        requiresPhotoConfirmation: form.requiresPhotoConfirmation,
      });
      setTasks((current) => [...createdTasks, ...current]);
      setForm({ ...emptyForm, assigneeIds });
      setNotice(createdTasks.length > 1 ? `Задача назначена магазинам: ${createdTasks.length}.` : 'Задача назначена.');
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

  const renderActions = (task: Task, compact: boolean) => task.photoReviewStatus === 'pending' ? (
    <>
      <button className="secondary" onClick={() => void reviewPhoto(task, 'approve')} disabled={pendingId === task.id}>Approve</button>
      <button className="danger" onClick={() => void reviewPhoto(task, 'decline')} disabled={pendingId === task.id}>Decline</button>
    </>
  ) : (
    <button className={task.status === 'open' ? 'task-done-button' : 'secondary'} onClick={() => void updateStatus(task)} disabled={pendingId === task.id || (task.requiresPhotoConfirmation && task.status === 'open')}>
      {task.status === 'open' ? 'Выполнена' : compact ? 'Открыть' : 'Открыть снова'}
    </button>
  );

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
          <div className="task-field" role="group" aria-label="Магазины">
            <span>Магазины</span>
            <ShopMultiPicker
              tablets={storeTablets}
              shopsById={shopsById}
              value={form.assigneeIds}
              onChange={(assigneeIds) => setForm({ ...form, assigneeIds })}
              invalid={Boolean(error)}
              describedBy={error ? 'tasks-feedback' : undefined}
            />
          </div>
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
          <p id="task-form-hint">{storeTablets.length === 0 && !loading ? 'Сначала создайте планшет магазина, чтобы назначить задачу.' : 'Отметьте один или несколько магазинов — задача будет одна, у каждого магазина свой статус.'}</p>
          <button aria-describedby="task-form-hint" disabled={saving || storeTablets.length === 0}>{saving ? 'Назначаем...' : form.assigneeIds.length > 1 ? `Назначить ${form.assigneeIds.length} магазинам` : 'Назначить задачу'}</button>
        </footer>
      </form>
      {loading ? <p className="tasks-loading">Загружаем задачи...</p> : tasks.length === 0 ? (
        <section className="tasks-empty" aria-live="polite">
          <h3>Пока нет задач</h3>
          <p>Заполните форму выше, чтобы назначить первую задачу планшету магазина.</p>
        </section>
      ) : (
        <div className="task-timeline">
          {groupTasksByUrgency(taskCards, now).map((group) => (
            <section key={group.key} className={`task-group task-group-${group.key}`} aria-labelledby={`task-group-${group.key}`}>
              <h3 id={`task-group-${group.key}`}><i className="task-group-dot" aria-hidden="true" />{group.label}<span>{group.tasks.length}</span></h3>
              <ul className="task-list">
                {group.tasks.map((card) => {
                  const time = taskTimeParts(card.deadlineAt, now);
                  const due = taskDueLabel(card, now);
                  const single = card.members.length === 1 ? card.members[0] : null;
                  const doneCount = card.members.filter((member) => member.status === 'done').length;
                  return (
                    <li key={card.key} className={`task-row task-row-${group.key}`} aria-busy={card.members.some((member) => pendingId === member.id)}>
                      <div className="task-time" aria-label={card.deadlineAt ? `Дедлайн ${formatDateTime(card.deadlineAt)}` : 'Без дедлайна'}>
                        <strong>{time.time}</strong>
                        <small>{time.day}</small>
                      </div>
                      <div className="task-row-body">
                        <div className="task-row-title">
                          {card.requiresPhotoConfirmation && <span className="task-badge">Фото</span>}
                          <strong>{card.title}</strong>
                        </div>
                        {single ? (
                          <div className="task-row-meta">
                            <span className="task-shop">{taskShopLabel(single, tabletsById, shopsById)}</span>
                            {single.completedAt && <span>Выполнена {formatDateTime(single.completedAt)}</span>}
                            {single.photoConfirmationUrl && <TaskPhotoPreview token={session.token} task={single} />}
                          </div>
                        ) : (
                          <>
                            <div className="task-row-meta">
                              <span className="task-shop">Магазинов: {card.members.length}</span>
                              <span>Выполнено {doneCount} из {card.members.length}</span>
                            </div>
                            <ul className="task-shop-list">
                              {[...card.members]
                                .sort((a, b) => taskShopLabel(a, tabletsById, shopsById).localeCompare(taskShopLabel(b, tabletsById, shopsById), 'ru'))
                                .map((member) => (
                                  <li key={member.id} className={`task-shop-line${member.status === 'done' ? ' done' : ''}`} aria-busy={pendingId === member.id}>
                                    <span className="task-shop">{taskShopLabel(member, tabletsById, shopsById)}</span>
                                    <span className="task-shop-status">
                                      {member.status === 'done' && member.completedAt ? `Выполнена ${formatDateTime(member.completedAt)}` : statusLabel(member)}
                                    </span>
                                    {member.photoConfirmationUrl && <TaskPhotoPreview token={session.token} task={member} />}
                                    <span className="actions">{renderActions(member, true)}</span>
                                  </li>
                                ))}
                            </ul>
                          </>
                        )}
                      </div>
                      <div className="task-row-side">
                        {due && <span className={`task-due task-due-${group.key}`}>{due}</span>}
                        {single && <div className="actions">{renderActions(single, false)}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};
