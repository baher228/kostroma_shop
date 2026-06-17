import { listOrderSheetValues, upsertOrderSheetValue } from '../repositories/orderSheetRepository';
import {
  createProduct,
  deleteProduct,
  getStockTable,
  updateProduct,
  updateProductMeta,
  upsertStockValue,
} from '../repositories/stockRepository';
import { OpsTokenClaims } from '../domain/types';
import {
  createRowSchema,
  listStockTableQuerySchema,
  updateProductMetaSchema,
  updateProductSchema,
  upsertOrderSheetValueSchema,
  upsertStockValueSchema,
} from '../http/validation';
import { z } from 'zod';

export const getVisibleStockTable = (
  viewer: OpsTokenClaims,
  query: z.infer<typeof listStockTableQuerySchema>,
) => getStockTable(viewer, query);

export const createStockProduct = (payload: z.infer<typeof createRowSchema>) => createProduct(payload);

export const updateStockProduct = (
  productId: string,
  payload: z.infer<typeof updateProductSchema>,
) => updateProduct(productId, payload);

export const updateStockProductMeta = (
  productId: string,
  payload: z.infer<typeof updateProductMetaSchema>,
) => updateProductMeta(productId, payload);

export const removeStockProduct = (productId: string) => deleteProduct(productId);

export const setStockValue = (
  viewer: OpsTokenClaims,
  payload: z.infer<typeof upsertStockValueSchema>,
) => upsertStockValue(viewer, payload);

export const getShopOrderValues = (shopId: string, from: string, to: string) =>
  listOrderSheetValues(shopId, from, to);

export const setShopOrderValue = (payload: z.infer<typeof upsertOrderSheetValueSchema>) =>
  upsertOrderSheetValue({
    shopId: payload.shopId,
    productId: payload.productId,
    date: payload.date,
    value: payload.value === '0' ? '' : payload.value,
  });
