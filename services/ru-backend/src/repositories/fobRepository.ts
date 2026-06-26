import { randomBytes } from 'crypto';
import { personalDb } from '../db/personalDb';
import { FobChallenge, SessionUser, WorkerCheckInEvent, WorkerCheckInStatus } from '../domain/types';

const CHALLENGE_TTL_SECONDS = 30;
const REFRESH_AFTER_SECONDS = 15;
const QR_PAYLOAD_TYPE = 'fob_challenge';

type ChallengeRow = {
  id: string;
  expires_at: Date | string;
};

type ChallengeWorkerRow = {
  challenge_id: string;
  worker_id: string;
  username: string;
  first_name: string;
  last_name: string;
  shop_id: string | null;
  current_status: 'in' | 'out' | null;
};

type StatusRow = {
  worker_id: string;
  worker_display_name: string;
  status: 'in' | 'out';
  last_changed_at: Date | string;
  shop_id: string | null;
  shop_name: string | null;
  source: 'manual' | 'tablet_qr';
  scanned_by_tablet_id: string | null;
  scanned_by_tablet_display_name: string | null;
};

type EventRow = StatusRow & {
  id: string;
  event_at: Date | string;
};

export type FobScanResult = {
  status: WorkerCheckInStatus;
  event: WorkerCheckInEvent;
};

export type FobScanFailure = 'invalid_qr' | 'expired_or_used' | 'wrong_shop' | 'tablet_unassigned';

export class FobScanError extends Error {
  reason: FobScanFailure;

  constructor(reason: FobScanFailure) {
    super(reason);
    this.reason = reason;
  }
}

