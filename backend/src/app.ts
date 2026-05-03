import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { signSessionToken } from './auth';
import { getWorkerCheckInStatus, upsertWorkerCheckInStatus } from './checkInStore';
import { config } from './config';
import { AuthorizedRequest, requireAuth, requireRole } from './middleware';
import { getOrderSheet, listOrderSheetValues, upsertOrderSheetValue } from './orderSheetStore';
import { createSellerOrder, listSellerOrders } from './ordersStore';
import {
  createProduct,
  createShop,
  deleteShop,
  deleteProduct,
  getShopById,
  getStockTable,
  listShops,
  updateShopMachine,
  updateProductMeta,
  upsertStockValue,
} from './store';
import { addSupportMessage, createSupportThread, listSupportThreads } from './supportStore';
import { createTask, deleteTask, listTasks, updateTaskStatus } from './taskStore';
import { assignUserShop, createUser, findUserByUsername, findWorkerById, listUsers, listWorkers } from './userStore';
import {
  assignUserShopSchema,
  createRowSchema,
  createShopSchema,
  createSupportMessageSchema,
  createSupportThreadSchema,
  createTaskSchema,
  createUserSchema,
  createSellerOrderSchema,
  orderSheetQuerySchema,
  idParamSchema,
  listStockTableQuerySchema,
  loginSchema,
  updateShopMachineSchema,
  updateCheckInStatusSchema,
  updateProductMetaSchema,
  updateTaskStatusSchema,
  upsertOrderSheetValueSchema,
  upsertStockValueSchema,
} from './validation';

const toValidationMessage = (error: ZodError): string => error.issues.map((issue) => issue.message).join(' ');

const toStringParam = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const createApp = () => {
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
    res.json({ ok: true });
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
    const user = (req as AuthorizedRequest).user;
    res.json({ user });
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
      if (payload.shopId) {
        const shop = await getShopById(payload.shopId);
        if (!shop) {
          res.status(400).json({ message: 'Selected shop was not found.' });
          return;
        }
      }

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

      if (payload.shopId) {
        const shop = await getShopById(payload.shopId);
        if (!shop) {
          res.status(400).json({ message: 'Selected shop was not found.' });
          return;
        }
      }

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

  app.get('/api/shops', requireAuth, async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedRequest).user;
      if (viewer.role === 'worker') {
        if (!viewer.shopId) {
          res.json({ shops: [] });
          return;
        }
        const shop = await getShopById(viewer.shopId);
        res.json({ shops: shop ? [shop] : [] });
        return;
      }

      const shops = await listShops();
      res.json({ shops });
    } catch {
      res.status(500).json({ message: 'Failed to load shops.' });
    }
  });

  app.post('/api/shops', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = createShopSchema.parse(req.body);
      const shop = await createShop(payload.name, payload.machineNumber);
      res.status(201).json({ shop });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A shop with that name already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to create shop.' });
    }
  });

  app.patch('/api/shops/:id/machine', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateShopMachineSchema.parse(req.body);
      const shop = await updateShopMachine(params.id, payload.machineNumber);
      if (!shop) {
        res.status(404).json({ message: 'Shop not found.' });
        return;
      }
      res.json({ shop });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update shop machine.' });
    }
  });

  app.delete('/api/shops/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await deleteShop(params.id);
      if (!removed) {
        res.status(404).json({ message: 'Shop not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete shop.' });
    }
  });

  app.get('/api/stock', requireAuth, async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedRequest).user;
      const query = listStockTableQuerySchema.parse({
        shopId: toStringParam(req.query.shopId),
        from: toStringParam(req.query.from),
        to: toStringParam(req.query.to),
        range: toStringParam(req.query.range),
      });
      const table = await getStockTable(viewer, query);
      if (!table) {
        res.status(404).json({ message: 'Stock table not found for selected shop.' });
        return;
      }
      res.json({ table });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load stock table.' });
    }
  });

  app.post('/api/stock/products', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = createRowSchema.parse(req.body);
      const product = await createProduct(payload.name, payload.category);
      res.status(201).json({ product });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A product with that name already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to create product.' });
    }
  });

  app.delete('/api/stock/products/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await deleteProduct(params.id);
      if (!removed) {
        res.status(404).json({ message: 'Product not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete product.' });
    }
  });

  app.patch('/api/stock/products/:id/meta', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateProductMetaSchema.parse(req.body);
      const updated = await updateProductMeta(params.id, payload);
      if (!updated) {
        res.status(404).json({ message: 'Product not found.' });
        return;
      }
      res.json({ product: updated });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update product settings.' });
    }
  });

  app.put('/api/stock/value', requireAuth, async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedRequest).user;
      const payload = upsertStockValueSchema.parse(req.body);
      const ok = await upsertStockValue(viewer, payload);
      if (!ok) {
        res.status(404).json({ message: 'Unable to update stock value.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update stock value.' });
    }
  });

  app.get('/api/stock/order-values', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const shopId = toStringParam(req.query.shopId);
      const from = toStringParam(req.query.from);
      const to = toStringParam(req.query.to);
      if (!shopId || !from || !to) {
        res.status(400).json({ message: 'shopId, from and to query params required.' });
        return;
      }
      const orderValues = await listOrderSheetValues(shopId, from, to);
      res.json({ orderValues });
    } catch {
      res.status(500).json({ message: 'Failed to load order values.' });
    }
  });

  app.put('/api/stock/order-values', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const { shopId, productId, orderDate, packs } = req.body as {
        shopId: string;
        productId: string;
        orderDate: string;
        packs: number;
      };
      if (!shopId || !productId || !orderDate || typeof packs !== 'number') {
        res.status(400).json({ message: 'shopId, productId, orderDate, and packs required.' });
        return;
      }
      const ok = await upsertOrderSheetValue({
        shopId,
        productId,
        date: orderDate,
        value: packs > 0 ? String(packs) : '',
      });
      if (!ok) {
        res.status(404).json({ message: 'Unable to update order value.' });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ message: 'Failed to update order value.' });
    }
  });

  app.get('/api/orders', requireAuth, async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedRequest).user;
      const orders = await listSellerOrders(viewer);
      res.json({ orders });
    } catch {
      res.status(500).json({ message: 'Failed to load seller orders.' });
    }
  });

  app.post('/api/orders', requireAuth, async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedRequest).user;
      const payload = createSellerOrderSchema.parse(req.body);
      if (viewer.role === 'worker' && viewer.shopId && viewer.shopId !== payload.shopId) {
        res.status(403).json({ message: 'Not enough permissions for selected shop.' });
        return;
      }
      const order = await createSellerOrder(viewer, payload);
      if (!order) {
        res.status(404).json({ message: 'Unable to create order for selected product/shop.' });
        return;
      }
      res.status(201).json({ order });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create seller order.' });
    }
  });

  app.get('/api/orders/sheet', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const query = orderSheetQuerySchema.parse({ date: req.query.date });
      const sheet = await getOrderSheet(query.date);
      res.json({ sheet });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load order sheet.' });
    }
  });

  app.put('/api/orders/sheet/value', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = upsertOrderSheetValueSchema.parse(req.body);
      const ok = await upsertOrderSheetValue(payload);
      if (!ok) {
        res.status(404).json({ message: 'Unable to update order sheet value.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update order sheet value.' });
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
    try {
      const threads = await listSupportThreads();
      res.json({ threads });
    } catch {
      res.status(500).json({ message: 'Failed to load support threads.' });
    }
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
    res.status(404).json({ message: 'Route not found.' });
  });

  return app;
};
