import { SellerOrder } from '../types/models';
import { request } from './http';

type OrdersResponse = { orders: SellerOrder[] };
type OrderResponse = { order: SellerOrder };

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
      note?: string | null;
    },
  ): Promise<SellerOrder> => {
    const result = await request<OrderResponse>('/api/orders', { method: 'POST', token, body: payload });
    return result.order;
  },
};
