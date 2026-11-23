import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('tablet seller orders submit every product and treat blank or zero quantities as zero', async () => {
  const source = await readFile(new URL('../../frontend/src/components/OrdersPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /const rowsToSubmit = table\.rows\s*\.map\(\(row\) => \{/);
  assert.match(source, /const requestedPacks = raw \? Number\.parseInt\(raw, 10\) : 0;/);
  assert.match(source, /Number\.isFinite\(requestedPacks\) && requestedPacks >= 0 \? requestedPacks : 0/);
  assert.doesNotMatch(source, /requestedPacks > 0 \? \{ row, requestedPacks \} : null/);
});
