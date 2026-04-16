import { NextFunction, Request, Response } from 'express';
import { verifySessionToken } from './auth';
import { Role, SessionUser } from './types';

export type AuthorizedRequest = Request & {
  user: SessionUser;
};

const getBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: 'Требуется авторизация.' });
    return;
  }
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({ message: 'Недействительный токен.' });
    return;
  }
  (req as AuthorizedRequest).user = user;
  next();
};

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthorizedRequest).user;
  if (!user || !roles.includes(user.role)) {
    res.status(403).json({ message: 'Недостаточно прав.' });
    return;
  }
  next();
};
