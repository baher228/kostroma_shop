import { NextFunction, Request, Response } from 'express';
import { verifyOpsToken, verifySessionToken } from './auth';
import { OpsScope, OpsTokenClaims, Role, SessionUser } from './types';
import { findUserById } from './userStore';

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

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
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
  try {
    const freshUser = await findUserById(user.id);
    if (!freshUser) {
      res.status(401).json({ message: 'ÐÐµÐ´ÐµÐ¹ÑÑ‚Ð²Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹ Ñ‚Ð¾ÐºÐµÐ½.' });
      return;
    }
    (req as AuthorizedRequest).user = freshUser;
    next();
  } catch {
    res.status(500).json({ message: 'Server error.' });
  }
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
