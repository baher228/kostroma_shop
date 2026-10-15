// Where each shop and product lands in the supplier's «Тонары сыр» order form.
// The form has 5 identical blocks of 22 rows. In each block the seller name is on row 6,
// the shop name on row 9, and quantities for 13 cheeses on rows 11–23, in columns C, E, G, I, K, M.

export type CheeseOrderShop = { id: string; name: string };
export type CheeseOrderRow = { productId: string; productName: string; shopValues: Record<string, number> };

const BLOCK_ROWS = 22;
const SHOP_ROW = 9;
const FIRST_PRODUCT_ROW = 11;
const QUANTITY_COLUMNS = ['C', 'E', 'G', 'I', 'K', 'M'] as const;

export const CHEESE_TEMPLATE_PRODUCTS: Array<{ name: string; article: string }> = [
  { name: 'Премиум Ф', article: 'С00001584' },
  { name: 'Шоколадное Ф', article: 'С00001507' },
  { name: 'Боговарово Ф', article: 'С00001549' },
  { name: 'Малыш Вохма', article: 'С00001608' },
  { name: 'Российский Вохма', article: 'С00000240' },
  { name: 'Золотое кольцо', article: 'С00001794' },
  { name: 'Амстердам Мант', article: 'С00001798' },
  { name: 'Гауда Мант', article: 'С00001803' },
  { name: 'Голландский Мант', article: 'С00001804' },
  { name: 'Костромской Вохм', article: 'С00001219' },
  { name: 'Пошехонский Мант', article: 'С00001807' },
  { name: 'Тильзитер Мант', article: 'С00001809' },
  { name: 'Эдам Мант', article: 'С00001810' },
];

// [shop, seller] as written in the form, block by block, left to right.
const TEMPLATE_BLOCKS: Array<Array<[shop: string, seller: string]>> = [
  [['Костромская', 'Плетнёва'], ['Долгая поляна', 'Плетнева'], ['Профсоюзная', 'Плетнева'], ['Студенческий1', 'Маркова'], ['Кинешемка', 'Маркова'], ['Шагова', 'Штырбу']],
  [['Черноречье', 'Штырбу'], ['Южная', 'Штырбу'], ['Рабочий', 'Травина'], ['Бам', 'Травина'], ['пр.мира', 'Петухова'], ['Красное', 'Петухова']],
  [['Ленина', 'Петухова'], ['Сутырина', 'Платошина'], ['Юбилейный', 'Платошина'], ['Титова', 'Морозова'], ['Магистральная', 'Морозова'], ['Дав 2', 'Маскатова']],
  [['Октябрьский', 'Маскатова'], ['Ив.Сус', 'Виноградова'], ['Давыд', 'Виноградова'], ['Боровая', 'Смирнова С.С.'], ['Голубкова', 'Смирнова С.С.'], ['Малышковск', 'Рассадина']],
  [['Паново', 'Рассадина'], ['Профсоюзная', 'Рассадина']],
];

// Form name → platform names, where they differ.
const SHOP_ALIASES: Record<string, string[]> = {
  'Долгая поляна': ['Индустриальная'],
  'Малышковск': ['Малышкого'],
  'Студенческий1': ['Студенческий'],
  'Ив.Сус': ['Сусанино'],
  'пр.мира': ['Пр.Мира'],
  'Дав 2': ['Дав2', 'Дав2 у Сбера'],
  'Давыд': ['Давыдовский'],
  'Шагова': ['Шагово'],
  'Паново': ['Панова'],
};
// The form has two «Профсоюзная» shops; the platform tells them apart by number.
const SHOP_ALIASES_BY_CELL: Record<string, string[]> = {
  G9: ['Профсоюзная33'],
  E97: ['Профсоюзная25.2'],
};
const SELLER_ALIASES: Record<string, string[]> = {
  'Смирнова С.С.': ['Смирнова'],
};

export type CheeseTemplateSlot = {
  shopCell: string;
  column: string;
  firstProductRow: number;
  shops: string[];
  sellers: string[];
};

