import assert from 'node:assert/strict';
import test from 'node:test';

import { managerProductName } from '../../shared/product-display.ts';

test('manager butter labels show the fat percentage before truncation-sensitive text', () => {
  assert.equal(managerProductName('Масло сливочное 72.5% фольга 0,2кг'), 'Масло 72% сл');
  assert.equal(managerProductName('Масло сливочное 82.5% фольга 0.2 кг'), 'Масло 82% сл');
});

test('manager product label keeps other products unchanged', () => {
  assert.equal(managerProductName('Творог 5% фольга 0.2'), 'Творог 5% фольга 0.2');
});
