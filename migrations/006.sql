-- Additive upgrade. Ciphertexts, actors, existing grants and historical business records stay intact.
CREATE TABLE platforms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,normalized_name text NOT NULL UNIQUE,enabled boolean NOT NULL DEFAULT true,sort_order int NOT NULL DEFAULT 0,version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO platforms(code,name,normalized_name) SELECT 'LEGACY_'||md5(platform),platform,lower(platform) FROM (SELECT DISTINCT platform FROM platform_accounts) x;
INSERT INTO platforms(code,name,normalized_name) SELECT code,name,lower(name) FROM (VALUES('TIKTOK','TikTok'),('SHOPEE','Shopee'),('FACEBOOK','Facebook'),('ZALO','Zalo'),('GOOGLE','Google')) t(code,name) WHERE NOT EXISTS(SELECT 1 FROM platforms p WHERE p.normalized_name=lower(t.name));
ALTER TABLE platform_accounts ADD COLUMN platform_id uuid REFERENCES platforms;
UPDATE platform_accounts a SET platform_id=p.id FROM platforms p WHERE p.name=a.platform;
ALTER TABLE platform_accounts ALTER COLUMN platform_id SET NOT NULL;
ALTER TABLE platform_accounts ADD COLUMN note text NOT NULL DEFAULT '';
ALTER TABLE platform_accounts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE platform_accounts ADD COLUMN sharing_version int NOT NULL DEFAULT 1 CHECK(sharing_version>0);
ALTER TABLE credential_versions ADD COLUMN revision int;
ALTER TABLE credential_versions ADD COLUMN previous_version_id uuid;
ALTER TABLE credential_versions ADD COLUMN metadata_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE credential_versions ADD COLUMN key_id text;
-- Disable only the history UPDATE guard during deterministic metadata backfill, within migration transaction.
ALTER TABLE credential_versions DISABLE TRIGGER immutable_credential_versions;
WITH ordered AS (SELECT id,row_number() OVER(PARTITION BY account_id ORDER BY created_at,id)::int AS revision,lag(id) OVER(PARTITION BY account_id ORDER BY created_at,id) AS previous_id FROM credential_versions)
UPDATE credential_versions v SET revision=o.revision,previous_version_id=o.previous_id,metadata_snapshot=jsonb_build_object('label',a.label,'login',a.login,'platform_name',p.name,'company',a.company,'legacy_metadata',true) FROM ordered o,platform_accounts a,platforms p WHERE v.id=o.id AND a.id=v.account_id AND p.id=a.platform_id;
ALTER TABLE credential_versions ENABLE TRIGGER immutable_credential_versions;
ALTER TABLE credential_versions ALTER COLUMN revision SET NOT NULL;
ALTER TABLE credential_versions ADD CONSTRAINT credential_revision_positive CHECK(revision>0);
ALTER TABLE credential_versions ADD CONSTRAINT credential_account_revision UNIQUE(account_id,revision);
ALTER TABLE credential_versions ADD CONSTRAINT credential_account_id UNIQUE(account_id,id);
ALTER TABLE credential_versions ADD CONSTRAINT credential_previous_same_account FOREIGN KEY(account_id,previous_version_id) REFERENCES credential_versions(account_id,id);
ALTER TABLE platform_accounts ADD COLUMN current_credential_version_id uuid;
UPDATE platform_accounts a SET current_credential_version_id=(SELECT id FROM credential_versions v WHERE v.account_id=a.id ORDER BY revision DESC LIMIT 1),updated_at=coalesce((SELECT max(created_at) FROM credential_versions v WHERE v.account_id=a.id),a.created_at);
ALTER TABLE platform_accounts ADD CONSTRAINT credential_current_same_account FOREIGN KEY(id,current_credential_version_id) REFERENCES credential_versions(account_id,id);
ALTER TABLE account_grants ADD COLUMN granted_by uuid REFERENCES users;
ALTER TABLE account_grants ADD COLUMN granted_at timestamptz;
ALTER TABLE account_grants ADD COLUMN revoke_reason text;
ALTER TABLE employee_profiles ADD COLUMN employee_code text;
CREATE UNIQUE INDEX employee_code_unique ON employee_profiles(lower(employee_code)) WHERE employee_code IS NOT NULL;
-- A duplicate legacy link must be resolved explicitly; never silently unlink or merge people.
CREATE UNIQUE INDEX employee_user_unique ON employee_profiles(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE employee_profiles ADD COLUMN joined_on date;
ALTER TABLE employee_profiles ADD COLUMN team_id uuid REFERENCES teams;
ALTER TABLE employee_profiles ADD COLUMN manager_id uuid REFERENCES users;
ALTER TABLE employee_profiles ADD COLUMN employment_type text CHECK(employment_type IN ('FULL_TIME','PART_TIME','INTERN','CONTRACTOR'));
ALTER TABLE employee_profiles ADD COLUMN probation_end date;
ALTER TABLE employee_profiles ADD COLUMN contract_end date;
ALTER TABLE employee_profiles ADD COLUMN left_on date;
ALTER TABLE employee_profiles ADD COLUMN contact jsonb NOT NULL DEFAULT '{}';
ALTER TABLE employee_profiles ADD COLUMN archived_at timestamptz;
UPDATE employee_profiles SET archived_at=now() WHERE employment_state='LEFT';
CREATE TABLE employee_positions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employee_profiles,position_code text NOT NULL,effective_from date NOT NULL,effective_to date,CHECK(effective_to IS NULL OR effective_to>=effective_from));
CREATE UNIQUE INDEX employee_position_active ON employee_positions(employee_id,position_code) WHERE effective_to IS NULL;
ALTER TABLE assets ADD COLUMN employee_id uuid REFERENCES employee_profiles;
ALTER TABLE assets DROP CONSTRAINT assets_check;
ALTER TABLE assets ADD CONSTRAINT asset_parent CHECK((task_id IS NOT NULL OR record_id IS NOT NULL OR employee_id IS NOT NULL) AND (employee_id IS NULL OR (task_id IS NULL AND record_id IS NULL AND shared=false)));
CREATE TABLE employee_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employee_profiles,asset_id uuid NOT NULL UNIQUE REFERENCES assets,document_kind text NOT NULL,classification text NOT NULL CHECK(classification IN ('BASIC','SENSITIVE')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE settings_history(id bigserial PRIMARY KEY,key text NOT NULL,value jsonb NOT NULL,reason text NOT NULL,actor_id uuid REFERENCES users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_settings_history BEFORE UPDATE OR DELETE ON settings_history FOR EACH ROW EXECUTE FUNCTION immutable_record();
-- Profile edits may occur more than once per day; lifecycle notifications retain their dedupe key.
ALTER TABLE employment_events DROP CONSTRAINT employment_events_employee_id_kind_business_date_key;
CREATE UNIQUE INDEX employment_lifecycle_dedupe ON employment_events(employee_id,kind,business_date) WHERE kind<>'PROFILE_UPDATED';
CREATE TABLE grant_changes(id bigserial PRIMARY KEY,grant_id uuid NOT NULL REFERENCES grants,actor_id uuid REFERENCES users,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_grant_changes BEFORE UPDATE OR DELETE ON grant_changes FOR EACH ROW EXECUTE FUNCTION immutable_record();
-- Idempotency is operational state, not password history. Retire legacy reveal response caches.
ALTER TABLE idempotency ADD COLUMN authorization_fingerprint text;
UPDATE idempotency SET response=response-'secret'-'ciphertext' WHERE response ? 'secret' OR response ? 'ciphertext';
