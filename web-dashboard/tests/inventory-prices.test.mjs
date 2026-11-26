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
  assert.doesNotMatch(source, /RAISE EXCEPTION/);
  assert.equal(new Set(rows.map(([, name]) => name)).size, rows.length);
});

test('markdown prices are stored separately from inventory prices', async () => {
  const migration = await readFile(
    new URL('../../services/dubai-backend/migrations/043_markdown_prices.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS markdown_price_rub/);
  assert.match(migration, /SET markdown_price_rub = inventory_price_rub/);

  const api = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
  assert.match(api, /kind === 'markdown' \? \{ markdownPrice: price \} : \{ inventoryPrice: price \}/);
  const panel = await readFile(new URL('../src/panels/products/ProductsPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /updateInventoryPrice\(session\.token, productId, rounded, mode === 'markdown' \? 'markdown' : 'inventory'\)/);
});
