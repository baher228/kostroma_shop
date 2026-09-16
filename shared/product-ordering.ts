export type ProductOrderLike = {
  category: string;
  name: string;
};

const CHEESE_ORDER = [
  'Премиум Ф',
  'Шоколадное Ф',
  'Боговарово Ф',
  'Малыш Вохма',
  'Российский Вохма',
  'Золотое кольцо',
  'Амстердам Мант',
  'Гауда Мант',
  'Голландский Мант',
  'Костромской Вохм',
  'Пошехонский Мант',
  'Тильзитер Мант',
  'Эдам Мант',
];

const GALICH_BREAD_ORDER = [
  'Батон Нарезной 0.350 нарезка',
  'Батон с отрубями 0.300 нарезка',
  'Батон Горчичный 0.350 нарезка',
  'Батон Зерновой 0.350 нарезка',
  'Хлеб Дарницкий 0.300 нарезка',
  'Хлеб Дарницкий 0.600 нарезка',
  'Хлеб Красносельский 0.400 нарезка',
  'Хлеб Тостовый 0.430 нарезка',
  'Хлеб Тостовый с отрубями 0.430 нарезка',
  'Хлеб Гречишный на меду 0,4 нарезка',
  'Хлеб Тостовый Бородинский 0.430 нарезка',
  'Багет простой 0.250',
  'Хлеб Пшеничный на закваске 0.400 нарезка',
  'Хлеб Мультизерновой на закваске 0.400 нарезка',
  'Хлеб Фермерский на закваске 0,4 нарезка',
  'Хлеб Сибирский 0.300 нарезка',
  'Хлеб Семечко 0.300 нарезка',
  'Лепёшка с сыром 0.100',
  'Чиабаттини пшеничная 0,130',
];

const GALICH_BAKERY_ORDER = [
  'Рулет с изюмом 0.300',
  'Плюшка Новомосковская 0.150',
  'Штрудель с абрикосом 0.080',
  'Пирожное Безе',
  'Пирожное заварное Эклер',
  'Пирожное Паутинка',
  'Пирожное Корж Новинка',
  'Пирожное Сочни с творогом',
  'Пирожное Кексики бисквитные',
];

const PRODUCT_ORDER_BY_CATEGORY: Record<string, string[]> = {
  'Хлеб': GALICH_BREAD_ORDER,
  'Выпечка': GALICH_BAKERY_ORDER,
  'Сыр': CHEESE_ORDER,
  'Твердый сыр': CHEESE_ORDER,
  'Мягкий сыр': CHEESE_ORDER,
  'Творожный сыр': CHEESE_ORDER,
  'Йогурты': [
    'Йогурт Абрикос 2,5% ПЭТ 480 г',
    'Йогурт Клубника 2,5% ПЭТ 480 г',
    'Биойогурт Малина 3% стак 0,18 кг',
    'Биойогурт Земляника 3% стак 0,18 кг',
    'Биойогурт Персик-Маракуйя 3% стак 0,18 кг',
    'Биойогурт Черника 3% стак 0,18 кг',
    'Биойогурт с бифидобактериями 3,5% стак 0,33 кг',
  ],
  'Кефир, Ряженка, Снежок': [
    'Кефир 1.0% ПЭТ 480 гр.',
    'Кефир 3.2% п/э 0.5 кг',
    'Снежок 2,5% 0,48 кг ПЭТ, кг',
    'Ряженка 3.2% ПЭТ 480 гр.',
  ],
  'Молоко': [
    'Молоко 1,5% ПЭТ 930 мл',
    'Молоко 3,2% ПЭТ 930 мл',
    'Молоко 3.2% п/э 0,9 л',
    'Молоко 3.2% ПЭТ 1,4 л',
    'Молоко 2.5% ПЭТ 930 мл',
    'Топленое молоко 3.2% ПЭТ 480 гр.',
  ],
  'Сметана': [
    'Сметана 15% ст 0.25 кг',
    'Сметана 20% ст 0.25 кг',
  ],
  'Творог': [
    'Творог 5% фольга 0.2',
    'Творог 5% пакет 0.27кг',
    'Масло сливочное 61.5% фольга 0.2 кг',
    'Масло сливочное 72.5% фольга 0,2кг',
    'Масло сливочное 72.5% фольга 0.2 кг',
    'Масло сливочное 82.5% фольга 0,2кг',
    'Масло сливочное 82.5% фольга 0.2 кг',
  ],
};

const PRODUCT_RANK_BY_CATEGORY = new Map(
  Object.entries(PRODUCT_ORDER_BY_CATEGORY).map(([category, names]) => [
    category,
    new Map(names.map((name, index) => [name, index])),
  ]),
);

const PRODUCT_CATEGORY_RANK = new Map(
  Object.keys(PRODUCT_ORDER_BY_CATEGORY).map((category, index) => [category, index]),
);

const compareOptionalNumbers = (left: number | undefined, right: number | undefined): number | null => {
  if (left !== undefined && right !== undefined && left !== right) {
    return left - right;
  }
  if (left !== undefined && right === undefined) {
    return -1;
  }
  if (left === undefined && right !== undefined) {
    return 1;
  }
  return null;
};

export const sortProductsLikeImage = <T extends ProductOrderLike>(rows: T[]): T[] => {
  const withIndex = rows.map((row, index) => ({ row, index }));
  withIndex.sort((left, right) => {
    const leftCategoryRank = PRODUCT_CATEGORY_RANK.get(left.row.category);
    const rightCategoryRank = PRODUCT_CATEGORY_RANK.get(right.row.category);
    const categoryComparison = compareOptionalNumbers(leftCategoryRank, rightCategoryRank);
    if (categoryComparison !== null) {
      return categoryComparison;
    }

    const leftRank = PRODUCT_RANK_BY_CATEGORY.get(left.row.category)?.get(left.row.name);
    const rightRank = PRODUCT_RANK_BY_CATEGORY.get(right.row.category)?.get(right.row.name);
    const productComparison = compareOptionalNumbers(leftRank, rightRank);
    if (productComparison !== null) {
      return productComparison;
    }

    return left.index - right.index;
  });
  return withIndex.map(({ row }) => row);
};
