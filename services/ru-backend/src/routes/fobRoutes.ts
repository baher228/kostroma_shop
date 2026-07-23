import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthorizedRequest, requireAuth } from '../auth/middleware';
import { fobScanSchema } from '../http/validation';
import { toValidationMessage } from '../http/http';
import { createOwnFobChallenge, getOwnFobStatus, scanFobChallenge } from '../services/fobService';
import { FobScanError } from '../repositories/fobRepository';

export const registerFobRoutes = (app: Express) => {
  app.get('/api/fob/me', requireAuth, async (req: Request, res: Response) => {
    const user = (req as AuthorizedRequest).user;
    if (user.role !== 'worker') {
      res.status(403).json({ message: 'Only workers can load FOB status.' });
      return;
    }
    try {
      res.json({ status: await getOwnFobStatus(user) });
    } catch {
      res.status(500).json({ message: 'Failed to load FOB status.' });
    }
  });

  app.post('/api/fob/challenges', requireAuth, async (req: Request, res: Response) => {
    try {
      const challenge = await createOwnFobChallenge((req as AuthorizedRequest).user);
      if (!challenge) {
        res.status(403).json({ message: 'Only workers can create FOB QR codes.' });
        return;
      }
      res.status(201).json({ challenge });
    } catch {
      res.status(500).json({ message: 'Failed to create FOB QR code.' });
    }
  });

  app.post('/api/fob/scans', requireAuth, async (req: Request, res: Response) => {
    try {
      const body = fobScanSchema.parse(req.body);
      const result = await scanFobChallenge((req as AuthorizedRequest).user, body.payload);
      if (!result) {
        res.status(403).json({ message: 'Only store tablets can scan FOB QR codes.' });
        return;
      }
      res.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      if (error instanceof FobScanError) {
        const status = error.reason === 'wrong_shop' ? 403 : 400;
        const messages: Record<string, string> = {
          invalid_qr: 'Invalid FOB QR code.',
          expired_or_used: 'FOB QR code expired or was already used.',
          wrong_shop: 'Worker is not assigned to this store.',
          tablet_unassigned: 'This tablet is not assigned to a store.',
        };
        res.status(status).json({ message: messages[error.reason] });
        return;
      }
      res.status(500).json({ message: 'Failed to scan FOB QR code.' });
    }
  });
};
