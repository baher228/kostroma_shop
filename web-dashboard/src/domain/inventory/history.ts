import type { InventorySnapshotItem } from '../../types';

export const inventoryHistoryCell = (
  draftQuantity: string | undefined,
  draftPrice: number | null | undefined,
  snapshot?: ReadonlyMap<string, InventorySnapshotItem>,
  productId?: string,
) => {
  const item = snapshot && productId ? snapshot.get(productId) : undefined;
  const quantity = snapshot ? item?.quantity ?? null : draftQuantity ? Number.parseInt(draftQuantity, 10) : null;
  const price = snapshot ? item?.inventoryPrice ?? null : draftPrice ?? null;
  return {
    quantity: quantity ?? '',
    price,
    sum: price !== null && quantity !== null && Number.isFinite(quantity) ? price * quantity : null,
  };
};
