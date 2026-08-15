const assert = require('node:assert/strict');
const test = require('node:test');

const { createDubaiApp } = require('../dist/app/dubaiApp');

test('Dubai API exposes download filename and length headers to the browser', async (context) => {
  const server = createDubaiApp().listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });

  assert.equal(response.status, 200);
  const exposed = (response.headers.get('access-control-expose-headers') || '')
    .toLowerCase()
    .split(',')
    .map((item) => item.trim());
  assert.ok(exposed.includes('content-disposition'));
  assert.ok(exposed.includes('content-length'));
});
