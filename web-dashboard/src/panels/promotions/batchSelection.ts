import type { PromotionBatchRequest, PromotionTableRow } from '../../types';

export const priceTagReady = (row: Pick<PromotionTableRow, 'promoPrice' | 'regularPrice'>) =>
  row.promoPrice !== null && Number.isFinite(row.promoPrice) && row.promoPrice >= 0
  && row.regularPrice !== null && Number.isFinite(row.regularPrice) && row.regularPrice >= 0;

export const selectBatchRows = (rows: PromotionTableRow[], request: PromotionBatchRequest) => {
  const selected = new Set(request.rowNumbers ?? []);
  return rows.filter((row) => {
    const matchesScope = request.scope === 'selected' ? selected.has(row.rowNumber)
      : request.scope === 'current_and_future' ? row.status === 'current' || row.status === 'future'
      : row.status === request.scope;
    return matchesScope
      && (!request.from || !row.endDate || row.endDate >= request.from)
      && (!request.to || !row.startDate || row.startDate <= request.to);
  });
};
