import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Feedback, PageHeader, RefreshButton, Table } from '../../components/ui';
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
    <section className="page-section">
      <PageHeader title="Задачи" subtitle="Назначайте задачи сотрудникам и отслеживайте их выполнение." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} notice={notice} />
      <form className="form-grid website-form" onSubmit={create}>
        <input required minLength={2} maxLength={240} placeholder="Текст задачи" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <select required value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
          <option value="">Выберите сотрудника</option>
          {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
        </select>
        <label>
          Дедлайн
          <input type="datetime-local" value={form.deadlineAt} onChange={(event) => setForm({ ...form, deadlineAt: event.target.value })} />
        </label>
        <label className="task-photo-control">
          <input type="checkbox" checked={form.requiresPhotoConfirmation} onChange={(event) => setForm({ ...form, requiresPhotoConfirmation: event.target.checked })} />
          Требовать фото-подтверждение
        </label>
        <button disabled={saving || workers.length === 0}>{saving ? 'Назначаем...' : 'Назначить задачу'}</button>
      </form>
      {loading ? <p>Загружаем задачи...</p> : (
        <Table>
          <thead><tr><th>Задача</th><th>Исполнитель</th><th>Статус</th><th>Дедлайн</th><th>Фото</th><th>Действия</th></tr></thead>
          <tbody>
            {tasks.length === 0 ? <tr><td colSpan={6}>Задач пока нет.</td></tr> : tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{task.assigneeDisplayName}</td>
                <td><span className={`pill ${task.status === 'open' ? 'new' : 'processed'}`}>{task.overdue ? 'Просрочена' : statusLabel(task)}</span></td>
                <td>{task.deadlineAt ? formatDateTime(task.deadlineAt) : 'Без дедлайна'}</td>
                <td>{task.photoConfirmedAt ? 'Подтверждено' : task.requiresPhotoConfirmation ? 'Требуется' : '—'}</td>
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
      )}
    </section>
  );
};
