-- Tighten V2 invariants and record role changes without altering legacy grants.
ALTER TABLE tasks ADD CONSTRAINT checklist_no_submission CHECK(flow_mode<>'CHECKLIST' OR approved_submission_id IS NULL);
CREATE TABLE role_bundle_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users,
 actor_id uuid NOT NULL REFERENCES users,before_roles jsonb NOT NULL,after_roles jsonb NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason))>0),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_role_bundle_events BEFORE UPDATE OR DELETE ON role_bundle_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
-- Fill only the approved specialist EMPLOYEE bundle; never promote legacy access roles.
INSERT INTO grants(user_id,kind,role,scope,valid_from,valid_to,reason,granted_by)
SELECT DISTINCT ON (g.user_id) g.user_id,'ACCESS','EMPLOYEE','SELF',g.valid_from,g.valid_to,'HANDOFF specialist bundle',g.granted_by
FROM grants g WHERE g.kind='JOB' AND g.role IN ('MARKETPLACE','HR','CONTENT') AND g.revoked_at IS NULL
AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())
AND NOT EXISTS(SELECT 1 FROM grants x WHERE x.user_id=g.user_id AND x.kind='ACCESS' AND x.role='EMPLOYEE' AND x.revoked_at IS NULL AND x.valid_from<=now() AND (x.valid_to IS NULL OR x.valid_to>now()))
ORDER BY g.user_id,g.valid_to DESC NULLS FIRST;
CREATE INDEX checklist_active_due ON tasks(due_at,id) WHERE flow_mode='CHECKLIST' AND status IN ('WAITING','IN_PROGRESS');
CREATE INDEX source_facts_date ON sales_daily_facts(business_date,source_revision_id);
CREATE INDEX salary_current_date ON employee_salary_terms(employee_id,phase,effective_from DESC,revision DESC);
