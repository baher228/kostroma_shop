import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthorizedOpsRequest, requireOpsRole, requireOpsScope } from '../auth/middleware';
import { changeShopMachine, createShopForManager, getVisibleShops, removeShop, updateShopDetails } from '../services/shopService';
import { toValidationMessage } from '../http/http';
import { createShopSchema, idParamSchema, updateShopMachineSchema, updateShopSchema } from '../http/validation';

export const registerShopRoutes = (app: Express) => {
  app.get('/api/shops', requireOpsScope('shops:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const shops = await getVisibleShops(viewer);
      res.json({ shops });
    } catch {
      res.status(500).json({ message: 'Failed to load shops.' });
    }
  });

  app.post('/api/shops', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const payload = createShopSchema.parse(req.body);
      const shop = await createShopForManager(payload);
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

  app.patch('/api/shops/:id/machine', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateShopMachineSchema.parse(req.body);
      const shop = await changeShopMachine(params.id, payload);
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

  app.patch('/api/shops/:id', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateShopSchema.parse(req.body);
      const shop = await updateShopDetails(params.id, payload);
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
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A shop with that name already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to update shop.' });
    }
  });

  app.delete('/api/shops/:id', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await removeShop(params.id);
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
};
