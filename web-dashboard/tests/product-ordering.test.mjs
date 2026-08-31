import assert from 'node:assert/strict';
import test from 'node:test';

import { sortProductsLikeImage } from '../../shared/product-ordering.ts';

test('flat milk table keeps the old subcategory block order', () => {
  const rows = [
    { category: 'Творог', name: 'Масло сливочное 82.5% фольга 0.2 кг' },
    { category: 'Кефир, Ряженка, Снежок', name: 'Кефир 1.0% ПЭТ 480 гр.' },
    { category: 'Йогурты', name: 'Йогурт Абрикос 2,5% ПЭТ 480 г' },
    { category: 'Молоко', name: 'Молоко 3,2% ПЭТ 930 мл' },
    { category: 'Сметана', name: 'Сметана 15% ст 0.25 кг' },
    { category: 'Йогурты', name: 'Биойогурт Черника 3% стак 0,18 кг' },
  ];

  assert.deepEqual(
    sortProductsLikeImage(rows).map((row) => row.name),
    [
      'Йогурт Абрикос 2,5% ПЭТ 480 г',
      'Биойогурт Черника 3% стак 0,18 кг',
      'Кефир 1.0% ПЭТ 480 гр.',
      'Молоко 3,2% ПЭТ 930 мл',
      'Сметана 15% ст 0.25 кг',
      'Масло сливочное 82.5% фольга 0.2 кг',
    ],
  );
});

test('unknown products keep their relative order inside a known category', () => {
  const rows = [
    { category: 'Йогурты', name: 'Новый йогурт 1' },
    { category: 'Йогурты', name: 'Йогурт Клубника 2,5% ПЭТ 480 г' },
    { category: 'Йогурты', name: 'Новый йогурт 2' },
  ];

  assert.deepEqual(
    sortProductsLikeImage(rows).map((row) => row.name),
    [
      'Йогурт Клубника 2,5% ПЭТ 480 г',
      'Новый йогурт 1',
      'Новый йогурт 2',
    ],
  );
});
