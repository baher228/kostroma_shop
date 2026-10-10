import { PromotionTableRow, listPromotionRows } from '../repositories/promotionRowsRepository';
import { createPromotionPriceTagSheetPdf } from './promotionPriceTagPdfService';

export type PromotionPriceTagBatchScope = 'current' | 'future' | 'current_and_future' | 'selected';

export type PromotionPriceTagBatchRequest = {
  scope: PromotionPriceTagBatchScope;
  rowNumbers: number[];
  from: string | null;
  to: string | null;
  layout: 'a4_2x2';
};

const scopes = new Set<PromotionPriceTagBatchScope>(['current', 'future', 'current_and_future', 'selected']);

const nullableDate = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Дата должна быть в формате YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Указана некорректная дата.');
  }
  return value;
};

export const parsePromotionPriceTagBatchRequest = (body: unknown): PromotionPriceTagBatchRequest => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Укажите параметры печати ценников.');
  }
  const payload = body as Record<string, unknown>;
  const scope = payload.scope ?? 'current_and_future';
  if (typeof scope !== 'string' || !scopes.has(scope as PromotionPriceTagBatchScope)) {
    throw new Error('Неизвестная группа акций для печати.');
  }
  const layout = payload.layout ?? 'a4_2x2';
  if (layout !== 'a4_2x2') throw new Error('Поддерживается раскладка a4_2x2.');
  const numbers = payload.rowNumbers ?? [];
  if (!Array.isArray(numbers) || numbers.some((number) => typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1)) {
    throw new Error('Номера строк должны быть положительными целыми числами.');
  }
  const rowNumbers = [...new Set(numbers as number[])];
  if (scope === 'selected' && !rowNumbers.length) throw new Error('Выберите хотя бы одну строку акции.');
  const from = nullableDate(payload.from);
  const to = nullableDate(payload.to);
  if (from && to && from > to) throw new Error('Дата начала не может быть позже даты окончания.');
  return { scope: scope as PromotionPriceTagBatchScope, rowNumbers, from, to, layout };
};

const validPrice = (price: number | null) => price !== null && Number.isFinite(price) && price >= 0;

export const selectPromotionPriceTagBatchRows = (
  rows: readonly PromotionTableRow[],
  request: PromotionPriceTagBatchRequest,
) => {
  const selectedNumbers = new Set(request.rowNumbers);
  const seen = new Set<number>();
  const matchingRows = rows.filter((row) => {
    if (seen.has(row.rowNumber)) return false;
    const matchesScope = request.scope === 'selected'
      ? selectedNumbers.has(row.rowNumber)
      : request.scope === 'current_and_future'
        ? row.status === 'current' || row.status === 'future'
        : row.status === request.scope;
    if (!matchesScope) return false;
    // Period limits select intersecting promotions. Missing endpoints remain
    // open bounds, consistent with partially dated promotion rows.
    if (request.from && row.endDate && row.endDate < request.from) return false;
    if (request.to && row.startDate && row.startDate > request.to) return false;
    seen.add(row.rowNumber);
    return true;
  }).sort((left, right) => (
    (left.startDate ?? '9999-99-99').localeCompare(right.startDate ?? '9999-99-99')
    || left.productName.localeCompare(right.productName, 'ru')
    || left.rowNumber - right.rowNumber
  ));
  return {
    rows: matchingRows.filter((row) => validPrice(row.promoPrice) && validPrice(row.regularPrice)),
    skippedRowNumbers: matchingRows
      .filter((row) => !validPrice(row.promoPrice) || !validPrice(row.regularPrice))
      .map((row) => row.rowNumber),
  };
};

export class PromotionPriceTagBatchEmptyError extends Error {
  constructor(public readonly skippedRowNumbers: number[]) {
    super(skippedRowNumbers.length
      ? 'Не удалось сформировать ценники: у выбранных акций отсутствует старая или новая цена.'
      : 'По указанным условиям нет акций для печати ценников.');
  }
}

export const createPromotionPriceTagBatch = async (body: unknown) => {
  const request = parsePromotionPriceTagBatchRequest(body);
  const selection = selectPromotionPriceTagBatchRows(await listPromotionRows(), request);
  if (!selection.rows.length) throw new PromotionPriceTagBatchEmptyError(selection.skippedRowNumbers);
  return {
    pdf: createPromotionPriceTagSheetPdf(selection.rows),
    rowNumbers: selection.rows.map((row) => row.rowNumber),
    skippedRowNumbers: selection.skippedRowNumbers,
    pageCount: Math.ceil(selection.rows.length / 4),
  };
};

const batchDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return { day: part('day'), month: part('month'), year: part('year') };
};

export const promotionPriceTagBatchContentDisposition = (date = new Date()) => {
  const { day, month, year } = batchDateParts(date);
  const name = `Акционные_ценники_${day}.${month}.${year}.pdf`;
  return `attachment; filename="promotion-price-tags-${year}-${month}-${day}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`;
};
