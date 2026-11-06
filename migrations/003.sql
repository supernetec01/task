ALTER TABLE submissions ADD CONSTRAINT submission_task_id_unique UNIQUE(task_id,id);
ALTER TABLE tasks ADD CONSTRAINT approved_submission_matches_task FOREIGN KEY(id,approved_submission_id) REFERENCES submissions(task_id,id);
ALTER TABLE tasks ADD CONSTRAINT done_has_approved_submission CHECK(status<>'DONE' OR (approved_submission_id IS NOT NULL AND completed_at IS NOT NULL AND timing IS NOT NULL));
CREATE FUNCTION check_support_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM tasks WHERE id=NEW.task_id AND owner_id=NEW.user_id) THEN RAISE EXCEPTION 'owner cannot support own task'; END IF; RETURN NEW; END $$;
CREATE TRIGGER support_not_owner BEFORE INSERT OR UPDATE ON supporters FOR EACH ROW EXECUTE FUNCTION check_support_owner();
