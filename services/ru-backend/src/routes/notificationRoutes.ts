import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import { toValidationMessage } from '../http/http';
import { pushTokenSchema } from '../http/validation';
import { registerWorkerPushToken, removeWorkerPushToken } from '../services/notificationService';

export const registerNotificationRoutes = (app: Express) => {
  app.put('/api/notifications/push-token', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
    try {
      const { pushToken } = pushTokenSchema.parse(req.body);
      await registerWorkerPushToken((req as AuthorizedRequest).user.id, pushToken);
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to save notification device.' });
    }
  });

  app.delete('/api/notifications/push-token', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
    try {
      const { pushToken } = pushTokenSchema.parse(req.body);
      await removeWorkerPushToken((req as AuthorizedRequest).user.id, pushToken);
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to remove notification device.' });
    }
  });
};
