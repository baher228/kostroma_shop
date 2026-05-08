import jwt from 'jsonwebtoken';
import { createPublicKey, randomUUID } from 'crypto';
import { config } from './config';
import { OpsScope, OpsTokenClaims, Role, SessionUser } from './types';

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

const PERSONAL_OPS_CLAIM_KEYS = new Set([
  'sub',
  'userId',
  'username',
  'firstName',
  'lastName',
  'fullName',
  'displayName',
  'workerId',
  'workerDisplayName',
  'shopName',
]);

type RawOpsTokenPayload = OpsTokenClaims & {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
};

const managerScopes: OpsScope[] = [
  'shops:read',
  'shops:write',
  'stock:read',
  'stock:write',
  'products:write',
  'orders:read',
  'orders:write',
];

const workerScopes: OpsScope[] = ['shops:read', 'stock:read', 'stock:write', 'orders:read', 'orders:write'];

const assertOpsClaimsContainNoPersonalData = (claims: Record<string, unknown>) => {
  for (const key of Object.keys(claims)) {
    if (PERSONAL_OPS_CLAIM_KEYS.has(key)) {
      throw new Error(`Ops token claim "${key}" would leak personal data.`);
    }
  }
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

export const signOpsToken = (user: SessionUser): string => {
  const claims: OpsTokenClaims = {
    role: user.role,
    shopIds: user.role === 'manager' ? [] : user.shopId ? [user.shopId] : [],
    scopes: user.role === 'manager' ? managerScopes : workerScopes,
    jti: randomUUID(),
  };
  assertOpsClaimsContainNoPersonalData(claims);

  if (config.opsTokenPrivateKey) {
    return jwt.sign(claims, config.opsTokenPrivateKey, {
      algorithm: 'RS256',
      expiresIn: '15m',
      issuer: 'stock-app-ru',
      audience: 'stock-app-dubai',
      keyid: config.opsTokenKeyId,
    });
  }

  return jwt.sign(claims, config.opsJwtSecret, {
    algorithm: 'HS256',
    expiresIn: '15m',
    issuer: 'stock-app-ru',
    audience: 'stock-app-dubai',
  });
};

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

export const verifyOpsToken = (token: string): OpsTokenClaims | null => {
  try {
    const decoded = jwt.verify(token, config.opsTokenPublicKey || config.opsJwtSecret, {
      algorithms: config.opsTokenPublicKey ? ['RS256'] : ['HS256'],
      issuer: 'stock-app-ru',
      audience: 'stock-app-dubai',
    }) as RawOpsTokenPayload;

    if (
      (decoded.role !== 'manager' && decoded.role !== 'worker') ||
      !Array.isArray(decoded.shopIds) ||
      !Array.isArray(decoded.scopes) ||
      typeof decoded.jti !== 'string' ||
      !decoded.jti
    ) {
      return null;
    }

    assertOpsClaimsContainNoPersonalData(decoded as Record<string, unknown>);
    return {
      role: decoded.role,
      shopIds: decoded.shopIds.filter((shopId) => typeof shopId === 'string'),
      scopes: decoded.scopes.filter((scope): scope is OpsScope => typeof scope === 'string') as OpsScope[],
      jti: decoded.jti,
    };
  } catch {
    return null;
  }
};

export const getOpsJwks = () => {
  if (!config.opsTokenPublicKey) {
    return { keys: [] };
  }
  const jwk = createPublicKey(config.opsTokenPublicKey).export({ format: 'jwk' });
  return {
    keys: [
      {
        ...jwk,
        kid: config.opsTokenKeyId,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
};
