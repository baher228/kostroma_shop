import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  getAllWorkerCheckInStatuses,
  getCheckInEvents,
  getCheckInSummary,
  getOwnCheckInStatus,
  updateOwnCheckInStatus,
} from '../services/checkInService';
import { defaultCheckInRange, toStringParam, toValidationMessage } from '../http/http';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import { checkInStatsQuerySchema, updateCheckInStatusSchema } from '../http/validation';

export const registerCheckInRoutes = (app: Express) => {
  app.get('/api/checkin/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as AuthorizedRequest).user;
      const status = await getOwnCheckInStatus(user);
      res.json({ status });
    } catch {
      res.status(500).json({ message: 'Failed to load check-in status.' });
    }
  });

  app.get('/api/checkin/statuses', requireAuth, requireRole('manager'), async (_req: Request, res: Response) => {
    try {
      const statuses = await getAllWorkerCheckInStatuses();
      res.json({ statuses });
    } catch {
      res.status(500).json({ message: 'Failed to load check-in statuses.' });
    }
  });

  app.get('/api/checkin/events', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const defaults = defaultCheckInRange();
      const query = checkInStatsQuerySchema.parse({
        from: toStringParam(req.query.from) ?? defaults.from,
        to: toStringParam(req.query.to) ?? defaults.to,
        shopId: toStringParam(req.query.shopId),
      });
      const events = await getCheckInEvents({ from: query.from ?? defaults.from, to: query.to ?? defaults.to, shopId: query.shopId });
      res.json({ events });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load check-in events.' });
    }
  });

  app.get('/api/checkin/stats', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const defaults = defaultCheckInRange();
      const query = checkInStatsQuerySchema.parse({
        from: toStringParam(req.query.from) ?? defaults.from,
        to: toStringParam(req.query.to) ?? defaults.to,
        shopId: toStringParam(req.query.shopId),
      });
      const stats = await getCheckInSummary({ from: query.from ?? defaults.from, to: query.to ?? defaults.to, shopId: query.shopId });
      res.json({ stats });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load check-in statistics.' });
    }
  });

  app.put('/api/checkin/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as AuthorizedRequest).user;
      const payload = updateCheckInStatusSchema.parse(req.body);
      const result = await updateOwnCheckInStatus(user, payload);
      if (!result) {
        res.status(403).json({ message: 'Only workers can change check-in status.' });
        return;
      }
      res.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update check-in status.' });
    }
  });
};
