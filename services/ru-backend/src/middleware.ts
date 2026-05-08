import { NextFunction, Request, Response } from 'express';
import { verifyOpsToken, verifySessionToken } from './auth';
import { OpsScope, OpsTokenClaims, Role, SessionUser } from './types';

export type AuthorizedRequest = Request & {
  user: SessionUser;
};

export type AuthorizedOpsRequest = Request & {
  ops: OpsTokenClaims;
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

export const requireOpsAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: 'Dubai API authorization required.' });
    return;
  }
  const claims = verifyOpsToken(token);
  if (!claims) {
    res.status(401).json({ message: 'Invalid Dubai API token.' });
    return;
  }
  (req as AuthorizedOpsRequest).ops = claims;
  next();
};

export const requireOpsScope = (...scopes: OpsScope[]) => (req: Request, res: Response, next: NextFunction) => {
  const claims = (req as AuthorizedOpsRequest).ops;
  if (!claims || !scopes.every((scope) => claims.scopes.includes(scope))) {
    res.status(403).json({ message: 'Not enough Dubai API permissions.' });
    return;
  }
  next();
};

export const requireOpsRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  const claims = (req as AuthorizedOpsRequest).ops;
  if (!claims || !roles.includes(claims.role)) {
    res.status(403).json({ message: 'Not enough Dubai API permissions.' });
    return;
  }
  next();
};
