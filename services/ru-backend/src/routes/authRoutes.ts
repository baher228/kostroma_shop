import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { toValidationMessage } from '../http/http';
import { AuthorizedRequest, requireAuth } from '../auth/middleware';
import { createOpsTokenForUser, getOpsPublicKeys, loginUser } from '../services/authService';
import { loginSchema } from '../http/validation';

export const registerAuthRoutes = (app: Express) => {
  app.get('/api/auth/ops-jwks', (_req, res) => {
    res.json(getOpsPublicKeys());
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const payload = loginSchema.parse(req.body);
      const session = await loginUser(payload);
      if (!session) {
        res.status(401).json({ message: 'Invalid username or password.' });
        return;
      }
      res.json(session);
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
    const token = createOpsTokenForUser((req as AuthorizedRequest).user);
    res.json({ token });
  });
};
