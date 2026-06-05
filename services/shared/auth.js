const path = require('path');
const jwt = require(require.resolve('jsonwebtoken', {
  paths: [
    path.resolve(__dirname, '../ru-backend/node_modules'),
    path.resolve(__dirname, '../dubai-backend/node_modules'),
    path.resolve(__dirname, '../ru-backend'),
    path.resolve(__dirname, '../dubai-backend'),
    process.cwd(),
  ],
}));
const { createPublicKey, randomUUID } = require('crypto');

const DEFAULT_PERSONAL_CLAIM_KEYS = [
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
];

exports.defaultManagerScopes = ['shops:read', 'shops:write', 'stock:read', 'stock:write', 'products:write', 'orders:read', 'orders:write'];
exports.defaultWorkerScopes = ['shops:read', 'stock:read', 'stock:write', 'orders:read', 'orders:write'];

exports.createAuthKit = ({ config, managerScopes = exports.defaultManagerScopes, workerScopes = exports.defaultWorkerScopes, personalClaimKeys = DEFAULT_PERSONAL_CLAIM_KEYS }) => {
  const personalOpsClaimKeys = new Set(personalClaimKeys);

  const assertOpsClaimsContainNoPersonalData = (claims) => {
    for (const key of Object.keys(claims)) {
      if (personalOpsClaimKeys.has(key)) {
        throw new Error(`Ops token claim "${key}" would leak personal data.`);
      }
    }
  };

  const signSessionToken = (user) =>
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

  const signOpsToken = (user) => {
    const claims = {
      role: user.role,
      shopIds: user.role === 'manager' ? [] : user.shopId ? [user.shopId] : [],
      scopes: user.role === 'manager' ? [...managerScopes] : [...workerScopes],
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

  const verifySessionToken = (token) => {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        issuer: 'stock-app-backend',
        audience: 'stock-app-frontend',
      });

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

  const verifyOpsToken = (token) => {
    try {
      const decoded = jwt.verify(token, config.opsTokenPublicKey || config.opsJwtSecret, {
        algorithms: config.opsTokenPublicKey ? ['RS256'] : ['HS256'],
        issuer: 'stock-app-ru',
        audience: 'stock-app-dubai',
      });

      if (
        (decoded.role !== 'manager' && decoded.role !== 'worker') ||
        !Array.isArray(decoded.shopIds) ||
        !Array.isArray(decoded.scopes) ||
        typeof decoded.jti !== 'string' ||
        !decoded.jti
      ) {
        return null;
      }

      assertOpsClaimsContainNoPersonalData(decoded);
      return {
        role: decoded.role,
        shopIds: decoded.shopIds.filter((shopId) => typeof shopId === 'string'),
        scopes: decoded.scopes.filter((scope) => typeof scope === 'string'),
        jti: decoded.jti,
      };
    } catch {
      return null;
    }
  };

  const getOpsJwks = () => {
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

  return {
    signSessionToken,
    signOpsToken,
    verifySessionToken,
    verifyOpsToken,
    getOpsJwks,
  };
};
