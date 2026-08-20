import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { toValidationMessage } from '../http/http';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import {
  assignManagedUserShop,
  createManagedUser,
  deleteManagedUser,
  getStoreTablets,
  getUsers,
  getWorkers,
  resetManagedUserPassword,
  updateManagedUser,
} from '../services/userService';
import {
  assignUserShopSchema,
  createUserSchema,
  idParamSchema,
  updateUserPasswordSchema,
  updateUserSchema,
} from '../http/validation';

export const registerUserRoutes = (app: Express) => {
  app.get('/api/store-tablets', requireAuth, requireRole('manager'), (_req, res) => {
    getStoreTablets()
      .then((storeTablets) => res.json({ storeTablets }))
      .catch(() => res.status(500).json({ message: 'Failed to load store tablets.' }));
  });

  app.get('/api/workers', requireAuth, requireRole('manager'), (_req, res) => {
    getWorkers()
      .then((workers) => res.json({ workers }))
      .catch(() => res.status(500).json({ message: 'Failed to load workers.' }));
  });

  app.get('/api/users', requireAuth, requireRole('manager'), (_req, res) => {
    getUsers()
      .then((users) => res.json({ users }))
      .catch(() => res.status(500).json({ message: 'Failed to load users.' }));
  });

  app.post('/api/users', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = createUserSchema.parse(req.body);
      const user = await createManagedUser(payload);
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
      const user = await assignManagedUserShop(params.id, payload);
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

  app.patch('/api/users/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateUserSchema.parse(req.body);
      const user = await updateManagedUser(params.id, payload);
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
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A user with that username already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to update user.' });
    }
  });

  app.patch('/api/users/:id/password', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateUserPasswordSchema.parse(req.body);
      const updated = await resetManagedUserPassword(params.id, payload);
      if (!updated) {
        res.status(404).json({ message: 'User not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update user password.' });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const currentUser = (req as AuthorizedRequest).user;
      const result = await deleteManagedUser(currentUser, params.id);
      if (result === 'self') {
        res.status(400).json({ message: 'You cannot delete your own admin account while logged in.' });
        return;
      }
      if (result === 'not_found') {
        res.status(404).json({ message: 'User not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete user.' });
    }
  });
};
