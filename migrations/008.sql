-- HANDOFF-1.0 additive migration; reviewed against 001–007.
-- Existing tables users/platforms/records/employee_profiles/metric_batches must already exist.

CREATE TABLE companies (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL,
  version integer NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE business_resources (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL,
  platform_id uuid NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  external_id text,
  active boolean NOT NULL,
  version integer NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE resource_grants (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  revoked_at timestamptz,
  granted_by uuid NOT NULL,
  reason text NOT NULL
);

CREATE TABLE import_errors (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  batch_id uuid NOT NULL,
  preview_version integer NOT NULL,
  sheet text,
  row_number integer,
  column_name text,
  code text NOT NULL,
  severity text NOT NULL,
  raw_value_redacted text,
  message_vi text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE import_confirmations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  batch_id uuid NOT NULL,
  batch_version integer NOT NULL,
  confirmed_metadata jsonb NOT NULL,
  metadata_hash text NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE source_partitions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  adapter_code text NOT NULL,
  grain text NOT NULL,
  basis text NOT NULL,
  attribution_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL,
  current_revision_id uuid,
  version integer NOT NULL
);

CREATE TABLE source_revisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  partition_id uuid NOT NULL,
  revision integer NOT NULL,
  batch_id uuid NOT NULL,
  previous_revision_id uuid,
  canonical_hash text NOT NULL,
  confirmation_id uuid,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE sales_daily_facts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_revision_id uuid NOT NULL,
  business_date date NOT NULL,
  revenue numeric(28,10) NOT NULL,
  effective_revenue numeric(28,10),
  orders bigint NOT NULL,
  cancelled_orders bigint NOT NULL,
  refunded_orders bigint NOT NULL,
  refund_amount numeric(28,10),
  cancelled_amount numeric(28,10),
  source_row integer NOT NULL
);

CREATE TABLE koc_period_facts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_revision_id uuid NOT NULL,
  creator_key text NOT NULL,
  creator_name_raw text NOT NULL,
  gmv numeric(28,10) NOT NULL,
  orders bigint NOT NULL,
  refund_amount numeric(28,10) NOT NULL,
  estimated_commission numeric(28,10) NOT NULL,
  refunded_items bigint,
  source_row integer NOT NULL
);

CREATE TABLE return_order_facts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_revision_id uuid NOT NULL,
  order_id text NOT NULL,
  status_raw text NOT NULL,
  type_raw text NOT NULL,
  normalized_type text NOT NULL,
  order_amount numeric(28,10) NOT NULL,
  refund_amount numeric(28,10) NOT NULL,
  created_at_source timestamptz NOT NULL,
  cancelled_at_source timestamptz,
  creator_handle text
);

CREATE TABLE return_sku_facts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  order_fact_id uuid NOT NULL,
  sku_id text,
  seller_sku text,
  package_id text,
  variation text,
  quantity numeric(18,4),
  returned_quantity numeric(18,4),
  source_row integer NOT NULL
);

CREATE TABLE content_items (
  id uuid NOT NULL PRIMARY KEY,
  owner_id uuid NOT NULL,
  stage text NOT NULL,
  writer_id uuid,
  camera_operator_id uuid,
  editor_id uuid,
  script_text text NOT NULL,
  shoot_location text,
  scheduled_shoot_at timestamptz,
  actual_shot_at timestamptz,
  edited_at timestamptz,
  due_at timestamptz,
  script_asset_ids uuid[],
  raw_asset_ids uuid[],
  final_asset_ids uuid[],
  version integer NOT NULL
);

CREATE TABLE content_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  content_id uuid NOT NULL,
  participant_role text NOT NULL,
  user_id uuid,
  external_name text,
  note text
);

CREATE TABLE content_stage_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  content_id uuid NOT NULL,
  stage_code text NOT NULL,
  kind text NOT NULL,
  business_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  actor_id uuid NOT NULL,
  credited_user_id uuid NOT NULL,
  revision integer NOT NULL,
  supersedes_id uuid,
  snapshot jsonb NOT NULL,
  reason text NOT NULL
);

CREATE TABLE publications (
  id uuid NOT NULL PRIMARY KEY,
  content_id uuid,
  channel_id uuid NOT NULL,
  platform_video_id text,
  original_url text NOT NULL,
  canonical_url text NOT NULL,
  published_at timestamptz,
  published_precision text NOT NULL,
  publisher_id uuid,
  version integer NOT NULL,
  origin text NOT NULL
);

