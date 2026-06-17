import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { toValidationMessage } from '../http/http';
import { AuthorizedRequest, requireAuth } from '../auth/middleware';
import { addUserSupportMessage, createUserSupportThread, getVisibleSupportThreads } from '../services/supportService';
import { createSupportMessageSchema, createSupportThreadSchema, idParamSchema } from '../http/validation';

export const registerSupportRoutes = (app: Express) => {
  app.get('/api/support', requireAuth, async (req: Request, res: Response) => {
    const user = (req as AuthorizedRequest).user;
    getVisibleSupportThreads(user)
      .then((threads) => res.json({ threads }))
      .catch(() => res.status(500).json({ message: 'Failed to load support threads.' }));
  });

  app.post('/api/support', requireAuth, async (req: Request, res: Response) => {
    try {
      const payload = createSupportThreadSchema.parse(req.body);
      const user = (req as AuthorizedRequest).user;
      const thread = await createUserSupportThread(user, payload);
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
      const result = await addUserSupportMessage(user, params.id, payload);
      if (result === 'not_found') {
        res.status(404).json({ message: 'Support thread not found.' });
        return;
      }
      if (result === 'forbidden') {
        res.status(403).json({ message: 'Not enough permissions.' });
        return;
      }
      res.status(201).json({ message: result.message });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to send support message.' });
    }
  });
};
