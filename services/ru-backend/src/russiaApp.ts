import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { getOpsJwks, signOpsToken, signSessionToken } from './auth';
import { getWorkerCheckInStatus, upsertWorkerCheckInStatus } from './checkInStore';
import { config } from './config';
import { AuthorizedRequest, requireAuth, requireRole } from './middleware';
import { addSupportMessage, createSupportThread, listSupportThreads } from './supportStore';
import { createTask, deleteTask, listTasks, updateTaskStatus } from './taskStore';
import { assignUserShop, createUser, findUserByUsername, findWorkerById, listUsers, listWorkers } from './userStore';
import {
  assignUserShopSchema,
  createSupportMessageSchema,
  createSupportThreadSchema,
  createTaskSchema,
  createUserSchema,
  idParamSchema,
  loginSchema,
  updateCheckInStatusSchema,
  updateTaskStatusSchema,
} from './validation';

const toValidationMessage = (error: ZodError): string => error.issues.map((issue) => issue.message).join(' ');

export const createRussiaApp = () => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((item: string) => item.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, region: 'ru' });
  });

  app.get('/api/auth/ops-jwks', (_req, res) => {
    res.json(getOpsJwks());
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const payload = loginSchema.parse(req.body);
      const user = await findUserByUsername(payload.username);
      if (!user) {
        res.status(401).json({ message: 'Invalid username or password.' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(payload.password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ message: 'Invalid username or password.' });
        return;
      }

      const sessionUser = {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        shopId: user.shopId,
        shopName: user.shopName,
      };
      const token = signSessionToken(sessionUser);
      res.json({ token, user: sessionUser });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Server error.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    res.json({ user: (req as AuthorizedRequest).user });
  });

  app.post('/api/auth/ops-token', requireAuth, (req: Request, res: Response) => {
    const token = signOpsToken((req as AuthorizedRequest).user);
    res.json({ token });
  });

  app.get('/api/workers', requireAuth, requireRole('manager'), (_req, res) => {
    listWorkers()
      .then((workers) => res.json({ workers }))
      .catch(() => res.status(500).json({ message: 'Failed to load workers.' }));
  });

  app.get('/api/users', requireAuth, requireRole('manager'), (_req, res) => {
    listUsers()
      .then((users) => res.json({ users }))
      .catch(() => res.status(500).json({ message: 'Failed to load users.' }));
  });

  app.post('/api/users', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = createUserSchema.parse(req.body);
      const passwordHash = await bcrypt.hash(payload.password, 12);
      const user = await createUser({
        username: payload.username,
        firstName: payload.firstName,
        lastName: payload.lastName,
        role: payload.role,
        passwordHash,
        shopId: payload.shopId ?? null,
      });
      res.status(201).json({ user });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A user with that username already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to create user.' });
    }
  });

  app.patch('/api/users/:id/shop', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = assignUserShopSchema.parse(req.body);
      const user = await assignUserShop(params.id, payload.shopId);
      if (!user) {
        res.status(404).json({ message: 'User not found.' });
        return;
      }
      res.json({ user });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update assigned shop.' });
    }
  });

  app.get('/api/checkin/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as AuthorizedRequest).user;
      const status = await getWorkerCheckInStatus(user.id);
      res.json({ status });
    } catch {
      res.status(500).json({ message: 'Failed to load check-in status.' });
    }
  });

  app.put('/api/checkin/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as AuthorizedRequest).user;
      if (user.role !== 'worker') {
        res.status(403).json({ message: 'Only workers can change check-in status.' });
        return;
      }
      const payload = updateCheckInStatusSchema.parse(req.body);
      const status = await upsertWorkerCheckInStatus({
        workerId: user.id,
        workerDisplayName: user.fullName,
        status: payload.status,
      });
      res.json({ status });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update check-in status.' });
    }
  });

  app.get('/api/tasks', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as AuthorizedRequest).user;
      const tasks = await listTasks();
      const visibleTasks = user.role === 'manager' ? tasks : tasks.filter((task) => task.assigneeId === user.id);
      res.json({ tasks: visibleTasks });
    } catch {
      res.status(500).json({ message: 'Failed to load tasks.' });
    }
  });

  app.post('/api/tasks', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = createTaskSchema.parse(req.body);
      const assignee = await findWorkerById(payload.assigneeId);
      if (!assignee) {
        res.status(400).json({ message: 'Assignee was not found.' });
        return;
      }

      const manager = (req as AuthorizedRequest).user;
      const created = await createTask({
        title: payload.title,
        assigneeId: assignee.id,
        assigneeDisplayName: assignee.fullName,
        createdById: manager.id,
        createdByDisplayName: manager.fullName,
        deadlineAt: payload.deadlineAt ?? null,
        requiresPhotoConfirmation: payload.requiresPhotoConfirmation ?? false,
      });
      res.status(201).json({ task: created });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create task.' });
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
        res.status(404).json({ message: 'Task not found.' });
        return;
      }
      if (user.role === 'worker' && target.assigneeId !== user.id) {
        res.status(403).json({ message: 'Not enough permissions.' });
        return;
      }
      if (user.role === 'worker' && payload.status === 'open') {
        res.status(403).json({ message: 'Worker cannot reopen task.' });
        return;
      }
      if (payload.status === 'done' && target.requiresPhotoConfirmation && !payload.photoConfirmationUrl && !target.photoConfirmationUrl) {
        res.status(400).json({ message: 'Photo confirmation is required for this task.' });
        return;
      }
      const updated = await updateTaskStatus(params.id, payload.status, payload.photoConfirmationUrl);
      if (!updated) {
        res.status(404).json({ message: 'Task not found.' });
        return;
      }
      res.json({ task: updated });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update task.' });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await deleteTask(params.id);
      if (!removed) {
        res.status(404).json({ message: 'Task not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete task.' });
    }
  });

  app.get('/api/support', requireAuth, async (_req, res) => {
    listSupportThreads()
      .then((threads) => res.json({ threads }))
      .catch(() => res.status(500).json({ message: 'Failed to load support threads.' }));
  });

  app.post('/api/support', requireAuth, async (req: Request, res: Response) => {
    try {
      const payload = createSupportThreadSchema.parse(req.body);
      const user = (req as AuthorizedRequest).user;
      const thread = await createSupportThread({
        category: payload.category,
        subject: payload.subject,
        body: payload.body,
        photoUrl: payload.photoUrl,
        createdById: user.id,
        createdByDisplayName: user.fullName,
      });
      res.status(201).json({ thread });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create support thread.' });
    }
  });

  app.post('/api/support/:id/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = createSupportMessageSchema.parse(req.body);
      const user = (req as AuthorizedRequest).user;
      const message = await addSupportMessage(params.id, {
        authorId: user.id,
        authorDisplayName: user.fullName,
        body: payload.body,
        photoUrl: payload.photoUrl,
      });
      if (!message) {
        res.status(404).json({ message: 'Support thread not found.' });
        return;
      }
      res.status(201).json({ message });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to send support message.' });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found in Russia service.' });
  });

  return app;
};
