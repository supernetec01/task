-- TARGET REFERENCE, NOT A MIGRATION. See 10_DATABASE and baseline migrations.
DO $$ BEGIN RAISE EXCEPTION 'HANDOFF_REFERENCE_ONLY: do not run on production'; END $$;
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
-- Add CHECK enum/nonnegative/range constraints from data_dictionary.json in the actual migration; apply API transaction invariants too. No cascaded deletion.
