import jwt from 'jsonwebtoken';
import { config } from './config';
import { Role, SessionUser } from './types';

type TokenPayload = {
  sub: string;
  username: string;
  displayName: string;
  role: Role;
};

export const signSessionToken = (user: SessionUser): string =>
  jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    config.jwtSecret,
    {
      expiresIn: '12h',
      issuer: 'stock-app-backend',
      audience: 'stock-app-frontend',
    },
  );

export const verifySessionToken = (token: string): SessionUser | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: 'stock-app-backend',
      audience: 'stock-app-frontend',
    }) as TokenPayload;

    if (!decoded.sub || !decoded.username || !decoded.displayName || !decoded.role) {
      return null;
    }

    return {
      id: decoded.sub,
      username: decoded.username,
      displayName: decoded.displayName,
      role: decoded.role,
    };
  } catch {
    return null;
  }
};
