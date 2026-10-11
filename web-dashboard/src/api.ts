import {
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecordingsPage,
  CheckInStats,
  BusinessCategory,
  ManagedUser,
  OrderSheet,
  OrderValueEntry,
  ProductPayload,
  QcAnalysis,
  QcAudioInfo,
  QcOverview,
  QcSession,
  QcStatus,
  QcTranscript,
  QcTrendPoint,
  PromotionDocument,
  PromotionDocumentType,
  PromotionRowPayload,
  PromotionTableRow,
  PromotionTablePreview,
  PromotionBatchRequest,
  PromotionOutputs,
  GmailHealth,
  GmailImport,
  SellerOrder,
  Session,
  SessionUser,
  Shop,
  StockTable,
  Task,
  TaskStatus,
  StoreTablet,
} from './types';
import { downloadFileName } from './downloadFileName';

const RU_API_BASE_URL = (import.meta.env.VITE_RU_API_URL || '/ru').replace(/\/+$/, '');
const DXB_API_BASE_URL = (import.meta.env.VITE_DXB_API_URL || '/dxb').replace(/\/+$/, '');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
  timeoutMs?: number;
};

type CachedOpsToken = {
  token: string;
  expiresAt: number;
};

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const opsTokenCache = new Map<string, CachedOpsToken>();
const REQUEST_TIMEOUT_MS = 15_000;

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

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Сервер не ответил. Проверьте интернет и попробуйте снова.', 0);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

const makeRequest = async <T>(baseUrl: string, path: string, options: RequestOptions, bearerToken?: string): Promise<T> => {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }, options.timeoutMs);

  const text = await response.text();
  const parsed = text
    ? (() => {
        try {
          return JSON.parse(text) as { message?: string; code?: string };
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new ApiError(parsed?.message || 'Request failed.', response.status, parsed?.code ?? null);
  }

  return (parsed ?? {}) as T;
};

const makeFormRequest = async <T>(baseUrl: string, path: string, form: FormData, bearerToken: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: form,
  });
  const parsed = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new ApiError(parsed?.message || 'Request failed.', response.status);
  }
  return (parsed ?? {}) as T;
};

const makeBlobRequest = async (baseUrl: string, path: string, bearerToken: string): Promise<Blob> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'text/csv',
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(parsed?.message || 'Request failed.', response.status);
  }
  return response.blob();
};

const makeImageBlobRequest = async (baseUrl: string, path: string, bearerToken: string): Promise<Blob> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'image/*',
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(parsed?.message || 'Request failed.', response.status);
  }
  return response.blob();
};

