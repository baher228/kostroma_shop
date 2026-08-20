import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Feedback, RefreshButton, Table } from '../../components/ui';
import { formatDateTime, messageOf } from '../../shared/format';
import type { Session, Task, Worker } from '../../types';

const statusLabel = (task: Task) => task.status === 'open' ? 'Открыта' : 'Выполнена';

export const TasksPanel = ({ session }: { session: Session }) => {
  const emptyForm = { title: '', assigneeId: '', deadlineAt: '', requiresPhotoConfirmation: false };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
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
      const [nextTasks, nextWorkers] = await Promise.all([api.tasks.list(session.token), api.tasks.listWorkers(session.token)]);
      setTasks(nextTasks);
      setWorkers(nextWorkers);
      setForm((current) => current.assigneeId || !nextWorkers[0] ? current : { ...current, assigneeId: nextWorkers[0].id });
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
      setError('Выберите сотрудника.');
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
          <p>Назначайте задачи сотрудникам и отслеживайте их выполнение.</p>
        </div>
        <RefreshButton onClick={load} />
      </header>
      <Feedback id="tasks-feedback" error={error} notice={notice} />
      <form className="task-composer" onSubmit={create} aria-busy={saving}>
        <div className="task-composer-intro">
          <h3>Новая задача</h3>
          <p>Исполнитель получит push-уведомление сразу после назначения.</p>
        </div>
        <div className="task-form-grid">
          <label className="task-field task-title-field">
            <span>Задача</span>
            <input required minLength={2} maxLength={240} aria-invalid={Boolean(error)} aria-describedby={error ? 'tasks-feedback' : undefined} placeholder="Например, проверить выкладку у витрины" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label className="task-field">
            <span>Исполнитель</span>
            <select required aria-invalid={Boolean(error)} aria-describedby={error ? 'tasks-feedback' : undefined} value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              <option value="">Выберите сотрудника</option>
              {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
            </select>
          </label>
          <label className="task-field">
            <span>Дедлайн <small>необязательно</small></span>
            <input type="datetime-local" value={form.deadlineAt} onChange={(event) => setForm({ ...form, deadlineAt: event.target.value })} />
          </label>
          <label className="task-photo-control">
            <input type="checkbox" checked={form.requiresPhotoConfirmation} onChange={(event) => setForm({ ...form, requiresPhotoConfirmation: event.target.checked })} />
            <span>
              <strong>Фото-подтверждение</strong>
              <small>Попросить сотрудника приложить фото</small>
            </span>
          </label>
        </div>
        <footer className="task-composer-footer">
          <p id="task-form-hint">{workers.length === 0 && !loading ? 'Сначала создайте сотрудника, чтобы назначить задачу.' : 'Дедлайн можно оставить пустым, если задача без срока.'}</p>
          <button aria-describedby="task-form-hint" disabled={saving || workers.length === 0}>{saving ? 'Назначаем...' : 'Назначить задачу'}</button>
        </footer>
      </form>
      {loading ? <p className="tasks-loading">Загружаем задачи...</p> : tasks.length === 0 ? (
        <section className="tasks-empty" aria-live="polite">
          <h3>Пока нет задач</h3>
          <p>Заполните форму выше, чтобы назначить первую задачу сотруднику.</p>
        </section>
      ) : (
        <div className="tasks-table">
          <Table>
          <thead><tr><th scope="col">Задача</th><th scope="col">Исполнитель</th><th scope="col">Статус</th><th scope="col">Дедлайн</th><th scope="col">Фото</th><th scope="col">Действия</th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td className="task-name-cell"><strong>{task.title}</strong><small>Создана {formatDateTime(task.createdAt)}</small></td>
                <td>{task.assigneeDisplayName}</td>
                <td><span className={`pill ${task.overdue ? 'overdue' : task.status === 'open' ? 'new' : 'processed'}`}>{task.overdue ? 'Просрочена' : statusLabel(task)}</span></td>
                <td>{task.deadlineAt ? formatDateTime(task.deadlineAt) : 'Без дедлайна'}</td>
                <td>{task.photoConfirmationUrl ? <a className="task-photo-link" href={task.photoConfirmationUrl} target="_blank" rel="noreferrer">Открыть фото</a> : task.requiresPhotoConfirmation ? 'Ожидается' : '—'}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => void updateStatus(task)} disabled={pendingId === task.id}>
                    {task.status === 'open' ? 'Выполнена' : 'Открыть снова'}
                  </button>
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
