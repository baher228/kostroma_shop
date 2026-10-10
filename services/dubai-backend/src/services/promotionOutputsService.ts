import type { PromotionTableRow } from '../repositories/promotionRowsRepository';
import { findPosterPsdForProduct } from './googleDrivePosterService';

export const getPromotionOutputs = async (row: PromotionTableRow) => {
  const pricesAvailable = row.promoPrice !== null && Number.isFinite(row.promoPrice) && row.promoPrice >= 0
    && row.regularPrice !== null && Number.isFinite(row.regularPrice) && row.regularPrice >= 0;
  if (!pricesAvailable) return { priceTag: { available: false }, poster: { available: false } };
  try {
    const match = await findPosterPsdForProduct(row.productName);
    return {
      priceTag: { available: true },
      poster: match.best
        ? { available: true, templateFileName: match.best.file.name, matchScore: match.best.score }
        : { available: false },
    };
  } catch {
    // Drive availability must not hide a usable local price tag. Do not expose
    // remote API or authentication errors to the dashboard.
    return {
      priceTag: { available: true },
      poster: { available: false, error: 'Не удалось проверить наличие постера.' },
    };
  }
};
