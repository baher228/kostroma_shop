import { config } from './config';
import { OpsScope, OpsTokenClaims, Role, SessionUser } from './types';
import { createAuthKit } from '../../shared/auth';

const managerScopes = [
  'shops:read',
  'shops:write',
  'stock:read',
  'stock:write',
  'products:write',
  'orders:read',
  'orders:write',
 ] as const satisfies readonly OpsScope[];

const workerScopes = ['shops:read', 'stock:read', 'stock:write', 'orders:read', 'orders:write'] as const satisfies readonly OpsScope[];

const authKit = createAuthKit<OpsScope, Role, SessionUser, OpsTokenClaims>({ config, managerScopes, workerScopes });

export const signSessionToken = authKit.signSessionToken;
export const signOpsToken = authKit.signOpsToken;
export const verifySessionToken = authKit.verifySessionToken;
export const verifyOpsToken = authKit.verifyOpsToken;
export const getOpsJwks = authKit.getOpsJwks;
