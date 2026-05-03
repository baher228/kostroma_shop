import { OrderValueEntry, ProductCategory, StockTable } from '../types/models';
import { request } from './http';

type StockTableResponse = {
  table: StockTable;
};

type ProductResponse = {
  product: {
    id: string;
    name: string;
    category: ProductCategory;
    unitsInPack: number | null;
    minStockUnits: number | null;
    maxStockUnits: number | null;
  };
};

type StockListQuery = {
  shopId?: string;
  from?: string;
  to?: string;
  range?: 'week' | 'year';
};

const toQueryString = (query: StockListQuery): string => {
  const params = new URLSearchParams();
  if (query.shopId) {
    params.set('shopId', query.shopId);
  }
  if (query.from) {
    params.set('from', query.from);
  }
  if (query.to) {
    params.set('to', query.to);
  }
  if (query.range) {
    params.set('range', query.range);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

export const stockApi = {
  list: async (token: string, query: StockListQuery = {}): Promise<StockTable> => {
    const result = await request<StockTableResponse>(`/api/stock${toQueryString(query)}`, { token });
    return result.table;
  },

  createProduct: async (
    token: string,
    name: string,
    category: ProductCategory,
  ): Promise<{ id: string; name: string; category: ProductCategory }> => {
    const result = await request<ProductResponse>('/api/stock/products', {
      method: 'POST',
      token,
      body: { name, category },
    });
    return result.product;
  },

  updateProductMeta: async (
    token: string,
    productId: string,
    payload: { unitsInPack?: number | null; minStockUnits?: number | null; maxStockUnits?: number | null },
  ): Promise<{
    id: string;
    name: string;
    category: ProductCategory;
    unitsInPack: number | null;
    minStockUnits: number | null;
    maxStockUnits: number | null;
  }> => {
    const result = await request<ProductResponse>(`/api/stock/products/${productId}/meta`, {
      method: 'PATCH',
      token,
      body: payload,
    });
    return result.product;
  },

  deleteProduct: async (token: string, productId: string): Promise<void> => {
    await request<{}>(`/api/stock/products/${productId}`, {
      method: 'DELETE',
      token,
    });
  },

  updateValue: async (
    token: string,
    payload: {
      shopId?: string;
      productId: string;
      date: string;
      value: string;
    },
  ): Promise<void> => {
    await request<{}>('/api/stock/value', {
      method: 'PUT',
      token,
      body: payload,
    });
  },

  listOrderValues: async (token: string, from: string, to: string): Promise<OrderValueEntry[]> => {
    const result = await request<{ orderValues: OrderValueEntry[] }>(
      `/api/stock/order-values?from=${from}&to=${to}`,
      { token },
    );
    return result.orderValues;
  },

  listShopOrderValues: async (token: string, shopId: string, from: string, to: string): Promise<OrderValueEntry[]> => {
    const result = await request<{ orderValues: OrderValueEntry[] }>(
      `/api/stock/order-values?shopId=${encodeURIComponent(shopId)}&from=${from}&to=${to}`,
      { token },
    );
    return result.orderValues;
  },

  updateOrderValue: async (
    token: string,
    payload: { shopId: string; productId: string; orderDate: string; packs: number },
  ): Promise<void> => {
    await request<{}>('/api/stock/order-values', {
      method: 'PUT',
      token,
      body: payload,
    });
  },
};
