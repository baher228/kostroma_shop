import { getOrderSheet, upsertOrderSheetValue } from '../repositories/orderSheetRepository';
import { createSellerOrder, listSellerOrders, updateSellerOrderStatus } from '../repositories/ordersRepository';
import { OpsTokenClaims } from '../domain/types';
import {
  createSellerOrderSchema,
  updateSellerOrderStatusSchema,
  upsertOrderSheetValueSchema,
} from '../http/validation';
import { z } from 'zod';

export const getSellerOrders = (viewer: OpsTokenClaims) => listSellerOrders(viewer);

export const submitSellerOrder = async (
  viewer: OpsTokenClaims,
  payload: z.infer<typeof createSellerOrderSchema>,
) => createSellerOrder(viewer, payload);

export const changeSellerOrderStatus = (
  viewer: OpsTokenClaims,
  orderId: string,
  payload: z.infer<typeof updateSellerOrderStatusSchema>,
) => updateSellerOrderStatus(viewer, orderId, payload.status);

export const getManagerOrderSheet = (date: string) => getOrderSheet(date);

export const updateManagerOrderSheetValue = (
  payload: z.infer<typeof upsertOrderSheetValueSchema>,
) => upsertOrderSheetValue(payload);
