import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('bread inventory migration assigns every table price without changing products', async () => {
  const source = await readFile(
    new URL('../../services/dubai-backend/migrations/038_seed_bread_inventory_prices.sql', import.meta.url),
    'utf8',
  );
  const rows = [...source.matchAll(/\('([^']+)', (\d+)\)/g)];

  assert.equal(rows.length, 29);
  assert.match(source, /UPDATE stock_products products\s+SET inventory_price_rub = prices\.inventory_price_rub/);
  assert.match(source, /products\.business_category = 'Хлеб'/);
  assert.match(source, /Expected 29 bread inventory prices to match/);
  assert.equal(new Set(rows.map(([, name]) => name)).size, rows.length);
});
