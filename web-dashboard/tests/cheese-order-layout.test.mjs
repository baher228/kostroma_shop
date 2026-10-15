import assert from 'node:assert/strict';
import test from 'node:test';

import { fillCheeseOrderTemplate, splitShopName } from '../src/export/cheeseOrderLayout.ts';

const row = (productId, productName, shopValues) => ({ productId, productName, shopValues });

test('dates go to A1 (export day) and D1 («Заказ на» date)', () => {
  const { values } = fillCheeseOrderTemplate({ rows: [], shops: [], exportDate: '2026-10-12', orderDate: '2026-10-13' });
  assert.equal(values.A1, 'Дата заявки: 12.10.2026');
  assert.equal(values.D1, '13.10.2026');
});

test('platform shop «Магистральная - Морозова» fills column K of the third block', () => {
  const shops = [{ id: 's1', name: 'Магистральная - Морозова' }];
  const rows = [
    row('prod_cheese_order_c00001584', 'Премиум Ф', { s1: 3 }),
    row('prod_cheese_order_c00001810', 'Эдам Мант', { s1: 5 }),
  ];
  const { values, unplacedShops } = fillCheeseOrderTemplate({ rows, shops, exportDate: '2026-10-12', orderDate: '2026-10-13' });
  assert.equal(values.K55, 3);
  assert.equal(values.K67, 5);
  assert.deepEqual(unplacedShops, []);
});

test('renamed shops and the two «Профсоюзная» columns map to the right cells', () => {
  const shops = [
    { id: 'ind', name: 'Индустриальная - Плетнева' },
    { id: 'p33', name: 'Профсоюзная33 - Плетнева' },
    { id: 'p25', name: 'Профсоюзная25.2-Рассадина' },
    { id: 'mal', name: 'Малышкого - Рассадина' },
    { id: 'mir', name: 'Пр.Мира - Петухова' },
    { id: 'dav', name: 'Дав2 - Маскатова' },
    { id: 'bor', name: 'Боровая - Смирнова' },
  ];
  const ids = shops.map((shop) => shop.id);
  const rows = [row('x', 'Премиум  Ф', Object.fromEntries(ids.map((id, index) => [id, index + 1])))];
  const { values, unplacedShops } = fillCheeseOrderTemplate({ rows, shops, exportDate: '2026-10-12', orderDate: '2026-10-13' });
  assert.equal(values.E11, 1);
  assert.equal(values.G11, 2);
  assert.equal(values.E99, 3);
  assert.equal(values.M77, 4);
  assert.equal(values.K33, 5);
  assert.equal(values.M55, 6);
  assert.equal(values.I77, 7);
  assert.deepEqual(unplacedShops, []);
});

test('shop names as written on the platform: «Панова», «Шагово», «Дав2 у Сбера», no dash', () => {
  const shops = [
    { id: 'pan', name: 'Панова-Рассадина' },
    { id: 'sha', name: 'Шагово-Штырбу' },
    { id: 'dav', name: 'Дав2 у Сбера-Маскатова' },
    { id: 'kra', name: 'Красное Петухова' },
  ];
  const rows = [row('x', 'Премиум Ф', { pan: 1, sha: 2, dav: 3, kra: 4 })];
  const { values, unplacedShops } = fillCheeseOrderTemplate({ rows, shops, exportDate: '2026-10-12', orderDate: '2026-10-13' });
  assert.equal(values.C99, 1);
  assert.equal(values.M11, 2);
  assert.equal(values.M55, 3);
  assert.equal(values.M33, 4);
  assert.deepEqual(unplacedShops, []);
});

test('shops and products that are not in the form are reported', () => {
  const shops = [{ id: 'm', name: 'Main shop' }];
  const rows = [row('p', 'Новый сыр', { m: 2 })];
  const result = fillCheeseOrderTemplate({ rows, shops, exportDate: '2026-10-12', orderDate: '2026-10-13' });
  assert.deepEqual(result.unplacedShops, ['Main shop']);
  assert.deepEqual(result.unplacedProducts, ['Новый сыр']);
});

test('splitShopName handles spaces around the dash', () => {
  assert.deepEqual(splitShopName('Магистральная-Морозова'), { shop: 'Магистральная', seller: 'Морозова' });
  assert.deepEqual(splitShopName('Красное – Петухова'), { shop: 'Красное', seller: 'Петухова' });
});
