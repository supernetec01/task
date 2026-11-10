CREATE TABLE content_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),content_id uuid NOT NULL REFERENCES content_items,
 revision int NOT NULL,snapshot jsonb NOT NULL,created_by uuid NOT NULL REFERENCES users,
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(content_id,revision)
);
CREATE TRIGGER immutable_content_revisions BEFORE UPDATE OR DELETE ON content_revisions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE publication_link_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),publication_id uuid NOT NULL REFERENCES publications,
 previous_content_id uuid REFERENCES content_items,content_id uuid NOT NULL REFERENCES content_items,
 actor_id uuid NOT NULL REFERENCES users,reason text NOT NULL CHECK(length(trim(reason))>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_publication_link_history BEFORE UPDATE OR DELETE ON publication_link_history FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE hr_application_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES job_applications,
 actor_id uuid NOT NULL REFERENCES users,before_stage text,after_stage text NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_hr_application_events BEFORE UPDATE OR DELETE ON hr_application_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