const makeDownloadBlobRequest = async (
  baseUrl: string,
  path: string,
  bearerToken: string,
  selectedDocumentFileName?: string,
  options: Pick<RequestOptions, 'method' | 'body'> = {},
): Promise<{ blob: Blob; fileName: string; count: number | null; skippedCount: number | null; pageCount: number | null }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: {
      Accept: '*/*',
      Authorization: `Bearer ${bearerToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(parsed?.message || 'Request failed.', response.status);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const numberHeader = (name: string) => {
    const value = response.headers.get(name);
    return value !== null && Number.isFinite(Number(value)) ? Number(value) : null;
  };
  return {
    blob: await response.blob(),
    fileName: downloadFileName(disposition, response.headers.get('Content-Type'), selectedDocumentFileName),
    count: numberHeader('X-Price-Tags-Count'),
    skippedCount: numberHeader('X-Price-Tags-Skipped-Count'),
    pageCount: numberHeader('X-Price-Tags-Page-Count'),
  };
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

const dxbFormRequest = async <T>(path: string, token: string, form: FormData) => {
  try {
    const opsToken = await fetchOpsToken(token);
    return await makeFormRequest<T>(DXB_API_BASE_URL, path, form, opsToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      opsTokenCache.delete(token);
      const opsToken = await fetchOpsToken(token);
      return makeFormRequest<T>(DXB_API_BASE_URL, path, form, opsToken);
    }
    throw error;
  }
};

const dxbBlobRequest = async (path: string, token: string) => {
  try {
    const opsToken = await fetchOpsToken(token);
    return await makeBlobRequest(DXB_API_BASE_URL, path, opsToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      opsTokenCache.delete(token);
      const opsToken = await fetchOpsToken(token);
      return makeBlobRequest(DXB_API_BASE_URL, path, opsToken);
    }
    throw error;
  }
};

const dxbDownloadBlobRequest = async (
  path: string, token: string, selectedDocumentFileName?: string,
  options: Pick<RequestOptions, 'method' | 'body'> = {},
) => {
  try {
    const opsToken = await fetchOpsToken(token);
    return await makeDownloadBlobRequest(DXB_API_BASE_URL, path, opsToken, selectedDocumentFileName, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      opsTokenCache.delete(token);
      const opsToken = await fetchOpsToken(token);
      return makeDownloadBlobRequest(DXB_API_BASE_URL, path, opsToken, selectedDocumentFileName, options);
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
  tasks: {
    list: async (token: string) => (await ruRequest<{ tasks: Task[] }>('/api/tasks', { token })).tasks,
    listStoreTablets: async (token: string) => (await ruRequest<{ storeTablets: StoreTablet[] }>('/api/store-tablets', { token })).storeTablets,
    create: async (
      token: string,
      payload: { title: string; assigneeIds: string[]; deadlineAt: string | null; requiresPhotoConfirmation: boolean },
    ) => {
      const response = await ruRequest<{ task: Task; tasks?: Task[] }>('/api/tasks', { method: 'POST', token, body: payload });
      return response.tasks ?? [response.task];
    },
    updateStatus: async (token: string, taskId: string, status: TaskStatus) =>
      (await ruRequest<{ task: Task }>(`/api/tasks/${taskId}/status`, { method: 'PATCH', token, body: { status } })).task,
    reviewPhoto: async (token: string, taskId: string, decision: 'approve' | 'decline') =>
      (await ruRequest<{ task: Task }>(`/api/tasks/${taskId}/photo/review`, { method: 'PATCH', token, body: { decision } })).task,
    photoBlob: async (token: string, taskId: string) =>
      makeImageBlobRequest(RU_API_BASE_URL, `/api/tasks/${taskId}/photo`, token),
    delete: async (token: string, taskId: string) => {
      await ruRequest<{}>(`/api/tasks/${taskId}`, { method: 'DELETE', token });
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
    table: async (token: string, params: { shopId?: string; businessCategory?: BusinessCategory; from?: string; to?: string; range?: 'week' | 'year' }) =>
      (await dxbRequest<{ table: StockTable }>(`/api/stock${query(params)}`, { token })).table,
    createProduct: async (token: string, payload: ProductPayload) =>
      (await dxbRequest<{ product: unknown }>('/api/stock/products', { method: 'POST', token, body: payload })).product,
    updateProduct: async (token: string, productId: string, payload: ProductPayload) =>
      (await dxbRequest<{ product: unknown }>(`/api/stock/products/${productId}`, { method: 'PATCH', token, body: payload })).product,
    deleteProduct: async (token: string, productId: string) => {
      await dxbRequest<{}>(`/api/stock/products/${productId}`, { method: 'DELETE', token });
    },
    listSubcategories: async (token: string) =>
      (await dxbRequest<{ subcategories: Record<BusinessCategory, string[]> }>('/api/stock/subcategories', { token })).subcategories,
    createSubcategory: async (token: string, payload: { businessCategory: BusinessCategory; name: string }) =>
      (await dxbRequest<{ subcategories: Record<BusinessCategory, string[]> }>('/api/stock/subcategories', {
        method: 'POST',
        token,
        body: payload,
      })).subcategories,
    deleteSubcategory: async (token: string, payload: { businessCategory: BusinessCategory; name: string }) => {
      await dxbRequest<{}>('/api/stock/subcategories', { method: 'DELETE', token, body: payload });
    },
    updateValue: async (token: string, payload: { shopId: string; productId: string; date: string; value: string }) => {
      await dxbRequest<{}>('/api/stock/value', { method: 'PUT', token, body: payload });
    },
    listShopOrderValues: async (token: string, shopId: string, from: string, to: string, businessCategory?: BusinessCategory) =>
      (await dxbRequest<{ orderValues: OrderValueEntry[] }>(
        `/api/stock/order-values${query({ shopId, from, to, businessCategory })}`,
        { token },
      )).orderValues,
    updateOrderValue: async (
      token: string,
      payload: { shopId: string; productId: string; orderDate: string; packs: number },
    ) => {
      await dxbRequest<{}>('/api/stock/order-values', { method: 'PUT', token, body: payload });
    },
  },
  orders: {
    list: async (token: string, businessCategory?: BusinessCategory) =>
      (await dxbRequest<{ orders: SellerOrder[] }>(`/api/orders${query({ businessCategory })}`, { token })).orders,
    sheet: async (token: string, date: string, businessCategory?: BusinessCategory) =>
      (await dxbRequest<{ sheet: OrderSheet }>(`/api/orders/sheet${query({ date, businessCategory })}`, { token })).sheet,
    create: async (
      token: string,
      payload: { shopId: string; productId: string; stockOnHand: number | null; requestedPacks: number; requestedUnits: number; autoSuggested: boolean; orderDate?: string },
    ) => (await dxbRequest<{ order: SellerOrder }>('/api/orders', { method: 'POST', token, body: payload })).order,
    updateStatus: async (token: string, orderId: string, status: 'new' | 'processed') =>
      (await dxbRequest<{ order: SellerOrder }>(`/api/orders/${orderId}/status`, { method: 'PATCH', token, body: { status } })).order,
  },
  promotions: {
    connectGmail: async (token: string) =>
      dxbRequest<{ authorizationUrl: string }>('/api/promotions/gmail/connect', { method: 'POST', token }),
    disconnectGmail: async (token: string) =>
      dxbRequest<{ ok: boolean }>('/api/promotions/gmail/disconnect', { method: 'POST', token }),
    gmailImports: async (token: string) =>
      dxbRequest<{ imports: GmailImport[]; health: GmailHealth }>('/api/promotions/gmail/imports?limit=10', { token }),
    pollGmail: async (token: string) =>
      dxbRequest<{ health: GmailHealth; result: { messages: number; attachments: number; imported: number; skipped: number; failed: number } }>(
        '/api/promotions/gmail/poll', { method: 'POST', token, timeoutMs: 10 * 60_000 },
      ),
    rows: async (token: string) =>
      (await dxbRequest<{ rows: PromotionTableRow[] }>('/api/promotions/rows', { token })).rows,
    rowByNumber: async (token: string, rowNumber: number) =>
      (await dxbRequest<{ row: PromotionTableRow }>(`/api/promotions/rows/by-number/${rowNumber}`, { token })).row,
    addRow: async (token: string, payload: PromotionRowPayload) =>
      (await dxbRequest<{ row: PromotionTableRow }>('/api/promotions/rows', { method: 'POST', token, body: payload })).row,
    updateRowByNumber: async (token: string, rowNumber: number, payload: PromotionRowPayload) =>
      (await dxbRequest<{ row: PromotionTableRow }>(`/api/promotions/rows/by-number/${rowNumber}`, { method: 'PATCH', token, body: payload })).row,
    deleteRowByNumber: async (token: string, rowNumber: number) => {
      await dxbRequest<{}>(`/api/promotions/rows/by-number/${rowNumber}`, { method: 'DELETE', token });
    },
    documents: async (token: string) =>
      (await dxbRequest<{ documents: PromotionDocument[] }>('/api/promotions/documents', { token })).documents,
    uploadDocument: async (token: string, documentType: Exclude<PromotionDocumentType, 'final_table_csv'>, file: File) => {
      const form = new FormData();
      form.append('documentType', documentType);
      form.append('file', file);
      return (await dxbFormRequest<{ document: PromotionDocument }>('/api/promotions/documents', token, form)).document;
    },
    createFinalTable: async (token: string) =>
      (await dxbRequest<{ document: PromotionDocument }>('/api/promotions/documents/final-table', { method: 'POST', token })).document,
    downloadFinalTableCsv: async (token: string) =>
      dxbBlobRequest('/api/promotions/documents/final-table/download', token),
    previewFinalTable: async (token: string) =>
      dxbRequest<PromotionTablePreview>('/api/promotions/documents/final-table/preview', { token }),
    previewDocument: async (token: string, documentId: string) =>
      dxbRequest<PromotionTablePreview>(`/api/promotions/documents/${encodeURIComponent(documentId)}/preview`, { token }),
    outputs: async (token: string, rowNumber: number) =>
      dxbRequest<PromotionOutputs>(`/api/promotions/rows/by-number/${rowNumber}/outputs`, { token }),
    batchPriceTags: async (token: string, payload: PromotionBatchRequest) =>
      dxbDownloadBlobRequest('/api/promotions/price-tags/batch.pdf', token, undefined, { method: 'POST', body: payload }),
    downloadPriceTagPdf: async (token: string, rowNumber: number) =>
      dxbDownloadBlobRequest(`/api/promotions/rows/by-number/${rowNumber}/price-tag.pdf`, token),
    downloadGeneratedPosterPdf: async (token: string, rowNumber: number) =>
      dxbDownloadBlobRequest(`/api/promotions/rows/by-number/${rowNumber}/poster-generated.pdf`, token),
    downloadDocument: async (token: string, params: { documentType?: PromotionDocumentType; documentId?: string; fileName?: string }) =>
      dxbDownloadBlobRequest(
        `/api/promotions/documents/download${query({ type: params.documentType, id: params.documentId })}`,
        token,
        params.fileName,
      ),
    deleteDocument: async (token: string, documentId: string) =>
      dxbRequest<{ document: PromotionDocument; deletedRows: number }>(`/api/promotions/documents/${documentId}`, { method: 'DELETE', token }),
  },
  checkin: {
    stats: async (token: string, from: string, to: string, shopId?: string) =>
      (await ruRequest<{ stats: CheckInStats }>(`/api/checkin/stats${query({ from, to, shopId })}`, { token })).stats,
  },
  audioQc: {
    policies: async (token: string) =>
      (await ruRequest<{ policies: AudioQcPolicyWithHeartbeat[] }>('/api/audio-qc/policies', { token })).policies,
    savePolicy: async (token: string, shopId: string, policy: AudioQcPolicy) =>
      (await ruRequest<{ policy: AudioQcPolicyWithHeartbeat }>(
        `/api/audio-qc/shops/${encodeURIComponent(shopId)}/policy`,
        {
          method: 'PUT',
          token,
          body: {
            enabled: policy.enabled,
            mode: policy.mode,
            maxSegmentDurationSec: policy.maxSegmentDurationSec,
            silenceToStopSec: policy.silenceToStopSec,
            preRollSec: policy.preRollSec,
            uploadImmediately: policy.uploadImmediately,
          },
        },
      )).policy,
    recordings: async (token: string, filters: {
      shopId?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    } = {}): Promise<AudioQcRecordingsPage> =>
      ruRequest<AudioQcRecordingsPage>(
        `/api/audio-qc/recordings${query({
          shopId: filters.shopId,
          from: filters.from,
          to: filters.to,
          limit: String(filters.limit ?? 25),
          offset: String(filters.offset ?? 0),
        })}`,
        { token },
      ),
  },
  qualityControl: {
    session: async (token: string, sessionId: string) =>
      (await ruRequest<{ session: QcSession }>(`/api/quality-control/sessions/${encodeURIComponent(sessionId)}`, { token })).session,
    status: async (token: string, sessionId: string) =>
      ruRequest<QcStatus>(`/api/quality-control/sessions/${encodeURIComponent(sessionId)}/status`, { token }),
    transcript: async (token: string, sessionId: string) =>
      ruRequest<QcTranscript>(`/api/quality-control/sessions/${encodeURIComponent(sessionId)}/transcript`, { token }),
    analysis: async (token: string, sessionId: string) =>
      (await ruRequest<{ analysis: QcAnalysis }>(`/api/quality-control/sessions/${encodeURIComponent(sessionId)}/analysis`, { token })).analysis,
    audioInfo: async (token: string, sessionId: string) =>
      (await ruRequest<{ audio: QcAudioInfo }>(`/api/quality-control/sessions/${encodeURIComponent(sessionId)}/audio-info`, { token })).audio,
    audioDownload: async (token: string, sessionId: string) =>
      makeDownloadBlobRequest(RU_API_BASE_URL, `/api/quality-control/sessions/${encodeURIComponent(sessionId)}/audio`, token),
    setAudioPinned: async (token: string, sessionId: string, pinned: boolean) =>
      (await ruRequest<{ audio: QcAudioInfo }>(`/api/quality-control/sessions/${encodeURIComponent(sessionId)}/audio-retention`, {
        method: 'PUT', token, body: { pinned },
      })).audio,
    overview: async (token: string, filters: { shopId?: string; from?: string; to?: string }) =>
      ruRequest<QcOverview>(`/api/quality-control/analytics/overview${query(filters)}`, { token }),
    trends: async (token: string, filters: { shopId?: string; from?: string; to?: string; interval: 'day' | 'week' | 'month' }) =>
      ruRequest<QcTrendPoint[]>(`/api/quality-control/analytics/trends${query(filters)}`, { token }),
  },
};
