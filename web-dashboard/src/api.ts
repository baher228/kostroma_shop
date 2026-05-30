import {
  CheckInStats,
  ManagedUser,
  OrderSheet,
  ProductPayload,
  SellerOrder,
  Session,
  SessionUser,
  Shop,
  StockTable,
} from './types';

const RU_API_BASE_URL = (import.meta.env.VITE_RU_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const DXB_API_BASE_URL = (import.meta.env.VITE_DXB_API_URL || 'http://localhost:4001').replace(/\/+$/, '');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
};

type CachedOpsToken = {
  token: string;
  expiresAt: number;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const opsTokenCache = new Map<string, CachedOpsToken>();

const parseJwtExp = (token: string): number => {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return 0;
    }
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const makeRequest = async <T>(baseUrl: string, path: string, options: RequestOptions, bearerToken?: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const parsed = text
    ? (() => {
        try {
          return JSON.parse(text) as { message?: string };
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new ApiError(parsed?.message || 'Request failed.', response.status);
  }

  return (parsed ?? {}) as T;
};

const fetchOpsToken = async (ruToken: string): Promise<string> => {
  const cached = opsTokenCache.get(ruToken);
  if (cached && cached.expiresAt - Date.now() > 30_000) {
    return cached.token;
  }
  const result = await makeRequest<{ token: string }>(RU_API_BASE_URL, '/api/auth/ops-token', { method: 'POST' }, ruToken);
  opsTokenCache.set(ruToken, { token: result.token, expiresAt: parseJwtExp(result.token) || Date.now() + 14 * 60_000 });
  return result.token;
};

const ruRequest = <T>(path: string, options: RequestOptions = {}) => makeRequest<T>(RU_API_BASE_URL, path, options, options.token);

const dxbRequest = async <T>(path: string, options: RequestOptions = {}) => {
  if (!options.token) {
    throw new ApiError('Missing session token.', 401);
  }
  try {
    const opsToken = await fetchOpsToken(options.token);
    return await makeRequest<T>(DXB_API_BASE_URL, path, options, opsToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      opsTokenCache.delete(options.token);
      const opsToken = await fetchOpsToken(options.token);
      return makeRequest<T>(DXB_API_BASE_URL, path, options, opsToken);
    }
    throw error;
  }
};

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
};

export const api = {
  login: async (username: string, password: string): Promise<Session> => {
    const result = await ruRequest<{ token: string; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: { username: username.trim().toLowerCase(), password },
    });
    if (result.user.role !== 'manager') {
      throw new ApiError('Доступ к панели разрешен только администратору.', 403);
    }
    if (result.user.username !== 'admin') {
      throw new ApiError('Доступ к панели разрешен только пользователю admin.', 403);
    }
    return result;
  },
  me: async (token: string): Promise<SessionUser> => {
    const result = await ruRequest<{ user: SessionUser }>('/api/auth/me', { token });
    return result.user;
  },
  users: {
    list: async (token: string) => (await ruRequest<{ users: ManagedUser[] }>('/api/users', { token })).users,
    create: async (
      token: string,
      payload: { username: string; firstName: string; lastName: string; password: string; role: string; shopId: string | null },
    ) => (await ruRequest<{ user: ManagedUser }>('/api/users', { method: 'POST', token, body: payload })).user,
    update: async (
      token: string,
      userId: string,
      payload: { username: string; firstName: string; lastName: string; role: string; shopId: string | null },
    ) => (await ruRequest<{ user: ManagedUser }>(`/api/users/${userId}`, { method: 'PATCH', token, body: payload })).user,
    resetPassword: async (token: string, userId: string, password: string) => {
      await ruRequest<{}>(`/api/users/${userId}/password`, { method: 'PATCH', token, body: { password } });
    },
    delete: async (token: string, userId: string) => {
      await ruRequest<{}>(`/api/users/${userId}`, { method: 'DELETE', token });
    },
  },
  shops: {
    list: async (token: string) => (await dxbRequest<{ shops: Shop[] }>('/api/shops', { token })).shops,
    create: async (token: string, payload: { name: string; machineNumber: number }) =>
      (await dxbRequest<{ shop: Shop }>('/api/shops', { method: 'POST', token, body: payload })).shop,
    update: async (token: string, shopId: string, payload: { name: string; machineNumber: number }) =>
      (await dxbRequest<{ shop: Shop }>(`/api/shops/${shopId}`, { method: 'PATCH', token, body: payload })).shop,
    delete: async (token: string, shopId: string) => {
      await dxbRequest<{}>(`/api/shops/${shopId}`, { method: 'DELETE', token });
    },
  },
  stock: {
    table: async (token: string, params: { shopId?: string; from?: string; to?: string; range?: 'week' | 'year' }) =>
      (await dxbRequest<{ table: StockTable }>(`/api/stock${query(params)}`, { token })).table,
    createProduct: async (token: string, payload: ProductPayload) =>
      (await dxbRequest<{ product: unknown }>('/api/stock/products', { method: 'POST', token, body: payload })).product,
    updateProduct: async (token: string, productId: string, payload: ProductPayload) =>
      (await dxbRequest<{ product: unknown }>(`/api/stock/products/${productId}`, { method: 'PATCH', token, body: payload })).product,
    deleteProduct: async (token: string, productId: string) => {
      await dxbRequest<{}>(`/api/stock/products/${productId}`, { method: 'DELETE', token });
    },
    updateValue: async (token: string, payload: { shopId: string; productId: string; date: string; value: string }) => {
      await dxbRequest<{}>('/api/stock/value', { method: 'PUT', token, body: payload });
    },
  },
  orders: {
    list: async (token: string) => (await dxbRequest<{ orders: SellerOrder[] }>('/api/orders', { token })).orders,
    sheet: async (token: string, date: string) =>
      (await dxbRequest<{ sheet: OrderSheet }>(`/api/orders/sheet?date=${date}`, { token })).sheet,
    create: async (
      token: string,
      payload: { shopId: string; productId: string; stockOnHand: number | null; requestedPacks: number; requestedUnits: number; autoSuggested: boolean },
    ) => (await dxbRequest<{ order: SellerOrder }>('/api/orders', { method: 'POST', token, body: payload })).order,
    updateStatus: async (token: string, orderId: string, status: 'new' | 'processed') =>
      (await dxbRequest<{ order: SellerOrder }>(`/api/orders/${orderId}/status`, { method: 'PATCH', token, body: { status } })).order,
  },
  checkin: {
    stats: async (token: string, from: string, to: string) =>
      (await ruRequest<{ stats: CheckInStats }>(`/api/checkin/stats${query({ from, to })}`, { token })).stats,
  },
};
