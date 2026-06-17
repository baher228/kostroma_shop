import { personalDb } from '../db/personalDb';

const auditId = () => `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const logEvent = async (input: {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  actorDisplayName?: string | null;
  payload?: Record<string, unknown>;
}) => {
  await personalDb.query(
    `
      INSERT INTO audit_log (id, entity_type, entity_id, action, actor_id, actor_display_name, payload, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW());
    `,
    [
      auditId(),
      input.entityType,
      input.entityId,
      input.action,
      input.actorId ?? null,
      input.actorDisplayName ?? null,
      JSON.stringify(input.payload ?? {}),
    ],
  );
};
