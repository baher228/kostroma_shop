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

  create: async (token: string, name: string): Promise<Shop> => {
    const result = await request<ShopResponse>('/api/shops', {
      method: 'POST',
      token,
      body: { name },
    });
    return result.shop;
  },
};
