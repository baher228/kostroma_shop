import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeliveryMonthReport, monthDays, moscowDateTimeToIso } from '../../shared/delivery-status.ts';

const iso = (date, hours, minutes = 0) => moscowDateTimeToIso(date, hours * 60 + minutes);
const shops = [{ id: 'les', name: 'Лесная' }, { id: 'cen', name: 'Центральная' }];
const supplier = (id, shopId, name) => ({
  id, shopId, name, windowStartMinutes: 7 * 60, windowEndMinutes: 8 * 60, weekdays: [0, 1, 2, 3, 4, 5, 6], createdAt: iso('2026-11-01', 0),
});
const receipt = (supplierId, date, hours, minutes, hasInvoicePhoto, markDelay = 0) => ({
  supplierId, date, receivedAt: iso(date, hours, minutes), markedAt: iso(date, hours, minutes + markDelay), hasInvoicePhoto,
});

test('monthDays covers the whole month and flags weekends', () => {
  const days = monthDays('2026-11-09');
  assert.equal(days.length, 30);
  assert.deepEqual(days.filter((day) => day.weekend).map((day) => day.day), [1, 7, 8, 14, 15, 21, 22, 28, 29]);
});

test('month report grids problems per shop/day and aggregates shops and suppliers', () => {
  const suppliers = [supplier('a', 'les', 'Хлебозавод'), supplier('b', 'les', 'Молочный двор'), supplier('c', 'cen', 'Хлебозавод')];
  const receipts = [
    receipt('a', '2026-11-01', 7, 30, true, 4),
    receipt('b', '2026-11-01', 8, 20, false, 6),
    receipt('a', '2026-11-02', 8, 40, true),
    receipt('c', '2026-11-01', 7, 10, true),
    receipt('c', '2026-11-02', 7, 10, true),
  ];
  const report = buildDeliveryMonthReport({ shops, suppliers, receipts, today: '2026-11-02', now: new Date(iso('2026-11-02', 12)) });

  const les = report.shops[0];
  assert.deepEqual(les.cells.slice(0, 3).map((cell) => cell.problems), [1, 1, null]);
  assert.match(les.cells[0].details.join(';'), /Молочный двор — опоздал на 20 мин;Молочный двор — без фото накладной/);
  assert.deepEqual(les.cells[1].details, ['Хлебозавод — опоздал на 40 мин', 'Молочный двор — не отмечено']);
  assert.equal(les.due, 4);
  assert.equal(les.withPhoto, 2);
  assert.equal(les.missed, 1);
  assert.equal(les.noPhoto, 1);
  assert.equal(les.avgMarkDelayMinutes, 10 / 3);

  assert.deepEqual(report.shops[1].cells.slice(0, 2).map((cell) => cell.problems), [0, 0]);

  const [bread, milk] = report.suppliers;
  assert.deepEqual(bread, { name: 'Хлебозавод', due: 4, late: 1, onTimeShare: 0.75, avgLateMinutes: 40 });
  assert.deepEqual(milk, { name: 'Молочный двор', due: 2, late: 1, onTimeShare: 0.5, avgLateMinutes: 20 });
});

test('month report skips pending deliveries and days before a supplier existed', () => {
  const late = { ...supplier('a', 'les', 'Хлебозавод'), createdAt: iso('2026-11-02', 9) };
  const report = buildDeliveryMonthReport({ shops, suppliers: [late], receipts: [], today: '2026-11-02', now: new Date(iso('2026-11-02', 7, 30)) });
  assert.deepEqual(report.shops[0].cells.slice(0, 2).map((cell) => cell.problems), [null, null]);
  assert.equal(report.counts.expected, 1);
  assert.deepEqual(report.suppliers, []);
});
