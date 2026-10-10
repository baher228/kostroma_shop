import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentPreviewController } from '../src/components/documentPreviewState.ts';

const pdf = (fileName = 'invoice.pdf') => ({ type: 'pdf', blob: new Blob(['%PDF-1.7']), fileName });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
};

test('PDF URL is revoked when closed and never revoked twice', async () => {
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke(url); };
  try {
    const controller = new DocumentPreviewController();
    await controller.open('invoice.pdf', async () => pdf());
    const url = controller.state.objectUrl;
    assert.equal(await (await fetch(url)).text(), '%PDF-1.7');
    controller.close();
    controller.close();
    assert.equal(controller.state, null);
    assert.deepEqual(revoked, [url]);
    await assert.rejects(fetch(url));
  } finally { URL.revokeObjectURL = originalRevoke; }
});

test('replacing a PDF revokes its URL before opening a spreadsheet', async () => {
  const controller = new DocumentPreviewController();
  await controller.open('invoice.pdf', async () => pdf());
  const url = controller.state.objectUrl;
  await controller.open('plan.csv', async () => ({ type: 'table', sheets: [{ name: 'План', rows: [['Товар']] }], truncated: false }));
  assert.equal(controller.state.objectUrl, null);
  assert.equal(controller.state.content.type, 'table');
  await assert.rejects(fetch(url));
  controller.close();
});

test('closing a loading PDF invalidates its late result without allocating a URL', async () => {
  const originalCreate = URL.createObjectURL;
  let created = 0;
  URL.createObjectURL = (blob) => { created++; return originalCreate(blob); };
  try {
    const controller = new DocumentPreviewController();
    const pending = deferred();
    const opening = controller.open('invoice.pdf', () => pending.promise);
    controller.close();
    pending.resolve(pdf());
    await opening;
    assert.equal(controller.state, null);
    assert.equal(created, 0);
  } finally { URL.createObjectURL = originalCreate; }
});

test('a late first request cannot replace a newer preview or report its error', async () => {
  const controller = new DocumentPreviewController();
  const pending = deferred();
  const first = controller.open('first.pdf', () => pending.promise);
  await controller.open('second.pdf', async () => pdf('second.pdf'));
  const secondUrl = controller.state.objectUrl;
  pending.reject(new Error('Old request failed'));
  await first;
  assert.equal(controller.state.fileName, 'second.pdf');
  assert.equal(controller.state.error, '');
  assert.equal(controller.state.objectUrl, secondUrl);
  controller.close();
});

test('unsubscribing and closing, as on component unmount, prevents late state updates', async () => {
  const controller = new DocumentPreviewController();
  const seen = [];
  const unsubscribe = controller.subscribe((state) => seen.push(state));
  const pending = deferred();
  const opening = controller.open('invoice.pdf', () => pending.promise);
  unsubscribe();
  controller.close();
  const count = seen.length;
  pending.resolve(pdf());
  await opening;
  assert.equal(seen.length, count);
  assert.equal(controller.state, null);
});
