const BUTTER_LABELS: Array<[RegExp, string]> = [
  [/^Масло\s+сливочное\s+72(?:[.,]5)?%/i, 'Масло 72% сл'],
  [/^Масло\s+сливочное\s+82(?:[.,]5)?%/i, 'Масло 82% сл'],
];

const BREAD_SECTION_BREAK_PRODUCTS = new Set([
  'Батон Зерновой 0.350 нарезка',
  'Хлеб Тостовый Бородинский 0.430 нарезка',
  'Багет простой 0.250',
]);

export const managerProductName = (name: string): string => {
  const trimmed = name.trim();
  const match = BUTTER_LABELS.find(([pattern]) => pattern.test(trimmed));
  return match ? match[1] : name;
};

export const isBreadSectionBreakProduct = (product: { category: string; name: string }): boolean =>
  product.category === 'Хлеб' && BREAD_SECTION_BREAK_PRODUCTS.has(product.name);
