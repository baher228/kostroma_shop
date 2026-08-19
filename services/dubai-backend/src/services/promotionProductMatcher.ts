import { PromotionPriceListItem } from '../repositories/promotionPriceListRepository';

type PackageMark = {
  grams: number;
};

export type PromotionProductMatch = {
  item: PromotionPriceListItem;
  score: number;
  exactPackage: boolean;
};

const RU = {
  category: '\u043a\u0430\u0442',
  rub: '\u0440',
  kg: '\u043a\u0433',
  gram: '\u0433',
  yo: '\u0451',
  ye: '\u0435',
  cooledFull: '\u043e\u0445\u043b\u0430\u0436\u0434\u0435\u043d\u043d\u044b\u0439',
  cooledShort: '\u043e\u0445\u043b',
  cellophane: '\u0446\u0435\u043b\u043b\u043e\u0444',
  semiSmoked: '\u043f\u043e\u043b\u0443\u043a\u043e\u043f\u0447',
  boiledSmoked: '\u0432\u0430\u0440\u0435\u043d\u043e\u043a\u043e\u043f\u0447',
  rawSmoked: '\u0441\u044b\u0440\u043e\u043a\u043e\u043f\u0447',
  vacuum: '\u0432\u0430\u043a',
  packageWord: '\u0443\u043f',
  frozenFull: '\u0437\u0430\u043c\u043e\u0440\u043e\u0436',
  frozenShort: '\u0437\u0430\u043c',
  packedShort: '\u0444\u0430\u0441',
  middlePackage: '\u0437\u0441\u0440',
  pieces: '\u0448\u0442',
};

const lower = (value: string) => value.normalize('NFC').toLowerCase().replaceAll(RU.yo, RU.ye);

const quoteChars = '\u00ab\u00bb"';
const packagePattern = new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*(${RU.kg}|${RU.gram})\\.?`, 'giu');

const stripDecorativeAttributes = (value: string) =>
  value
    .replace(new RegExp(`${RU.category}(?:\\u0435\\u0433\\u043e\\u0440\\u0438\\u044f)?\\.?\\s*[\\u0430-\\u044fa-z](?![\\p{L}])`, 'giu'), ' ')
    .replace(new RegExp(`${RU.vacuum}(?:\\u0443\\u0443\\u043c\\u043d[\\p{L}]*)?\\.?\\s*${RU.packageWord}(?:\\u0430\\u043a\\u043e\\u0432\\u043a[\\p{L}]*)?\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.frozenFull}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.frozenShort}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.packedShort}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.middlePackage}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.pieces}\\.?`, 'giu'), ' ');

const normalizeKnownAbbreviations = (value: string) =>
  value
    .replace(new RegExp(`(?<![\\p{L}])[\\u043fp]\\s*[/\\\\]\\s*[\\u043ak](?![\\p{L}])`, 'giu'), ` ${RU.semiSmoked} `)
    .replace(new RegExp(`(?<![\\p{L}])[\\u0432v]\\s*[/\\\\]\\s*[\\u043ak](?![\\p{L}])`, 'giu'), ` ${RU.boiledSmoked} `)
    .replace(new RegExp(`(?<![\\p{L}])[\\u0441c]\\s*[/\\\\]\\s*[\\u043ak](?![\\p{L}])`, 'giu'), ` ${RU.rawSmoked} `)
    .replace(new RegExp(`\\u043f\\u043e\\u043b\\u0443[\\s-]*\\u043a\\u043e\\u043f\\u0447[\\p{L}]*`, 'giu'), ` ${RU.semiSmoked} `)
    .replace(new RegExp(`\\u0432\\u0430\\u0440[\\p{L}]*[\\s-]*\\u043a\\u043e\\u043f\\u0447[\\p{L}]*`, 'giu'), ` ${RU.boiledSmoked} `)
    .replace(new RegExp(`\\u0441\\u044b\\u0440[\\p{L}]*[\\s-]*\\u043a\\u043e\\u043f\\u0447[\\p{L}]*`, 'giu'), ` ${RU.rawSmoked} `)
    .replace(new RegExp(`${RU.cooledFull}`, 'giu'), ` ${RU.cooledShort} `)
    .replace(new RegExp(`${RU.cooledShort}\\.?`, 'giu'), ` ${RU.cooledShort} `)
    .replace(new RegExp(`${RU.cellophane}\\.?[^\\s)]*`, 'giu'), ` ${RU.cellophane} `);

const extractPackageMarks = (value: string): PackageMark[] => {
  const marks: PackageMark[] = [];
  for (const match of lower(value).matchAll(packagePattern)) {
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    const unit = match[2] === RU.kg ? 'kg' : 'g';
    marks.push({
      grams: unit === 'kg' ? amount * 1000 : amount,
    });
  }
  return marks;
};

const normalizeProductName = (value: string) =>
  stripDecorativeAttributes(normalizeKnownAbbreviations(lower(value)))
    .replace(new RegExp(`[${quoteChars}]`, 'gu'), '')
    .replace(packagePattern, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const stopTokens = new Set([
  RU.category,
  RU.packageWord,
  RU.vacuum,
  RU.rub,
  RU.kg,
  RU.gram,
]);

const tokens = (value: string) =>
  normalizeProductName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopTokens.has(token) && !/^\d+(?:[,.]\d+)?$/.test(token));

const tokenSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  return intersection / Math.max(leftTokens.size, rightTokens.size);
};

const packageScore = (rawName: string, cleanName: string) => {
  const rawMarks = extractPackageMarks(rawName);
  const cleanMarks = extractPackageMarks(cleanName);
  if (!rawMarks.length || !cleanMarks.length) return { score: 0, exact: false, conflict: false };

  const hasExact = rawMarks.some((raw) =>
    cleanMarks.some((clean) => Math.abs(raw.grams - clean.grams) <= 5),
  );
  if (hasExact) return { score: 0.25, exact: true, conflict: false };

  // A stated package is a strong discriminator. A 700 g product must not be
  // accepted as a 500 g/1 kg product merely because the remaining words match.
  return { score: -0.45, exact: false, conflict: true };
};

const quotedTokens = (value: string) => {
  const result = new Set<string>();
  const pattern = new RegExp(`[\\u00ab"]([^\\u00bb"]+)[\\u00bb"]`, 'gu');
  for (const match of lower(value).matchAll(pattern)) {
    tokens(match[1]).forEach((token) => result.add(token));
  }
  return result;
};

