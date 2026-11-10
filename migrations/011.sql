-- Retire access outside the five supported roles without deleting business history.
-- Also withdraw the automatic DESIGNER -> CONTENT grant from migration 008:
-- assigning a replacement role now requires an explicit administrator decision.
WITH revoked AS (
  UPDATE grants SET revoked_at=now()
  WHERE revoked_at IS NULL AND (
    NOT ((kind='JOB' AND role IN ('CONTENT','MARKETPLACE','HR') AND scope='SELF')
      OR (kind='ACCESS' AND role IN ('ADMIN','BOSS') AND scope='ALL'))
    OR reason='HANDOFF D01: DESIGNER to CONTENT; legacy grant retained'
  ) RETURNING user_id
), affected AS (
  UPDATE users SET permission_version=permission_version+1
  WHERE id IN (SELECT user_id FROM revoked) RETURNING id
)
DELETE FROM sessions WHERE user_id IN (SELECT id FROM affected);

ALTER TABLE grants ADD CONSTRAINT grants_five_roles CHECK (
  revoked_at IS NOT NULL OR
  (kind='JOB' AND role IN ('CONTENT','MARKETPLACE','HR') AND scope='SELF') OR
  (kind='ACCESS' AND role IN ('ADMIN','BOSS') AND scope='ALL')
);
UPDATE account_grants SET revoked_at=now(),revoke_reason='Retired role: five-role cleanup'
WHERE revoked_at IS NULL AND role NOT IN ('ADMIN','BOSS','CONTENT','MARKETPLACE','HR');
ALTER TABLE account_grants ADD CONSTRAINT account_grants_five_roles CHECK (
  revoked_at IS NOT NULL OR role IN ('ADMIN','BOSS','CONTENT','MARKETPLACE','HR')
);
DELETE FROM task_template_roles WHERE role NOT IN ('CONTENT','MARKETPLACE','HR');
UPDATE task_templates SET enabled=false,updated_at=now()
WHERE enabled AND NOT EXISTS(SELECT 1 FROM task_template_roles r WHERE r.code=task_templates.code);
UPDATE recurring_rules SET enabled=false,version=version+1
WHERE enabled AND role NOT IN ('CONTENT','MARKETPLACE','HR');
-- Mapping queues remain historical; retired grants no longer require automatic mapping.
UPDATE handoff_role_mappings SET resolved_at=now()
WHERE resolved_at IS NULL AND grant_id IN (SELECT id FROM grants WHERE revoked_at IS NOT NULL);
