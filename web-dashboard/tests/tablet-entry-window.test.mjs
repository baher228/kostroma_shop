import assert from 'node:assert/strict';
import test from 'node:test';

import { isTabletEntryOpenForDate, isTabletEntryOpenToday } from '../../shared/entry-window.ts';

test('a day opens for entry at 18:00 local time on that day', () => {
  assert.equal(isTabletEntryOpenForDate('2026-11-26', new Date(2026, 10, 26, 17, 59, 59)), false);
  assert.equal(isTabletEntryOpenForDate('2026-11-26', new Date(2026, 10, 26, 18, 0, 0)), true);
  assert.equal(isTabletEntryOpenForDate('2026-11-26', new Date(2026, 10, 26, 23, 59)), true);
});

test('earlier days stay open and later days stay closed', () => {
  assert.equal(isTabletEntryOpenForDate('2026-11-25', new Date(2026, 10, 26, 9, 0)), true);
  assert.equal(isTabletEntryOpenForDate('2026-11-27', new Date(2026, 10, 26, 20, 0)), false);
});

test('today is closed before 18:00 and closes again after midnight', () => {
  assert.equal(isTabletEntryOpenToday(new Date(2026, 10, 26, 12, 0)), false);
  assert.equal(isTabletEntryOpenToday(new Date(2026, 10, 26, 18, 30)), true);
  assert.equal(isTabletEntryOpenToday(new Date(2026, 10, 27, 0, 30)), false);
});