const quoteScore = (rawName: string, cleanName: string) => {
  const rawQuoted = quotedTokens(rawName);
  if (!rawQuoted.size) return 0;
  const clean = new Set(tokens(cleanName));
  let matched = 0;
  rawQuoted.forEach((token) => {
    if (clean.has(token)) matched += 1;
  });
  return matched === rawQuoted.size ? 0.12 : -0.18;
};

const matchScore = (rawName: string, cleanName: string) => {
  const base = tokenSimilarity(rawName, cleanName);
  const pack = packageScore(rawName, cleanName);
  return {
    score: Math.max(0, Math.min(1, base * 0.82 + pack.score + quoteScore(rawName, cleanName))),
    exactPackage: pack.exact,
    packageConflict: pack.conflict,
  };
};

const itemMatchScore = (rawName: string, item: PromotionPriceListItem) => {
  const cleanScore = matchScore(rawName, item.productNameClean);
  const rawScore = item.productNameRaw ? matchScore(rawName, item.productNameRaw) : null;
  if (rawScore && rawScore.score > cleanScore.score) return rawScore;
  return cleanScore;
};

export const matchPromotionProduct = (
  rawName: string,
  priceListItems: PromotionPriceListItem[],
  promoPrice: number | null = null,
): PromotionProductMatch | null => {
  const priceCompatibleItems = promoPrice === null || !Number.isFinite(promoPrice)
    ? priceListItems
    : priceListItems.filter((item) => item.regularPrice >= promoPrice);

  const scored = priceCompatibleItems
    .map((item) => ({ item, ...itemMatchScore(rawName, item) }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.packageConflict || best.score < 0.45) return null;

  const margin = second ? best.score - second.score : 1;
  if (margin < 0.04 && !best.exactPackage) return null;
  return {
    item: best.item,
    score: best.score,
    exactPackage: best.exactPackage,
  };
};
