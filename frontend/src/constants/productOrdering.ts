import { sortProductsLikeImage as sortSharedProductsLikeImage } from '../../../shared/product-ordering';
import { StockTableRow } from '../types/models';

export const sortProductsLikeImage = sortSharedProductsLikeImage;

export const sortStockTableRowsLikeImage = (rows: StockTableRow[]): StockTableRow[] => sortSharedProductsLikeImage(rows);
