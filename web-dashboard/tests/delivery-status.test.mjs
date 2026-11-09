import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countDeliveryStatuses,
  deliveryStatus,
  formatClockMinutes,
  isDeliveryDay,
  moscowDateKey,
  moscowDateTimeToIso,
  parseClockMinutes,
} from '../../shared/delivery-status.ts';

const schedule = { windowStartMinutes: 7 * 60, windowEndMinutes: 8 * 60, weekdays: [1, 3, 5] };
const at = (dateKey, clock) => new Date(moscowDateTimeToIso(dateKey, parseClockMinutes(clock)));

test('Moscow clock helpers round-trip', () => {
  assert.equal(moscowDateTimeToIso('2026-11-09', 7 * 60 + 12), '2026-11-09T04:12:00.000Z');
  assert.equal(moscowDateKey(new Date('2026-11-09T22:30:00Z')), '2026-11-10');
  assert.equal(formatClockMinutes(390), '6:30');
  assert.equal(parseClockMinutes('06:30'), 390);
  assert.equal(parseClockMinutes('25:00'), null);
});

test('delivery days follow the selected weekdays', () => {
  assert.equal(isDeliveryDay(schedule, '2026-11-09'), true); // Monday
  assert.equal(isDeliveryDay(schedule, '2026-11-10'), false); // Tuesday
});

test('receipts inside the window are on time, after it late, without photo flagged', () => {
  const now = at('2026-11-09', '12:00');
  assert.equal(deliveryStatus(schedule, '2026-11-09', { receivedAt: at('2026-11-09', '7:12').toISOString(), hasInvoicePhoto: true }, now), 'on_time');
  assert.equal(deliveryStatus(schedule, '2026-11-09', { receivedAt: at('2026-11-09', '8:14').toISOString(), hasInvoicePhoto: true }, now), 'late');
  assert.equal(deliveryStatus(schedule, '2026-11-09', { receivedAt: at('2026-11-09', '7:40').toISOString(), hasInvoicePhoto: false }, now), 'no_photo');
});

test('unmarked deliveries are expected until the window ends, then missed', () => {
  assert.equal(deliveryStatus(schedule, '2026-11-09', null, at('2026-11-09', '7:30')), 'expected');
  assert.equal(deliveryStatus(schedule, '2026-11-09', null, at('2026-11-09', '8:01')), 'missed');
  assert.equal(deliveryStatus(schedule, '2026-11-11', null, at('2026-11-09', '9:00')), 'expected');
  assert.equal(deliveryStatus(schedule, '2026-11-06', null, at('2026-11-09', '6:00')), 'missed');
});

test('statuses are counted per kind', () => {
  assert.deepEqual(countDeliveryStatuses(['on_time', 'late', 'on_time', 'missed']), {
    on_time: 2, late: 1, no_photo: 0, missed: 1, expected: 0,
  });
});
