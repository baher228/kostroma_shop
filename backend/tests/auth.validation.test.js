const assert = require('node:assert/strict');
const test = require('node:test');

const { signSessionToken, verifySessionToken } = require('../dist/auth');
const {
  loginSchema,
  createRowSchema,
  updateRowSchema,
  createTaskSchema,
  updateTaskStatusSchema,
  createUserSchema,
  createSupportThreadSchema,
  createSupportMessageSchema,
} = require('../dist/validation');

const sessionUser = {
  id: 'u1',
  username: 'manager',
  firstName: 'Main',
  lastName: 'Manager',
  fullName: 'Main Manager',
  role: 'manager',
  shopId: null,
  shopName: null,
};

test('signSessionToken/verifySessionToken roundtrip works', () => {
  const token = signSessionToken(sessionUser);
  const decoded = verifySessionToken(token);
  assert.deepEqual(decoded, sessionUser);
});

test('verifySessionToken rejects invalid token', () => {
  assert.equal(verifySessionToken('definitely-not-a-token'), null);
});

test('loginSchema trims and validates username/password', () => {
  const parsed = loginSchema.parse({ username: '  Worker.User  ', password: '123456' });
  assert.equal(parsed.username, 'worker.user');
  assert.equal(parsed.password, '123456');
});

test('createRowSchema requires meaningful name', () => {
  assert.throws(() => createRowSchema.parse({ name: 'a' }));
  const parsed = createRowSchema.parse({ name: '  Apples  ' });
  assert.equal(parsed.name, 'Apples');
});

test('updateRowSchema rejects empty updates and accepts numeric values only', () => {
  assert.throws(() => updateRowSchema.parse({}));
  const parsed = updateRowSchema.parse({ values: { stockTue: '12345', orderThu: '12' } });
  assert.equal(parsed.values.stockTue, '12345');
  assert.equal(parsed.values.orderThu, '12');
  assert.throws(() => updateRowSchema.parse({ values: { stockTue: '12abc' } }));
});

test('task schemas validate title, deadline and photo requirement', () => {
  const created = createTaskSchema.parse({
    title: '  Pack apples  ',
    assigneeId: 'u2',
    deadlineAt: '2026-05-01T10:00:00.000Z',
    requiresPhotoConfirmation: true,
  });
  assert.equal(created.title, 'Pack apples');
  assert.equal(created.assigneeId, 'u2');
  assert.equal(created.deadlineAt, '2026-05-01T10:00:00.000Z');
  assert.equal(created.requiresPhotoConfirmation, true);
  assert.equal(updateTaskStatusSchema.parse({ status: 'done', photoConfirmationUrl: 'https://example.com/x.jpg' }).status, 'done');
  assert.throws(() => updateTaskStatusSchema.parse({ status: 'closed' }));
});

test('createUserSchema validates username, name fields and role', () => {
  const parsed = createUserSchema.parse({
    username: '  worker.user  ',
    firstName: '  Иван  ',
    lastName: '  Петров  ',
    password: 'secret123',
    role: 'worker',
  });
  assert.equal(parsed.username, 'worker.user');
  assert.equal(parsed.firstName, 'Иван');
  assert.equal(parsed.lastName, 'Петров');
  assert.equal(parsed.role, 'worker');
  assert.throws(() => createUserSchema.parse({
    username: 'bad name',
    firstName: 'A',
    lastName: 'Petrov',
    password: 'secret123',
    role: 'worker',
  }));
});

test('support schemas validate category, subject and body', () => {
  const thread = createSupportThreadSchema.parse({
    category: 'technical_failure',
    subject: ' POS terminal issue ',
    body: ' Terminal stopped printing receipts ',
  });
  assert.equal(thread.category, 'technical_failure');
  assert.equal(thread.subject, 'POS terminal issue');
  assert.equal(thread.body, 'Terminal stopped printing receipts');
  const message = createSupportMessageSchema.parse({ body: '  Need manager help  ' });
  assert.equal(message.body, 'Need manager help');
});
