import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { signSessionToken } from './auth';
import { config } from './config';
import { AuthorizedRequest, requireAuth, requireRole } from './middleware';
import { runMigrations } from './migrate';
import { createRow, deleteRow, getRows, updateRow } from './store';
import { createTask, deleteTask, listTasks, updateTaskStatus } from './taskStore';
import { createUser, findUserByUsername, findWorkerById, listUsers, listWorkers } from './userStore';
import {
  createRowSchema,
  createTaskSchema,
  createUserSchema,
  idParamSchema,
  loginSchema,
  updateRowSchema,
  updateTaskStatusSchema,
} from './validation';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((item: string) => item.trim()),
    credentials: false,
  }),
);
app.use(express.json({ limit: '200kb' }));

const toValidationMessage = (error: ZodError): string => error.issues.map((issue) => issue.message).join(' ');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await findUserByUsername(payload.username);
    if (!user) {
      res.status(401).json({ message: 'Неверный логин или пароль.' });
      return;
    }
    const isPasswordValid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Неверный логин или пароль.' });
      return;
    }
    const sessionUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
    const token = signSessionToken(sessionUser);
    res.json({ token, user: sessionUser });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Ошибка сервера.' });
  }
});

app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  const user = (req as AuthorizedRequest).user;
  res.json({ user });
});

app.get('/api/workers', requireAuth, requireRole('manager'), (_req, res) => {
  listWorkers()
    .then((workers) => res.json({ workers }))
    .catch(() => res.status(500).json({ message: 'Не удалось загрузить сотрудников.' }));
});

app.get('/api/users', requireAuth, requireRole('manager'), (_req, res) => {
  listUsers()
    .then((users) => res.json({ users }))
    .catch(() => res.status(500).json({ message: 'Не удалось загрузить пользователей.' }));
});

app.post('/api/users', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const payload = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await createUser({
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      passwordHash,
    });
    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      res.status(409).json({ message: 'Пользователь с таким логином уже существует.' });
      return;
    }
    res.status(500).json({ message: 'Не удалось создать пользователя.' });
  }
});

app.get('/api/stock', requireAuth, async (_req, res) => {
  try {
    const rows = await getRows();
    res.json({ rows });
  } catch {
    res.status(500).json({ message: 'Не удалось загрузить данные склада.' });
  }
});

app.post('/api/stock', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    const payload = createRowSchema.parse(req.body);
    const created = await createRow(payload.name);
    res.status(201).json({ row: created });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Не удалось создать товар.' });
  }
});

app.put('/api/stock/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = idParamSchema.parse(req.params);
    const payload = updateRowSchema.parse(req.body);
    const user = (req as AuthorizedRequest).user;
    if (user.role === 'worker' && payload.name) {
      res.status(403).json({ message: 'Сотрудник не может менять название товара.' });
      return;
    }
    const updated = await updateRow(params.id, payload);
    if (!updated) {
      res.status(404).json({ message: 'Товар не найден.' });
      return;
    }
    res.json({ row: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Не удалось обновить товар.' });
  }
});

app.delete('/api/stock/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const params = idParamSchema.parse(req.params);
    const removed = await deleteRow(params.id);
    if (!removed) {
      res.status(404).json({ message: 'Товар не найден.' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Не удалось удалить товар.' });
  }
});

app.get('/api/tasks', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthorizedRequest).user;
    const tasks = await listTasks();
    const visibleTasks = user.role === 'manager' ? tasks : tasks.filter((task) => task.assigneeId === user.id);
    res.json({ tasks: visibleTasks });
  } catch {
    res.status(500).json({ message: 'Не удалось загрузить задачи.' });
  }
});

app.post('/api/tasks', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const payload = createTaskSchema.parse(req.body);
    const assignee = await findWorkerById(payload.assigneeId);
    if (!assignee) {
      res.status(400).json({ message: 'Сотрудник для назначения не найден.' });
      return;
    }
    const manager = (req as AuthorizedRequest).user;
    const created = await createTask({
      title: payload.title,
      assigneeId: assignee.id,
      assigneeDisplayName: assignee.displayName,
      createdById: manager.id,
      createdByDisplayName: manager.displayName,
    });
    res.status(201).json({ task: created });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Не удалось создать задачу.' });
  }
});

app.patch('/api/tasks/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const params = idParamSchema.parse(req.params);
    const payload = updateTaskStatusSchema.parse(req.body);
    const user = (req as AuthorizedRequest).user;
    const tasks = await listTasks();
    const target = tasks.find((task) => task.id === params.id);
    if (!target) {
      res.status(404).json({ message: 'Задача не найдена.' });
      return;
    }
    if (user.role === 'worker' && target.assigneeId !== user.id) {
      res.status(403).json({ message: 'Недостаточно прав.' });
      return;
    }
    if (user.role === 'worker' && payload.status === 'open') {
      res.status(403).json({ message: 'Сотрудник не может возвращать задачу в открытые.' });
      return;
    }
    const updated = await updateTaskStatus(params.id, payload.status);
    if (!updated) {
      res.status(404).json({ message: 'Задача не найдена.' });
      return;
    }
    res.json({ task: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Не удалось обновить задачу.' });
  }
});

app.delete('/api/tasks/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const params = idParamSchema.parse(req.params);
    const removed = await deleteTask(params.id);
    if (!removed) {
      res.status(404).json({ message: 'Задача не найдена.' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: toValidationMessage(error) });
      return;
    }
    res.status(500).json({ message: 'Не удалось удалить задачу.' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ message: 'Маршрут не найден.' });
});

const startServer = async () => {
  await runMigrations();
  app.listen(config.port, () => {
    console.log(`Backend started on port ${config.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
