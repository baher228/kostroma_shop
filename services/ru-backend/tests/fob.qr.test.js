const assert = require('node:assert/strict');
const test = require('node:test');

const worker = {
  id: 'worker_1',
  username: 'worker',
  firstName: 'Worker',
  lastName: 'One',
  fullName: 'Worker One',
  role: 'worker',
  shopId: 'shop_main',
  shopName: null,
};

const tablet = {
  id: 'tablet_1',
  username: 'tablet-main',
  firstName: 'Main',
  lastName: 'Tablet',
  fullName: 'Main Tablet',
  role: 'store_tablet',
  shopId: 'shop_main',
  shopName: 'Main shop',
};

const installDbMock = (handler) => {
  const personalDbPath = require.resolve('../dist/db/personalDb');
  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: handler,
      },
    },
  };
  delete require.cache[require.resolve('../dist/repositories/fobRepository')];
  return require('../dist/repositories/fobRepository');
};

test('FOB challenge contains no worker personal data', async () => {
  const { createFobChallenge } = installDbMock(async (sql, params = []) => {
    assert.equal(params[1], worker.id);
    assert.equal(sql.includes('INSERT INTO fob_qr_challenges'), true);
    return { rows: [{ id: params[0], expires_at: '2026-05-17T08:00:30.000Z' }] };
  });

  const challenge = await createFobChallenge(worker);
  const payload = JSON.parse(challenge.payload);
  assert.equal(payload.type, 'fob_challenge');
  assert.equal(typeof payload.challengeId, 'string');
  assert.equal(challenge.payload.includes(worker.id), false);
  assert.equal(challenge.payload.includes(worker.fullName), false);
});

test('FOB scan consumes challenge and toggles worker status', async () => {
  const calls = [];
  const payload = JSON.stringify({ type: 'fob_challenge', challengeId: 'fob_ok' });
  const { redeemFobChallenge } = installDbMock(async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql === 'BEGIN;' || sql === 'COMMIT;' || sql === 'ROLLBACK;') return { rows: [] };
    if (sql.includes('FROM fob_qr_challenges')) {
      return {
        rows: [{
          challenge_id: 'fob_ok',
          worker_id: worker.id,
          username: worker.username,
          first_name: worker.firstName,
          last_name: worker.lastName,
          shop_id: worker.shopId,
          current_status: 'out',
        }],
      };
    }
    if (sql.includes('UPDATE fob_qr_challenges')) return { rows: [] };
    if (sql.includes('INSERT INTO worker_checkin_status')) {
      return {
        rows: [{
          worker_id: worker.id,
          worker_display_name: worker.fullName,
          status: 'in',
          last_changed_at: '2026-05-17T08:00:00.000Z',
          shop_id: tablet.shopId,
          shop_name: tablet.shopName,
          source: 'tablet_qr',
          scanned_by_tablet_id: tablet.id,
          scanned_by_tablet_display_name: tablet.fullName,
        }],
      };
    }
    if (sql.includes('INSERT INTO worker_checkin_events')) {
      return {
        rows: [{
          id: params[0],
          worker_id: worker.id,
          worker_display_name: worker.fullName,
          status: 'in',
          event_at: '2026-05-17T08:00:00.000Z',
          shop_id: tablet.shopId,
          shop_name: tablet.shopName,
          source: 'tablet_qr',
          scanned_by_tablet_id: tablet.id,
          scanned_by_tablet_display_name: tablet.fullName,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await redeemFobChallenge(payload, tablet);

  assert.equal(result.status.status, 'in');
  assert.equal(result.event.source, 'tablet_qr');
  assert.equal(result.event.scannedByTabletId, tablet.id);
  assert.equal(calls.some((call) => call.sql.includes('UPDATE fob_qr_challenges')), true);
  assert.equal(calls.some((call) => call.sql === 'COMMIT;'), true);
});

test('FOB scan rejects expired or reused challenge', async () => {
  const { redeemFobChallenge, FobScanError } = installDbMock(async (sql) => {
    if (sql === 'BEGIN;' || sql === 'ROLLBACK;') return { rows: [] };
    if (sql.includes('FROM fob_qr_challenges')) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await assert.rejects(
    () => redeemFobChallenge(JSON.stringify({ type: 'fob_challenge', challengeId: 'fob_used' }), tablet),
    (error) => error instanceof FobScanError && error.reason === 'expired_or_used',
  );
});

test('FOB scan rejects wrong store tablet', async () => {
  const { redeemFobChallenge, FobScanError } = installDbMock(async (sql) => {
    if (sql === 'BEGIN;' || sql === 'ROLLBACK;') return { rows: [] };
    if (sql.includes('FROM fob_qr_challenges')) {
      return {
        rows: [{
          challenge_id: 'fob_wrong',
          worker_id: worker.id,
          username: worker.username,
          first_name: worker.firstName,
          last_name: worker.lastName,
          shop_id: 'other_shop',
          current_status: null,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await assert.rejects(
    () => redeemFobChallenge(JSON.stringify({ type: 'fob_challenge', challengeId: 'fob_wrong' }), tablet),
    (error) => error instanceof FobScanError && error.reason === 'wrong_shop',
  );
});
