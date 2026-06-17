import { getShopById, listShops, createShop, updateShopMachine, updateShop, deleteShop } from '../repositories/stockRepository';
import { OpsTokenClaims, Shop } from '../domain/types';
import { createShopSchema, updateShopMachineSchema, updateShopSchema } from '../http/validation';
import { z } from 'zod';

export const getVisibleShops = async (viewer: OpsTokenClaims): Promise<Shop[]> => {
  if (viewer.role === 'worker') {
    const shops = await Promise.all(viewer.shopIds.map((shopId) => getShopById(shopId)));
    return shops.filter((shop): shop is Shop => Boolean(shop));
  }
  return listShops();
};

export const createShopForManager = (payload: z.infer<typeof createShopSchema>): Promise<Shop> =>
  createShop(payload.name, payload.machineNumber);

export const changeShopMachine = (
  shopId: string,
  payload: z.infer<typeof updateShopMachineSchema>,
): Promise<Shop | null> => updateShopMachine(shopId, payload.machineNumber);

export const updateShopDetails = (
  shopId: string,
  payload: z.infer<typeof updateShopSchema>,
): Promise<Shop | null> => updateShop(shopId, payload);

export const removeShop = (shopId: string): Promise<boolean> => deleteShop(shopId);
