import { getOrderSheet, upsertOrderSheetValue } from '../repositories/orderSheetRepository';
import { createSellerOrder, createSellerOrderBulk, listSellerOrders, updateSellerOrderStatus } from '../repositories/ordersRepository';
import { OpsTokenClaims } from '../domain/types';
import {
  createSellerOrderBulkSchema,
  createSellerOrderSchema,
  updateSellerOrderStatusSchema,
  upsertOrderSheetValueSchema,
} from '../http/validation';
import { z } from 'zod';

export const getSellerOrders = (
  viewer: OpsTokenClaims,
  businessCategory: z.infer<typeof createSellerOrderSchema>['businessCategory'],
) => listSellerOrders(viewer, businessCategory);

export const submitSellerOrder = async (
  viewer: OpsTokenClaims,
  payload: z.infer<typeof createSellerOrderSchema>,
) => createSellerOrder(viewer, payload);

export const submitSellerOrderBulk = async (
  viewer: OpsTokenClaims,
  payload: z.infer<typeof createSellerOrderBulkSchema>,
) => createSellerOrderBulk(viewer, payload);

export const changeSellerOrderStatus = (
  viewer: OpsTokenClaims,
  orderId: string,
  payload: z.infer<typeof updateSellerOrderStatusSchema>,
) => updateSellerOrderStatus(viewer, orderId, payload.status);

export const getManagerOrderSheet = (date: string, businessCategory: z.infer<typeof createSellerOrderSchema>['businessCategory']) =>
  getOrderSheet(date, businessCategory);

export const updateManagerOrderSheetValue = (
  payload: z.infer<typeof upsertOrderSheetValueSchema>,
) => upsertOrderSheetValue(payload);
