import { OrderSheet, SellerOrder } from '../types/models';
import { request } from './http';

type OrdersResponse = { orders: SellerOrder[] };
type OrderResponse = { order: SellerOrder };
type OrderSheetResponse = { sheet: OrderSheet };
type BulkOrderResponse = { orders: SellerOrder[] };

type OrderItemPayload = {
  productId: string;
  stockOnHand?: number | null;
  requestedPacks: number;
  requestedUnits: number;
  autoSuggested?: boolean;
};

export const ordersApi = {
  list: async (token: string): Promise<SellerOrder[]> => {
    const result = await request<OrdersResponse>('/api/orders', { token });
    return result.orders;
  },
  create: async (
    token: string,
    payload: {
      shopId: string;
      productId: string;
      stockOnHand?: number | null;
      requestedPacks: number;
      requestedUnits: number;
      autoSuggested?: boolean;
      orderDate?: string;
      note?: string | null;
    },
  ): Promise<SellerOrder> => {
    const result = await request<OrderResponse>('/api/orders', { method: 'POST', token, body: payload });
    return result.order;
  },
  createBulk: async (
    token: string,
    payload: {
      shopId: string;
      orderDate: string;
      items: OrderItemPayload[];
    },
  ): Promise<SellerOrder[]> => {
    const result = await request<BulkOrderResponse>('/api/orders/bulk', { method: 'POST', token, body: payload });
    return result.orders;
  },
  sheet: async (token: string, date: string): Promise<OrderSheet> => {
    const result = await request<OrderSheetResponse>(`/api/orders/sheet?date=${date}`, { token });
    return result.sheet;
  },
  updateSheetValue: async (
    token: string,
    payload: { shopId: string; productId: string; date: string; value: string },
  ): Promise<void> => {
    await request<{}>('/api/orders/sheet/value', {
      method: 'PUT',
      token,
      body: payload,
    });
  },
};