const generateChallengeId = (): string => `fob_${randomBytes(24).toString('base64url')}`;
const generateEventId = (): string => `checkin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const fullName = (row: Pick<ChallengeWorkerRow, 'first_name' | 'last_name'>): string =>
  `${row.first_name} ${row.last_name}`.trim();

const mapStatus = (row: StatusRow): WorkerCheckInStatus => ({
  workerId: row.worker_id,
  workerDisplayName: row.worker_display_name,
  status: row.status,
  lastChangedAt: new Date(row.last_changed_at).toISOString(),
  shopId: row.shop_id,
  shopName: row.shop_name,
  source: row.source,
  scannedByTabletId: row.scanned_by_tablet_id,
  scannedByTabletDisplayName: row.scanned_by_tablet_display_name,
});

const mapEvent = (row: EventRow): WorkerCheckInEvent => ({
  id: row.id,
  workerId: row.worker_id,
  workerDisplayName: row.worker_display_name,
  status: row.status,
  eventAt: new Date(row.event_at).toISOString(),
  shopId: row.shop_id,
  shopName: row.shop_name,
  source: row.source,
  scannedByTabletId: row.scanned_by_tablet_id,
  scannedByTabletDisplayName: row.scanned_by_tablet_display_name,
});

export const createFobChallenge = async (worker: SessionUser): Promise<FobChallenge> => {
  const id = generateChallengeId();
  const result = await personalDb.query<ChallengeRow>(
    `
      INSERT INTO fob_qr_challenges (id, worker_id, expires_at, created_at)
      VALUES ($1, $2, NOW() + ($3::text || ' seconds')::interval, NOW())
      RETURNING id, expires_at;
    `,
    [id, worker.id, CHALLENGE_TTL_SECONDS],
  );
  const challenge = result.rows[0];
  return {
    payload: JSON.stringify({ type: QR_PAYLOAD_TYPE, challengeId: challenge.id }),
    expiresAt: new Date(challenge.expires_at).toISOString(),
    refreshAfterSeconds: REFRESH_AFTER_SECONDS,
  };
};

const parseChallengeId = (payload: string): string => {
  try {
    const parsed = JSON.parse(payload) as { type?: string; challengeId?: string };
    if (parsed.type !== QR_PAYLOAD_TYPE || typeof parsed.challengeId !== 'string' || !parsed.challengeId.startsWith('fob_')) {
      throw new Error('Invalid QR payload.');
    }
    return parsed.challengeId;
  } catch {
    throw new FobScanError('invalid_qr');
  }
};

export const redeemFobChallenge = async (payload: string, tablet: SessionUser): Promise<FobScanResult> => {
  if (!tablet.shopId) {
    throw new FobScanError('tablet_unassigned');
  }
  const challengeId = parseChallengeId(payload);
  const tabletDisplayName = tablet.fullName || tablet.username;

  await personalDb.query('BEGIN;');
  try {
    const challengeResult = await personalDb.query<ChallengeWorkerRow>(
      `
        SELECT
          c.id AS challenge_id,
          u.id AS worker_id,
          u.username,
          u.first_name,
          u.last_name,
          u.shop_id,
          s.status AS current_status
        FROM fob_qr_challenges c
        JOIN users u ON u.id = c.worker_id
        LEFT JOIN worker_checkin_status s ON s.worker_id = u.id
        WHERE c.id = $1
          AND c.consumed_at IS NULL
          AND c.expires_at > NOW()
          AND u.role = 'worker'
        FOR UPDATE OF c, u;
      `,
      [challengeId],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge) {
      throw new FobScanError('expired_or_used');
    }
    if (challenge.shop_id !== tablet.shopId) {
      throw new FobScanError('wrong_shop');
    }

    const nextStatus: 'in' | 'out' = challenge.current_status === 'in' ? 'out' : 'in';
    const workerDisplayName = fullName(challenge);

    await personalDb.query(
      `
        UPDATE fob_qr_challenges
        SET consumed_at = NOW(),
            consumed_by_tablet_id = $2,
            consumed_shop_id = $3
        WHERE id = $1;
      `,
      [challengeId, tablet.id, tablet.shopId],
    );

    const statusResult = await personalDb.query<StatusRow>(
      `
        INSERT INTO worker_checkin_status (
          worker_id,
          worker_display_name,
          status,
          last_changed_at,
          shop_id,
          shop_name,
          source,
          scanned_by_tablet_id,
          scanned_by_tablet_display_name
        )
        VALUES ($1, $2, $3, NOW(), $4, $5, 'tablet_qr', $6, $7)
        ON CONFLICT (worker_id)
        DO UPDATE SET
          worker_display_name = EXCLUDED.worker_display_name,
          status = EXCLUDED.status,
          last_changed_at = NOW(),
          shop_id = EXCLUDED.shop_id,
          shop_name = EXCLUDED.shop_name,
          source = EXCLUDED.source,
          scanned_by_tablet_id = EXCLUDED.scanned_by_tablet_id,
          scanned_by_tablet_display_name = EXCLUDED.scanned_by_tablet_display_name
        RETURNING
          worker_id,
          worker_display_name,
          status,
          last_changed_at,
          shop_id,
          shop_name,
          source,
          scanned_by_tablet_id,
          scanned_by_tablet_display_name;
      `,
      [challenge.worker_id, workerDisplayName, nextStatus, tablet.shopId, tablet.shopName ?? null, tablet.id, tabletDisplayName],
    );

    const eventResult = await personalDb.query<EventRow>(
      `
        INSERT INTO worker_checkin_events (
          id,
          worker_id,
          worker_display_name,
          status,
          event_at,
          shop_id,
          shop_name,
          source,
          scanned_by_tablet_id,
          scanned_by_tablet_display_name
        )
        VALUES ($1, $2, $3, $4, NOW(), $5, $6, 'tablet_qr', $7, $8)
        RETURNING
          id,
          worker_id,
          worker_display_name,
          status,
          event_at,
          shop_id,
          shop_name,
          source,
          scanned_by_tablet_id,
          scanned_by_tablet_display_name;
      `,
      [
        generateEventId(),
        challenge.worker_id,
        workerDisplayName,
        nextStatus,
        tablet.shopId,
        tablet.shopName ?? null,
        tablet.id,
        tabletDisplayName,
      ],
    );

    await personalDb.query('COMMIT;');
    return { status: mapStatus(statusResult.rows[0]), event: mapEvent(eventResult.rows[0]) };
  } catch (error) {
    await personalDb.query('ROLLBACK;').catch(() => {});
    throw error;
  }
};
