import jwt from 'jsonwebtoken';
import { config } from './config';
import { Role, SessionUser } from './types';

type TokenPayload = {
  sub: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  shopId?: string | null;
  shopName?: string | null;
};

export const signSessionToken = (user: SessionUser): string =>
  jwt.sign(
    {
      sub: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: user.role,
      shopId: user.shopId ?? null,
      shopName: user.shopName ?? null,
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

    if (!decoded.sub || !decoded.username || !decoded.firstName || !decoded.lastName || !decoded.fullName || !decoded.role) {
      return null;
    }

    return {
      id: decoded.sub,
      username: decoded.username,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      fullName: decoded.fullName,
      role: decoded.role,
      shopId: decoded.shopId ?? null,
      shopName: decoded.shopName ?? null,
    };
  } catch {
    return null;
  }
};