CREATE TABLE video_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  publication_id uuid NOT NULL,
  source_revision_id uuid NOT NULL,
  collected_at timestamptz,
  collected_precision text NOT NULL,
  published_raw text NOT NULL,
  collected_raw text NOT NULL,
  views bigint NOT NULL,
  likes bigint NOT NULL,
  comments bigint NOT NULL,
  shares bigint NOT NULL,
  date_confirmation_id uuid,
  source_row integer NOT NULL
);

CREATE TABLE video_window_facts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  publication_id uuid NOT NULL,
  source_revision_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  metric text NOT NULL,
  value numeric(28,10),
  missing_reason text,
  attribution_key text NOT NULL,
  currency text NOT NULL,
  window_verified boolean NOT NULL
);

CREATE TABLE candidate_profiles (
  id uuid NOT NULL PRIMARY KEY,
  birthday date,
  contact jsonb NOT NULL,
  version integer NOT NULL
);

CREATE TABLE job_applications (
  id uuid NOT NULL PRIMARY KEY,
  candidate_id uuid NOT NULL,
  position_code text NOT NULL,
  received_on date NOT NULL,
  recruiter_id uuid NOT NULL,
  stage text NOT NULL,
  source text NOT NULL,
  next_action text NOT NULL,
  version integer NOT NULL
);

CREATE TABLE interview_sessions (
  id uuid NOT NULL PRIMARY KEY,
  application_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text NOT NULL,
  outcome text NOT NULL,
  notes text NOT NULL,
  version integer NOT NULL
);

CREATE TABLE interview_users (
  interview_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY(interview_id,user_id)
);

CREATE TABLE candidate_employee_links (
  application_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  PRIMARY KEY(application_id)
);

