export interface AuthConfig {
  jwtSecret: string;
  opsJwtSecret: string;
  opsTokenPrivateKey?: string;
  opsTokenPublicKey?: string;
  opsTokenKeyId: string;
}

export interface BaseSessionUser<R extends string = string> {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: R;
  shopId?: string | null;
  shopName?: string | null;
}

export interface BaseOpsTokenClaims<S extends string = string, R extends string = string> {
  role: R;
  shopIds: string[];
  scopes: S[];
  jti: string;
}

export declare const defaultManagerScopes: readonly string[];
export declare const defaultWorkerScopes: readonly string[];

export declare function createAuthKit<
  S extends string,
  R extends string,
  U extends BaseSessionUser<R>,
  C extends BaseOpsTokenClaims<S, R>
>(options: {
  config: AuthConfig;
  managerScopes: readonly S[];
  workerScopes: readonly S[];
  personalClaimKeys?: readonly string[];
}): {
  signSessionToken: (user: U) => string;
  signOpsToken: (user: U) => string;
  verifySessionToken: (token: string) => U | null;
  verifyOpsToken: (token: string) => C | null;
  getOpsJwks: () => { keys: Record<string, unknown>[] };
};
