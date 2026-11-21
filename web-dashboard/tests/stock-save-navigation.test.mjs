import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('an earlier optimistic save cannot close or reset the next stock editor', async () => {
  const source = await readFile(new URL('../../frontend/src/screens/StockScreen.tsx', import.meta.url), 'utf8');
  const saveCell = source.slice(source.indexOf('const saveCell = async'), source.indexOf('const resetProductForm'));
  const afterRequest = saveCell.slice(saveCell.indexOf('await stockApi.updateValue'), saveCell.indexOf('} catch (saveError)'));
  const finallyBlock = saveCell.slice(saveCell.indexOf('} finally {'));

  const guardedClose = afterRequest.match(/if \(!advancesOptimistically\)\s*\{\s*setEditingCell\(null\);\s*\}/);
  assert.ok(guardedClose, 'non-optimistic saves should close the editor after success');
  assert.doesNotMatch(
    afterRequest.replace(guardedClose[0], ''),
    /setEditingCell\(null\)/,
    'optimistic completion must leave the next editor open',
  );
  assert.match(finallyBlock, /if \(!advancesOptimistically\)\s*\{\s*setSavingEdit\(false\);\s*\}/);
});
