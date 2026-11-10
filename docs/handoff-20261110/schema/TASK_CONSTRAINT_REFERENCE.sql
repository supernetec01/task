-- DESIGN REFERENCE ONLY. Not an executable production migration.
-- Inspect pg_constraint and current schema before producing the actual numbered migration.
DO $$ BEGIN RAISE EXCEPTION 'HANDOFF_REFERENCE_ONLY: write/review/test a real migration first'; END $$;

-- New column default ensures existing rows remain legacy; API must explicitly create CHECKLIST.
ALTER TABLE tasks ADD COLUMN flow_mode text NOT NULL DEFAULT 'LEGACY_REVIEW';
ALTER TABLE tasks ADD CONSTRAINT task_flow_mode CHECK(flow_mode IN ('LEGACY_REVIEW','CHECKLIST'));
ALTER TABLE tasks ADD COLUMN cancelled_at timestamptz;
ALTER TABLE tasks ADD COLUMN cancel_reason text;
-- Actual migration must resolve old status constraint name from pg_constraint.
ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT task_status_by_flow CHECK(
 (flow_mode='CHECKLIST' AND status IN ('WAITING','IN_PROGRESS','DONE','CANCELLED')) OR
 (flow_mode='LEGACY_REVIEW' AND status IN
  ('DRAFT','ASSIGNED','ACCEPTED','IN_PROGRESS','SUBMITTED','CHANGES_REQUESTED','DONE','DECLINED','CANCELLED'))
);
ALTER TABLE tasks DROP CONSTRAINT done_has_approved_submission;
ALTER TABLE tasks ADD CONSTRAINT task_done_by_flow CHECK(status<>'DONE' OR
 (flow_mode='LEGACY_REVIEW' AND approved_submission_id IS NOT NULL
  AND completed_at IS NOT NULL AND timing IS NOT NULL) OR
 (flow_mode='CHECKLIST' AND approved_submission_id IS NULL
  AND completed_at IS NOT NULL AND timing IS NOT NULL AND length(trim(result_text))>0)
);
ALTER TABLE tasks ADD CONSTRAINT checklist_cancel_reason CHECK(
 flow_mode<>'CHECKLIST' OR status<>'CANCELLED' OR
 (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL AND length(trim(cancel_reason))>0)
);
-- Keep approved_submission_fk and approved_submission_matches_task unchanged.
-- New task/checklist write paths and worker guards must be deployed with this constraint change.
