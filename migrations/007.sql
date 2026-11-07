-- Approved review decisions, 07/11/2026. Additive: keep existing histories and credentials.
ALTER TABLE employee_profiles ADD COLUMN payroll_cipher text;
CREATE TABLE employee_revisions(
 id bigserial PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employee_profiles,
 actor_id uuid NOT NULL REFERENCES users, category text NOT NULL CHECK(category IN ('BASIC','PAYROLL','SENSITIVE')),
 action text NOT NULL, before_data jsonb, after_data jsonb, encrypted_change text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((category='BASIC' AND encrypted_change IS NULL) OR
       (category<>'BASIC' AND before_data IS NULL AND after_data IS NULL AND encrypted_change IS NOT NULL))
);
CREATE INDEX employee_revision_lookup ON employee_revisions(employee_id,id DESC);
CREATE TRIGGER immutable_employee_revisions BEFORE UPDATE OR DELETE ON employee_revisions FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE platform_accounts ADD COLUMN inherit_platform_viewers boolean NOT NULL DEFAULT true;
ALTER TABLE platforms ADD COLUMN sharing_version int NOT NULL DEFAULT 1;
CREATE TABLE platform_viewers(platform_id uuid NOT NULL REFERENCES platforms,user_id uuid NOT NULL REFERENCES users,granted_by uuid NOT NULL REFERENCES users,PRIMARY KEY(platform_id,user_id));
CREATE TABLE account_viewer_overrides(account_id uuid NOT NULL REFERENCES platform_accounts,user_id uuid NOT NULL REFERENCES users,allowed boolean NOT NULL,valid_to timestamptz,granted_by uuid REFERENCES users,PRIMARY KEY(account_id,user_id));
-- Convert only currently usable legacy shares, so an expired/revoked job cannot gain access during upgrade.
INSERT INTO account_viewer_overrides(account_id,user_id,allowed,valid_to,granted_by)
 SELECT g.account_id,g.user_id,true,CASE WHEN bool_or(g.valid_to IS NULL) THEN NULL ELSE max(g.valid_to) END,(array_agg(g.granted_by))[1]
 FROM account_grants g JOIN users u ON u.id=g.user_id AND u.active
 WHERE g.revoked_at IS NULL AND (g.valid_to IS NULL OR g.valid_to>now())
 AND EXISTS(SELECT 1 FROM grants j WHERE j.user_id=g.user_id AND j.kind='JOB' AND j.role=g.role AND j.revoked_at IS NULL AND j.valid_from<=now() AND (j.valid_to IS NULL OR j.valid_to>now()))
 GROUP BY g.account_id,g.user_id;
CREATE TABLE account_sharing_history(id bigserial PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users,object_type text NOT NULL,object_id uuid NOT NULL,before_viewers jsonb NOT NULL,after_viewers jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_account_sharing_history BEFORE UPDATE OR DELETE ON account_sharing_history FOR EACH ROW EXECUTE FUNCTION immutable_record();
UPDATE settings SET value=value||'{"contract_reminders_enabled":true,"contract_reminder_days":[7]}'::jsonb WHERE key='policies';