export const CHEESE_TEMPLATE_SLOTS: CheeseTemplateSlot[] = TEMPLATE_BLOCKS.flatMap((block, blockIndex) =>
  block.map(([shop, seller], index) => {
    const column = QUANTITY_COLUMNS[index];
    const shopCell = `${column}${SHOP_ROW + blockIndex * BLOCK_ROWS}`;
    return {
      shopCell,
      column,
      firstProductRow: FIRST_PRODUCT_ROW + blockIndex * BLOCK_ROWS,
      shops: SHOP_ALIASES_BY_CELL[shopCell] ?? [shop, ...(SHOP_ALIASES[shop] ?? [])],
      sellers: [seller, ...(SELLER_ALIASES[seller] ?? [])],
    };
  }),
);

const normalize = (value: string): string => value.toLowerCase().replace(/ё/g, 'е').replace(/[\s\-–—]+/g, '');

// Platform shop names look like «Магистральная - Морозова» (shop, then seller).
export const splitShopName = (name: string): { shop: string; seller: string } => {
  const match = name.match(/^(.*?)\s*[-–—]\s*(.*)$/);
  return match ? { shop: match[1].trim(), seller: match[2].trim() } : { shop: name.trim(), seller: '' };
};

// Shop + seller first, ignoring spaces and dashes («Красное Петухова», «Дав2 у Сбера-Маскатова»);
// otherwise the shop name alone, if only one platform shop has it.
const findShop = (slot: CheeseTemplateSlot, shops: CheeseOrderShop[]): CheeseOrderShop | undefined => {
  const fullNames = new Set(slot.shops.flatMap((shop) => slot.sellers.map((seller) => normalize(shop + seller))));
  const exact = shops.find((shop) => fullNames.has(normalize(shop.name)));
  if (exact) return exact;
  const shopNames = new Set(slot.shops.map(normalize));
  const sameShop = shops.filter((shop) => shopNames.has(normalize(splitShopName(shop.name).shop)));
  return sameShop.length === 1 ? sameShop[0] : undefined;
};

const articleKey = (article: string): string => article.replace(/^С/, 'c').toLowerCase();

const findTemplateProductIndex = (row: CheeseOrderRow): number =>
  CHEESE_TEMPLATE_PRODUCTS.findIndex(
    (product) =>
      normalize(product.name) === normalize(row.productName) ||
      row.productId.toLowerCase().endsWith(`_${articleKey(product.article)}`),
  );

const formatDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

export const fillCheeseOrderTemplate = (params: {
  rows: CheeseOrderRow[];
  shops: CheeseOrderShop[];
  exportDate: string;
  orderDate: string;
}): { values: Record<string, string | number>; unplacedShops: string[]; unplacedProducts: string[] } => {
  const values: Record<string, string | number> = {
    A1: `Дата заявки: ${formatDate(params.exportDate)}`,
    D1: formatDate(params.orderDate),
  };
  const placedShopIds = new Set<string>();
  const productRows = params.rows.map((row) => ({ row, index: findTemplateProductIndex(row) }));

  for (const slot of CHEESE_TEMPLATE_SLOTS) {
    const shop = findShop(slot, params.shops);
    if (!shop || placedShopIds.has(shop.id)) continue;
    placedShopIds.add(shop.id);
    for (const { row, index } of productRows) {
      const value = row.shopValues[shop.id] ?? 0;
      if (index >= 0 && value) values[`${slot.column}${slot.firstProductRow + index}`] = value;
    }
  }

  const hasOrders = (shopId: string) => params.rows.some((row) => (row.shopValues[shopId] ?? 0) > 0);
  const unplacedShops = params.shops.filter((shop) => !placedShopIds.has(shop.id) && hasOrders(shop.id)).map((shop) => shop.name);
  const unplacedProducts = productRows
    .filter(({ row, index }) => index < 0 && Object.values(row.shopValues).some((value) => value > 0))
    .map(({ row }) => row.productName);
  return { values, unplacedShops, unplacedProducts };
};
