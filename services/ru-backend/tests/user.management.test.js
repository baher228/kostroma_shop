const assert = require('node:assert/strict');
const test = require('node:test');

test('user management store supports update, password reset, and delete', async () => {
  const calls = [];
  const personalDbPath = require.resolve('../dist/personalDb');

  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: async (sql, params = []) => {
          calls.push({ sql, params });
          if (sql.includes('UPDATE users') && sql.includes('SET username')) {
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes('UPDATE users') && sql.includes('password_hash')) {
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes('DELETE FROM users')) {
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes('FROM users u')) {
            assert.match(sql, /NULL::text AS shop_name/);
            return {
              rows: [{
                id: params[0],
                username: 'admin',
                first_name: 'Admin',
                last_name: 'User',
                role: 'manager',
                password_hash: 'hash',
                shop_id: null,
                shop_name: null,
              }],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/userStore')];
  const { deleteUser, updateUser, updateUserPassword } = require('../dist/userStore');

  const updated = await updateUser('u_admin_01', {
    username: 'admin',
    firstName: 'Admin',
    lastName: 'User',
    role: 'manager',
    shopId: null,
  });
  assert.equal(updated.username, 'admin');
  assert.equal(await updateUserPassword('u_admin_01', 'hash'), true);
  assert.equal(await deleteUser('u_worker_01'), true);
  assert.equal(calls.some((call) => call.sql.includes('SET username')), true);
  assert.equal(calls.some((call) => call.sql.includes('password_hash')), true);
  assert.equal(calls.some((call) => call.sql.includes('DELETE FROM users')), true);
});
