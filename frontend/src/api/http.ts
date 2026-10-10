const LEGACY_API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000').replace(/\/+$/, '');
const RU_API_BASE_URL = (process.env.EXPO_PUBLIC_RU_API_URL || LEGACY_API_BASE_URL).replace(/\/+$/, '');
const DXB_API_BASE_URL = (process.env.EXPO_PUBLIC_DXB_API_URL || process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4001').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
};

type CachedOpsToken = {
  token: string;
  expiresAt: number;
};

const REQUEST_TIMEOUT_MS = 15_000;
const opsTokenCache = new Map<string, CachedOpsToken>();

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Сервер не ответил. Проверьте интернет и попробуйте снова.', 0);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const isDubaiPath = (path: string): boolean =>
  path.startsWith('/api/shops') || path.startsWith('/api/stock') || path.startsWith('/api/orders');

const parseJwtExp = (token: string): number => {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return 0;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const fetchOpsToken = async (ruToken: string): Promise<string> => {
  const cached = opsTokenCache.get(ruToken);
  if (cached && cached.expiresAt - Date.now() > 30_000) {
    return cached.token;
  }

  const response = await fetchWithTimeout(`${RU_API_BASE_URL}/api/auth/ops-token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ruToken}`,
    },
  });
  const parsed = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
  if (!response.ok || !parsed?.token) {
    throw new ApiError(parsed?.message || 'Failed to authorize Dubai API request.', response.status);
  }

  const token = parsed.token;
  opsTokenCache.set(ruToken, { token, expiresAt: parseJwtExp(token) || Date.now() + 14 * 60_000 });
  return token;
};

const makeRequest = async <T>(
  baseUrl: string,
  path: string,
  options: RequestOptions,
  bearerToken?: string,
): Promise<T> => {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.formData ? {} : { 'Content-Type': 'application/json' }),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
  }, options.timeoutMs);

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
    throw new ApiError(parsed?.message || 'Ошибка запроса.', response.status);
  }

  return (parsed ?? {}) as T;
};

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  if (isDubaiPath(path) && options.token) {
    try {
      const opsToken = await fetchOpsToken(options.token);
      return await makeRequest<T>(DXB_API_BASE_URL, path, options, opsToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        opsTokenCache.delete(options.token);
        const refreshed = await fetchOpsToken(options.token);
        return makeRequest<T>(DXB_API_BASE_URL, path, options, refreshed);
      }
      throw error;
    }
  }

  return makeRequest<T>(RU_API_BASE_URL, path, options, options.token);
};
