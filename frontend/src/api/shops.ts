import { Shop } from '../types/models';
import { request } from './http';

type ShopsResponse = {
  shops: Shop[];
};

type ShopResponse = {
  shop: Shop;
};

export const shopsApi = {
  list: async (token: string): Promise<Shop[]> => {
    const result = await request<ShopsResponse>('/api/shops', { token });
    return result.shops;
  },

  create: async (token: string, name: string, machineNumber: number): Promise<Shop> => {
    const result = await request<ShopResponse>('/api/shops', {
      method: 'POST',
      token,
      body: { name, machineNumber },
    });
    return result.shop;
  },

  updateMachine: async (token: string, shopId: string, machineNumber: number): Promise<Shop> => {
    const result = await request<ShopResponse>(`/api/shops/${shopId}/machine`, {
      method: 'PATCH',
      token,
      body: { machineNumber },
    });
    return result.shop;
  },

  delete: async (token: string, shopId: string): Promise<void> => {
    await request<{}>(`/api/shops/${shopId}`, {
      method: 'DELETE',
      token,
    });
  },
};