CREATE TABLE employee_contracts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  employee_id uuid NOT NULL,
  current_revision_id uuid,
  supersedes_contract_id uuid,
  version integer NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE employee_contract_revisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  contract_id uuid NOT NULL,
  revision integer NOT NULL,
  number text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  signed_on date NOT NULL,
  effective_from date NOT NULL,
  expires_on date,
  asset_ids uuid[] NOT NULL,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE employee_salary_terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  employee_id uuid NOT NULL,
  phase text NOT NULL,
  effective_from date NOT NULL,
  revision integer NOT NULL,
  currency text NOT NULL,
  encrypted_payload text NOT NULL,
  supersedes_id uuid,
  change_reason_code text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL
);
ALTER TABLE business_resources ADD UNIQUE(id,company_id);
ALTER TABLE source_revisions ADD UNIQUE(partition_id,id), ADD UNIQUE(partition_id,revision);
ALTER TABLE source_partitions ADD FOREIGN KEY(id,current_revision_id) REFERENCES source_revisions(partition_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE source_revisions ADD FOREIGN KEY(partition_id,previous_revision_id) REFERENCES source_revisions(partition_id,id);
ALTER TABLE job_applications ADD UNIQUE(id,candidate_id);
ALTER TABLE candidate_employee_links ADD UNIQUE(employee_id);
ALTER TABLE employee_contracts ADD UNIQUE(employee_id,id);
ALTER TABLE employee_contracts ADD FOREIGN KEY(employee_id,supersedes_contract_id) REFERENCES employee_contracts(employee_id,id);
ALTER TABLE employee_contract_revisions ADD UNIQUE(contract_id,id), ADD UNIQUE(contract_id,revision);
ALTER TABLE employee_contracts ADD FOREIGN KEY(id,current_revision_id) REFERENCES employee_contract_revisions(contract_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE employee_salary_terms ADD UNIQUE(employee_id,phase,effective_from,revision);
ALTER TABLE employee_salary_terms ADD UNIQUE(employee_id,phase,effective_from,id);
ALTER TABLE employee_salary_terms ADD FOREIGN KEY(employee_id,phase,effective_from,supersedes_id) REFERENCES employee_salary_terms(employee_id,phase,effective_from,id);
ALTER TABLE sales_daily_facts ADD UNIQUE(source_revision_id,business_date);
ALTER TABLE koc_period_facts ADD UNIQUE(source_revision_id,creator_key);
ALTER TABLE return_order_facts ADD UNIQUE(source_revision_id,order_id);
ALTER TABLE return_sku_facts ADD UNIQUE(order_fact_id,source_row);
ALTER TABLE publications ADD UNIQUE(channel_id,canonical_url);
CREATE UNIQUE INDEX publication_platform_identity ON publications(channel_id,platform_video_id) WHERE platform_video_id IS NOT NULL;
ALTER TABLE publications ADD CHECK(origin IN ('MANAGED','HISTORICAL_IMPORT')), ADD CHECK(origin<>'MANAGED' OR (content_id IS NOT NULL AND publisher_id IS NOT NULL));
ALTER TABLE content_participants ADD CHECK((user_id IS NOT NULL AND external_name IS NULL) OR (user_id IS NULL AND length(trim(external_name))>0));
ALTER TABLE content_stage_events ADD UNIQUE(content_id,stage_code,revision);
ALTER TABLE video_snapshots ADD UNIQUE(publication_id,source_revision_id);
ALTER TABLE video_window_facts ADD CHECK(window_end>window_start), ADD CHECK(value IS NOT NULL OR missing_reason IS NOT NULL);
ALTER TABLE interview_sessions ADD CHECK(ends_at>starts_at);
ALTER TABLE employee_contract_revisions ADD CHECK(expires_on IS NULL OR expires_on>=effective_from);
ALTER TABLE business_resources ADD CONSTRAINT handoff_fk_1 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE business_resources ADD CONSTRAINT handoff_fk_2 FOREIGN KEY(platform_id) REFERENCES platforms(id) ON DELETE RESTRICT;
ALTER TABLE resource_grants ADD CONSTRAINT handoff_fk_3 FOREIGN KEY(resource_id) REFERENCES business_resources(id) ON DELETE RESTRICT;
ALTER TABLE resource_grants ADD CONSTRAINT handoff_fk_4 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE import_errors ADD CONSTRAINT handoff_fk_5 FOREIGN KEY(batch_id) REFERENCES metric_batches(id) ON DELETE RESTRICT;
ALTER TABLE import_confirmations ADD CONSTRAINT handoff_fk_6 FOREIGN KEY(batch_id) REFERENCES metric_batches(id) ON DELETE RESTRICT;
ALTER TABLE source_partitions ADD CONSTRAINT handoff_fk_7 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE source_partitions ADD CONSTRAINT handoff_fk_8 FOREIGN KEY(resource_id,company_id) REFERENCES business_resources(id,company_id) ON DELETE RESTRICT;
ALTER TABLE source_revisions ADD CONSTRAINT handoff_fk_9 FOREIGN KEY(partition_id) REFERENCES source_partitions(id) ON DELETE RESTRICT;
ALTER TABLE source_revisions ADD CONSTRAINT handoff_fk_10 FOREIGN KEY(batch_id) REFERENCES metric_batches(id) ON DELETE RESTRICT;
ALTER TABLE source_revisions ADD CONSTRAINT handoff_fk_11 FOREIGN KEY(confirmation_id) REFERENCES import_confirmations(id) ON DELETE RESTRICT;
ALTER TABLE sales_daily_facts ADD CONSTRAINT handoff_fk_12 FOREIGN KEY(source_revision_id) REFERENCES source_revisions(id) ON DELETE RESTRICT;
ALTER TABLE koc_period_facts ADD CONSTRAINT handoff_fk_13 FOREIGN KEY(source_revision_id) REFERENCES source_revisions(id) ON DELETE RESTRICT;
ALTER TABLE return_order_facts ADD CONSTRAINT handoff_fk_14 FOREIGN KEY(source_revision_id) REFERENCES source_revisions(id) ON DELETE RESTRICT;
ALTER TABLE return_sku_facts ADD CONSTRAINT handoff_fk_15 FOREIGN KEY(order_fact_id) REFERENCES return_order_facts(id) ON DELETE RESTRICT;
ALTER TABLE content_items ADD CONSTRAINT handoff_fk_16 FOREIGN KEY(id) REFERENCES records(id) ON DELETE RESTRICT;
ALTER TABLE content_items ADD CONSTRAINT handoff_fk_17 FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_items ADD CONSTRAINT handoff_fk_18 FOREIGN KEY(writer_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_items ADD CONSTRAINT handoff_fk_19 FOREIGN KEY(camera_operator_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_items ADD CONSTRAINT handoff_fk_20 FOREIGN KEY(editor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_participants ADD CONSTRAINT handoff_fk_21 FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE RESTRICT;
ALTER TABLE content_participants ADD CONSTRAINT handoff_fk_22 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_stage_events ADD CONSTRAINT handoff_fk_23 FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE RESTRICT;
ALTER TABLE publications ADD CONSTRAINT handoff_fk_24 FOREIGN KEY(id) REFERENCES records(id) ON DELETE RESTRICT;
ALTER TABLE publications ADD CONSTRAINT handoff_fk_25 FOREIGN KEY(content_id) REFERENCES content_items(id) ON DELETE RESTRICT;
ALTER TABLE publications ADD CONSTRAINT handoff_fk_26 FOREIGN KEY(channel_id) REFERENCES business_resources(id) ON DELETE RESTRICT;
ALTER TABLE publications ADD CONSTRAINT handoff_fk_27 FOREIGN KEY(publisher_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE video_snapshots ADD CONSTRAINT handoff_fk_28 FOREIGN KEY(publication_id) REFERENCES publications(id) ON DELETE RESTRICT;
ALTER TABLE video_snapshots ADD CONSTRAINT handoff_fk_29 FOREIGN KEY(source_revision_id) REFERENCES source_revisions(id) ON DELETE RESTRICT;
ALTER TABLE video_snapshots ADD CONSTRAINT handoff_fk_30 FOREIGN KEY(date_confirmation_id) REFERENCES import_confirmations(id) ON DELETE RESTRICT;
ALTER TABLE video_window_facts ADD CONSTRAINT handoff_fk_31 FOREIGN KEY(publication_id) REFERENCES publications(id) ON DELETE RESTRICT;
ALTER TABLE video_window_facts ADD CONSTRAINT handoff_fk_32 FOREIGN KEY(source_revision_id) REFERENCES source_revisions(id) ON DELETE RESTRICT;
ALTER TABLE candidate_profiles ADD CONSTRAINT handoff_fk_33 FOREIGN KEY(id) REFERENCES records(id) ON DELETE RESTRICT;
ALTER TABLE job_applications ADD CONSTRAINT handoff_fk_34 FOREIGN KEY(id) REFERENCES records(id) ON DELETE RESTRICT;
ALTER TABLE job_applications ADD CONSTRAINT handoff_fk_35 FOREIGN KEY(candidate_id) REFERENCES candidate_profiles(id) ON DELETE RESTRICT;
ALTER TABLE job_applications ADD CONSTRAINT handoff_fk_36 FOREIGN KEY(recruiter_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE interview_sessions ADD CONSTRAINT handoff_fk_37 FOREIGN KEY(id) REFERENCES records(id) ON DELETE RESTRICT;
ALTER TABLE interview_sessions ADD CONSTRAINT handoff_fk_38 FOREIGN KEY(application_id) REFERENCES job_applications(id) ON DELETE RESTRICT;
ALTER TABLE interview_users ADD CONSTRAINT handoff_fk_39 FOREIGN KEY(interview_id) REFERENCES interview_sessions(id) ON DELETE RESTRICT;
ALTER TABLE interview_users ADD CONSTRAINT handoff_fk_40 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE candidate_employee_links ADD CONSTRAINT handoff_fk_41 FOREIGN KEY(application_id,candidate_id) REFERENCES job_applications(id,candidate_id) ON DELETE RESTRICT;
ALTER TABLE candidate_employee_links ADD CONSTRAINT handoff_fk_42 FOREIGN KEY(employee_id) REFERENCES employee_profiles(id) ON DELETE RESTRICT;
ALTER TABLE employee_contracts ADD CONSTRAINT handoff_fk_43 FOREIGN KEY(employee_id) REFERENCES employee_profiles(id) ON DELETE RESTRICT;
ALTER TABLE employee_contract_revisions ADD CONSTRAINT handoff_fk_44 FOREIGN KEY(contract_id) REFERENCES employee_contracts(id) ON DELETE RESTRICT;
ALTER TABLE employee_salary_terms ADD CONSTRAINT handoff_fk_45 FOREIGN KEY(employee_id) REFERENCES employee_profiles(id) ON DELETE RESTRICT;
ALTER TABLE companies ADD CONSTRAINT handoff_fk_46 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE business_resources ADD CONSTRAINT handoff_fk_47 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE resource_grants ADD CONSTRAINT handoff_fk_48 FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE import_confirmations ADD CONSTRAINT handoff_fk_49 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE source_revisions ADD CONSTRAINT handoff_fk_50 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_stage_events ADD CONSTRAINT handoff_fk_51 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE content_stage_events ADD CONSTRAINT handoff_fk_52 FOREIGN KEY(credited_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE candidate_employee_links ADD CONSTRAINT handoff_fk_53 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE employee_contracts ADD CONSTRAINT handoff_fk_54 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE employee_contract_revisions ADD CONSTRAINT handoff_fk_55 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE employee_salary_terms ADD CONSTRAINT handoff_fk_56 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT;
CREATE TRIGGER immutable_source_revisions BEFORE UPDATE OR DELETE ON source_revisions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_sales_daily_facts BEFORE UPDATE OR DELETE ON sales_daily_facts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_koc_period_facts BEFORE UPDATE OR DELETE ON koc_period_facts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_return_order_facts BEFORE UPDATE OR DELETE ON return_order_facts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_return_sku_facts BEFORE UPDATE OR DELETE ON return_sku_facts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_video_snapshots BEFORE UPDATE OR DELETE ON video_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_video_window_facts BEFORE UPDATE OR DELETE ON video_window_facts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_content_stage_events BEFORE UPDATE OR DELETE ON content_stage_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_employee_contract_revisions BEFORE UPDATE OR DELETE ON employee_contract_revisions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_employee_salary_terms BEFORE UPDATE OR DELETE ON employee_salary_terms FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_import_confirmations BEFORE UPDATE OR DELETE ON import_confirmations FOR EACH ROW EXECUTE FUNCTION immutable_record();


CREATE UNIQUE INDEX company_code_unique ON companies(lower(code));
CREATE UNIQUE INDEX resource_external_unique ON business_resources(company_id,platform_id,kind,external_id) WHERE external_id IS NOT NULL;
ALTER TABLE business_resources ADD CHECK(kind IN ('SHOP','CHANNEL'));
ALTER TABLE resource_grants ADD CHECK(permission IN ('READ','WRITE')), ADD CHECK(valid_to IS NULL OR valid_to>valid_from);
ALTER TABLE source_partitions ADD CHECK(period_end>=period_start), ADD UNIQUE(company_id,resource_id,adapter_code,grain,basis,attribution_key,period_start,period_end,currency);
ALTER TABLE source_partitions ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE companies ALTER COLUMN version SET DEFAULT 1, ALTER COLUMN active SET DEFAULT true;
ALTER TABLE business_resources ALTER COLUMN version SET DEFAULT 1, ALTER COLUMN active SET DEFAULT true;
ALTER TABLE content_items ADD COLUMN raw_links jsonb NOT NULL DEFAULT '[]', ADD COLUMN final_links jsonb NOT NULL DEFAULT '[]', ADD COLUMN no_actor_note text NOT NULL DEFAULT '';
ALTER TABLE content_items ADD CHECK(stage IN ('SCRIPTING','WAITING_SHOOT','WAITING_EDIT','CLIP_READY'));
ALTER TABLE content_stage_events ADD UNIQUE(content_id,stage_code,id), ADD FOREIGN KEY(content_id,stage_code,supersedes_id) REFERENCES content_stage_events(content_id,stage_code,id), ADD CHECK(kind IN ('COMPLETE','CORRECT','REOPEN'));
ALTER TABLE publications ADD CHECK(published_precision IN ('SECOND','MINUTE','DATE','UNKNOWN'));
ALTER TABLE job_applications ADD CHECK(stage IN ('NEW','INTERVIEW','EVALUATING','OFFER','HIRED','REJECTED')), ADD CHECK(position_code IN ('MARKETPLACE','HR','CONTENT'));
ALTER TABLE employee_salary_terms ADD CHECK(phase IN ('PROBATION','OFFICIAL'));
ALTER TABLE employee_contracts ADD CHECK(supersedes_contract_id IS DISTINCT FROM id);
ALTER TABLE employee_contract_revisions ADD CHECK(kind IN ('PROBATION','OFFICIAL','EXTENSION','ADDENDUM')), ADD CHECK(status IN ('DRAFT','SIGNED','ACTIVE','EXPIRED','SUPERSEDED'));
ALTER TABLE sales_daily_facts ADD CHECK(revenue>=0 AND orders>=0 AND cancelled_orders>=0 AND refunded_orders>=0), ADD CHECK(refund_amount>=0 AND cancelled_amount>=0 AND effective_revenue>=0);
ALTER TABLE koc_period_facts ADD CHECK(gmv>=0 AND orders>=0 AND refund_amount>=0 AND estimated_commission>=0 AND refunded_items>=0);
ALTER TABLE return_order_facts ADD CHECK(order_amount>=0 AND refund_amount>=0), ADD CHECK(normalized_type IN ('CANCEL','RETURN_REFUND'));
ALTER TABLE video_snapshots ADD CHECK(views>=0 AND likes>=0 AND comments>=0 AND shares>=0);
ALTER TABLE video_window_facts ADD UNIQUE(publication_id,source_revision_id,window_start,window_end,metric,attribution_key), ADD CHECK(value>=0);
ALTER TABLE metric_batches ADD COLUMN company_id uuid REFERENCES companies, ADD COLUMN resource_id uuid REFERENCES business_resources, ADD COLUMN adapter_code text, ADD COLUMN adapter_version int, ADD COLUMN period_start date, ADD COLUMN period_end date, ADD COLUMN period_basis text, ADD COLUMN source_context jsonb NOT NULL DEFAULT '{}', ADD COLUMN canonical_hash text;
ALTER TABLE metric_batches ADD FOREIGN KEY(resource_id,company_id) REFERENCES business_resources(id,company_id);
CREATE UNIQUE INDEX batch_v2_checksum ON metric_batches(company_id,resource_id,adapter_code,checksum) WHERE adapter_code IS NOT NULL;
ALTER TABLE notifications ADD COLUMN object_type text, ADD COLUMN event_type text, ADD COLUMN action_path text;
ALTER TABLE outbox ADD COLUMN object_type text, ADD COLUMN event_type text, ADD COLUMN action_path text;
CREATE TABLE publication_date_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),publication_id uuid NOT NULL REFERENCES publications,published_at timestamptz NOT NULL,precision text NOT NULL,source text NOT NULL,actor_id uuid NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_publication_dates BEFORE UPDATE OR DELETE ON publication_date_confirmations FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE hr_reminder_actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),object_type text NOT NULL,object_id uuid NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_hr_reminder_actions BEFORE UPDATE OR DELETE ON hr_reminder_actions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE handoff_role_mappings(user_id uuid NOT NULL REFERENCES users,grant_id uuid NOT NULL REFERENCES grants,code text NOT NULL DEFAULT 'ROLE_MAPPING_REQUIRED',resolved_at timestamptz,PRIMARY KEY(user_id,grant_id));
INSERT INTO handoff_role_mappings(user_id,grant_id) SELECT user_id,id FROM grants WHERE revoked_at IS NULL AND ((kind='ACCESS' AND role IN ('MANAGER','EXECUTIVE')) OR (kind='ACCESS' AND role='BOSS' AND scope<>'ALL') OR (kind='JOB' AND role NOT IN ('MARKETPLACE','HR','CONTENT','DESIGNER')));
-- Explicitly approved DESIGNER -> CONTENT mapping; preserve the original grant.
INSERT INTO grants(user_id,kind,role,scope,valid_from,valid_to,granted_by,reason)
SELECT g.user_id,'JOB','CONTENT','SELF',g.valid_from,g.valid_to,g.granted_by,'HANDOFF D01: DESIGNER to CONTENT; legacy grant retained' FROM grants g
WHERE g.kind='JOB' AND g.role='DESIGNER' AND g.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM grants x WHERE x.user_id=g.user_id AND x.role='CONTENT' AND x.kind='JOB' AND x.revoked_at IS NULL);
INSERT INTO settings(key,value) VALUES('handoff_policies','{"timezone":"Asia/Ho_Chi_Minh","report_due_hour":10,"probation_offsets":[7,3],"contract_offsets":[30,7],"birthday_offsets":5,"version":1}') ON CONFLICT DO NOTHING;
CREATE INDEX resource_grant_lookup ON resource_grants(user_id,resource_id) WHERE revoked_at IS NULL;
CREATE INDEX source_series ON source_partitions(resource_id,adapter_code,period_start,period_end);
CREATE INDEX stage_events_period ON content_stage_events(credited_user_id,business_at);
CREATE INDEX contract_expiry ON employee_contract_revisions(expires_on);

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

ALTER TABLE tasks ADD COLUMN company_id uuid REFERENCES companies, ADD COLUMN resource_id uuid REFERENCES business_resources;
ALTER TABLE tasks ADD FOREIGN KEY(resource_id,company_id) REFERENCES business_resources(id,company_id);
CREATE INDEX checklist_owner_due ON tasks(owner_id,flow_mode,status,due_at,id);
