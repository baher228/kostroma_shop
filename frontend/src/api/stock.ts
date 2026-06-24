import { BusinessCategory, OrderValueEntry, ProductCategory, StockTable } from '../types/models';
import { request } from './http';

type StockTableResponse = {
  table: StockTable;
};

type ProductResponse = {
  product: {
    id: string;
    name: string;
    businessCategory: BusinessCategory;
    category: ProductCategory;
    packType: string | null;
    unitsInPack: number | null;
    packWeightKg: number | null;
    shelfLifeDays: number | null;
    unitPriceRubVat: number | null;
    minStockUnits: number | null;
    maxStockUnits: number | null;
  };
};

export type CreateProductPayload = {
  name: string;
  businessCategory: BusinessCategory;
  category: ProductCategory;
  packType: string;
  unitsInPack: number;
  packWeightKg: number;
  shelfLifeDays: number;
  unitPriceRubVat: number;
  minStockUnits: number;
  maxStockUnits: number;
};

type StockListQuery = {
  shopId?: string;
  businessCategory?: BusinessCategory;
  from?: string;
  to?: string;
  range?: 'week' | 'year';
};

const toQueryString = (query: StockListQuery): string => {
  const params = new URLSearchParams();
  if (query.shopId) {
    params.set('shopId', query.shopId);
  }
  if (query.businessCategory) {
    params.set('businessCategory', query.businessCategory);
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
    payload: CreateProductPayload,
  ): Promise<ProductResponse['product']> => {
    const result = await request<ProductResponse>('/api/stock/products', {
      method: 'POST',
      token,
      body: payload,
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

  listSubcategories: async (token: string): Promise<Record<BusinessCategory, ProductCategory[]>> => {
    const result = await request<{ subcategories: Record<BusinessCategory, ProductCategory[]> }>('/api/stock/subcategories', { token });
    return result.subcategories;
  },

  createSubcategory: async (
    token: string,
    payload: { businessCategory: BusinessCategory; name: string },
  ): Promise<Record<BusinessCategory, ProductCategory[]>> => {
    const result = await request<{ subcategories: Record<BusinessCategory, ProductCategory[]> }>('/api/stock/subcategories', {
      method: 'POST',
      token,
      body: payload,
    });
    return result.subcategories;
  },

  deleteSubcategory: async (
    token: string,
    payload: { businessCategory: BusinessCategory; name: string },
  ): Promise<void> => {
    await request<{}>('/api/stock/subcategories', {
      method: 'DELETE',
      token,
      body: payload,
    });
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

  listShopOrderValues: async (
    token: string,
    shopId: string,
    from: string,
    to: string,
    businessCategory?: BusinessCategory,
  ): Promise<OrderValueEntry[]> => {
    const params = new URLSearchParams({ shopId, from, to });
    if (businessCategory) {
      params.set('businessCategory', businessCategory);
    }
    const result = await request<{ orderValues: OrderValueEntry[] }>(
      `/api/stock/order-values?${params.toString()}`,
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
