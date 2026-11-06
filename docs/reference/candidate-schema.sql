-- Super Net v2.0, 2026-11-06. CANDIDATE DESIGN, NOT A VERIFIED PRODUCTION MIGRATION.

-- PostgreSQL SQL. Review docs/07 and execute tests before use. No production data.

BEGIN;

CREATE SCHEMA IF NOT EXISTS supernet;

SET search_path = supernet, public;

CREATE TABLE workspaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_subject text NOT NULL UNIQUE, status text NOT NULL CHECK (status IN ('ACTIVE','DISABLED')), created_at timestamptz NOT NULL DEFAULT now());

-- Pháp nhân; không gộp dữ liệu hai công ty

CREATE TABLE legal_entities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  tax_code text,
  base_currency char(3) NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, tax_code)
);

-- Thành viên tổ chức, không dùng một cột role duy nhất

CREATE TABLE memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  status text NOT NULL,
  display_name text NOT NULL,
  company_id uuid,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, user_id),
  CHECK (status IN ('ACTIVE','SUSPENDED','LEFT'))
);

-- Nhóm quản lý

CREATE TABLE teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  company_id uuid,
  PRIMARY KEY (workspace_id, id)
);

-- Lịch sử cấp trên-cấp dưới theo thời gian

CREATE TABLE manager_relations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  manager_id uuid NOT NULL,
  team_id uuid,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  PRIMARY KEY (workspace_id, id),
  CHECK (employee_id <> manager_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Chuyên môn có thể mở rộng

CREATE TABLE job_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code)
);

-- Nhóm quyền độc lập chuyên môn

CREATE TABLE access_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code)
);

-- Resource/action code

CREATE TABLE permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code)
);

-- Quyền trong access role

CREATE TABLE access_role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  access_role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, access_role_id, permission_id)
);

-- Cấp job role + access role theo scope; mỗi grant là một quyền hiệu lực

CREATE TABLE role_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  member_id uuid NOT NULL,
  job_role_id uuid,
  access_role_id uuid NOT NULL,
  scope_type text NOT NULL,
  scope_team_id uuid,
  scope_company_id uuid,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  revoked_at timestamptz,
  granted_by uuid NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (scope_type IN ('SELF','TEAM','COMPANY','WORKSPACE')),
  CHECK ((scope_type = 'TEAM') = (scope_team_id IS NOT NULL)),
  CHECK ((scope_type = 'COMPANY') = (scope_company_id IS NOT NULL)),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Hướng dẫn TTS theo role/scope

CREATE TABLE mentorships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  trainee_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  job_role_id uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  PRIMARY KEY (workspace_id, id),
  CHECK (trainee_id <> mentor_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Lịch có phiên bản để tái hiện tính 8h

CREATE TABLE calendar_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version_no integer NOT NULL,
  timezone text NOT NULL,
  weekly_intervals jsonb NOT NULL,
  date_exceptions jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, version_no)
);

-- Metadata file riêng tư, DB không chứa video binary

CREATE TABLE assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  upload_status text NOT NULL,
  sensitivity text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, storage_key),
  CHECK (size_bytes >= 0),
  CHECK (upload_status IN ('UPLOADING','READY','FAILED','QUARANTINED'))
);

-- Chia sẻ file tường minh có scope; không auto share mọi file linked

CREATE TABLE asset_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  asset_id uuid NOT NULL,
  member_id uuid NOT NULL,
  required_role_id uuid,
  permission text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  CHECK (permission IN ('READ','WRITE')),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Loại công việc chung mọi role

CREATE TABLE task_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code)
);

-- Form/checkpoints theo phase; immutable, JSON Schema được kiểm tại server

CREATE TABLE task_template_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_type_id uuid NOT NULL,
  version_no integer NOT NULL,
  form_schema jsonb NOT NULL,
  checkpoint_schema jsonb NOT NULL,
  submission_requirements jsonb NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_type_id, version_no),
  CHECK (version_no > 0)
);

-- Chỉ rule đã bật sinh task; không role tự sinh mọi việc

CREATE TABLE role_task_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  job_role_id uuid NOT NULL,
  template_version_id uuid NOT NULL,
  assignee_id uuid,
  team_id uuid,
  recurrence jsonb NOT NULL,
  due_rule jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id, id)
);

-- Chiến dịch làm context

CREATE TABLE campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid,
  title text NOT NULL,
  owner_id uuid NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Một task = một owner chính; hỗ trợ là quan hệ, không bản sao

CREATE TABLE tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  title text NOT NULL,
  description text,
  company_id uuid,
  owner_id uuid NOT NULL,
  reviewer_id uuid,
  principal_role_id uuid NOT NULL,
  task_type_id uuid NOT NULL,
  template_version_id uuid NOT NULL,
  campaign_id uuid,
  parent_id uuid,
  is_rollup boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  status text NOT NULL,
  priority text NOT NULL,
  original_due_at timestamptz,
  due_at timestamptz,
  accepted_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  actual_occurred_at timestamptz,
  created_by uuid NOT NULL,
  row_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code),
  CHECK (source IN ('MANAGER_ASSIGNED','EMPLOYEE_ADHOC','ROLE_RECURRING','WORKFLOW')),
  CHECK (status IN ('DRAFT','ASSIGNED','ACCEPTED','IN_PROGRESS','SUBMITTED','CHANGES_REQUESTED','DONE','DECLINED','CANCELLED')),
  CHECK (priority IN ('NORMAL','URGENT')),
  CHECK (status = 'DRAFT' OR due_at IS NOT NULL),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (row_version > 0)
);

-- Role context phụ không tăng task count

CREATE TABLE task_related_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  job_role_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, job_role_id)
);

-- Mỗi lần giao lại một attempt mới

CREATE TABLE task_assignment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  assignee_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  calendar_version_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL,
  response_due_at timestamptz NOT NULL,
  responded_at timestamptz,
  status text NOT NULL,
  response_note text,
  attempt_no integer NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, attempt_no),
  CHECK (status IN ('PENDING','ACCEPTED','DECLINED','TIMED_OUT','SUPERSEDED')),
  CHECK (response_due_at >= assigned_at),
  CHECK (attempt_no > 0)
);

-- Owner/role theo thời điểm; không đổi lịch sử cũ

CREATE TABLE task_owner_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  job_role_id uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  changed_by uuid NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Fields mềm theo immutable template của task

CREATE TABLE task_payloads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  values_json jsonb NOT NULL,
  payload_version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id)
);

-- File đính kèm có mục đích và mức chia sẻ

CREATE TABLE task_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  purpose text NOT NULL,
  visibility text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, asset_id, purpose),
  CHECK (visibility IN ('OWNER_REVIEWER','ACCEPTED_SUPPORTERS','INVITED_SUPPORTERS'))
);

-- Invitation từng vòng; trạng thái riêng task

CREATE TABLE task_support_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  support_role_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  round_no integer NOT NULL,
  status text NOT NULL,
  invited_at timestamptz NOT NULL,
  responded_at timestamptz,
  response_note text,
  revoked_at timestamptz,
  response_due_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, invitee_id, round_no),
  CHECK (status IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  CHECK (round_no > 0)
);

-- Lịch sử phản hồi/thu hồi hỗ trợ append-only

CREATE TABLE task_support_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invitation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  decision text NOT NULL,
  note text,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (decision IN ('ACCEPTED','DECLINED','REVOKED'))
);

-- Phần việc của supporter; không cập nhật task chung

CREATE TABLE support_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invitation_id uuid NOT NULL,
  status text NOT NULL,
  summary text,
  next_step text,
  blocker text,
  artifact_refs jsonb NOT NULL,
  reported_done_at timestamptz,
  updated_by uuid NOT NULL,
  row_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, invitation_id),
  CHECK (status IN ('NOT_STARTED','IN_PROGRESS','REPORTED_DONE'))
);

-- Lịch sử contribution, tránh overwrite mất bằng chứng

CREATE TABLE support_contribution_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  contribution_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Mốc công việc; không task con trừ khi cần quản riêng

CREATE TABLE task_checkpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  title text NOT NULL,
  order_no integer NOT NULL,
  owner_id uuid,
  reviewer_id uuid,
  due_at timestamptz,
  weight numeric(12,4),
  required boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  achieved_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, order_no),
  CHECK (weight IS NULL OR weight > 0),
  CHECK (status IN ('OPEN','IN_PROGRESS','SUBMITTED','ACHIEVED','WAIVED'))
);

-- Bước nhỏ không tăng số task

CREATE TABLE checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  checkpoint_id uuid,
  label text NOT NULL,
  order_no integer NOT NULL,
  required boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz,
  PRIMARY KEY (workspace_id, id)
);

-- Ghi nhận tiến độ/next step có actor

CREATE TABLE task_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  author_id uuid NOT NULL,
  summary text NOT NULL,
  next_step text,
  declared_progress numeric(5,2),
  PRIMARY KEY (workspace_id, id),
  CHECK (declared_progress IS NULL OR declared_progress BETWEEN 0 AND 100)
);

-- Vướng mắc độc lập trạng thái task

CREATE TABLE blockers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  reason text NOT NULL,
  help_owner_id uuid,
  expected_resolve_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  PRIMARY KEY (workspace_id, id)
);

-- Hạn gốc giữ nguyên; từng thay đổi có duyệt

CREATE TABLE task_deadline_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  before_due_at timestamptz NOT NULL,
  after_due_at timestamptz NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  decided_by uuid,
  status text NOT NULL,
  effective_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  CHECK (status IN ('REQUESTED','APPROVED','REJECTED'))
);

-- Snapshot kết quả immutable; review trỏ đúng revision

CREATE TABLE task_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  revision_no integer NOT NULL,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL,
  due_at_at_submit timestamptz NOT NULL,
  requirement_version integer NOT NULL,
  result_text text,
  payload_snapshot jsonb NOT NULL,
  artifact_manifest jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, revision_no),
  CHECK (revision_no > 0)
);

-- Quyết định review không thay submission

CREATE TABLE task_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submission_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL,
  feedback text,
  decided_at timestamptz NOT NULL,
  final_due_at timestamptz,
  timing_result text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, submission_id),
  CHECK (decision IN ('APPROVED','CHANGES_REQUESTED','REJECTED')),
  CHECK (timing_result IS NULL OR timing_result IN ('ON_TIME','LATE','UNKNOWN'))
);

-- Event nghiệp vụ append-only, không chứa secret

CREATE TABLE task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  request_key text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Chặn cycle ở service

CREATE TABLE task_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  depends_on_id uuid NOT NULL,
  kind text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, depends_on_id),
  CHECK (task_id <> depends_on_id),
  CHECK (kind IN ('HARD','SOFT'))
);

-- Chống scheduler sinh trùng

CREATE TABLE task_generations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rule_id uuid NOT NULL,
  assignee_id uuid NOT NULL,
  occurrence_key text NOT NULL,
  task_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, rule_id, assignee_id, occurrence_key)
);

-- Plan theo người/role/kỳ

CREATE TABLE week_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid NOT NULL,
  job_role_id uuid NOT NULL,
  week_start date NOT NULL,
  status text NOT NULL,
  frozen_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, owner_id, job_role_id, week_start)
);

-- Link task, không copy task giữa tuần

CREATE TABLE week_plan_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  plan_id uuid NOT NULL,
  task_id uuid NOT NULL,
  inclusion_kind text NOT NULL,
  baseline_due_at timestamptz,
  change_reason text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, plan_id, task_id),
  CHECK (inclusion_kind IN ('BASELINE','ADDED','CARRYOVER'))
);

-- Sản phẩm cho nội dung và SKU ngoài; không sổ tồn chuẩn

CREATE TABLE products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid,
  sku text NOT NULL,
  name text NOT NULL,
  external_product_id text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, company_id, sku)
);

-- Nội dung độc lập task và publication

CREATE TABLE content_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  kind text NOT NULL,
  owner_id uuid NOT NULL,
  company_id uuid,
  campaign_id uuid,
  stage text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Một nội dung nhiều SKU

CREATE TABLE content_products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_id uuid NOT NULL,
  product_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, content_id, product_id)
);

-- Nhiều task/nội dung nhưng không nhân bản metric

CREATE TABLE task_content_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  content_id uuid NOT NULL,
  relationship text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, task_id, content_id, relationship)
);

-- Đầu ra logic có nhiều phiên bản

CREATE TABLE deliverables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid NOT NULL,
  content_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Bản file/text/link immutable

CREATE TABLE deliverable_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deliverable_id uuid NOT NULL,
  submission_id uuid,
  version_no integer NOT NULL,
  text_body text,
  asset_id uuid,
  external_url text,
  created_by uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, deliverable_id, version_no),
  CHECK (text_body IS NOT NULL OR asset_id IS NOT NULL OR external_url IS NOT NULL),
  CHECK (version_no > 0)
);

-- Một lịch quay có nhiều nội dung

CREATE TABLE shoot_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  location text NOT NULL,
  status text NOT NULL,
  owner_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (end_at > start_at)
);

-- Người quay/diễn/hỗ trợ trong hoặc ngoài công ty

CREATE TABLE shoot_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  member_id uuid,
  external_person_label text,
  duty text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK ((member_id IS NULL) <> (external_person_label IS NULL))
);

-- Nhiều nội dung một buổi quay

CREATE TABLE shoot_content_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  content_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, session_id, content_id)
);

-- Đạo cụ/mẫu và tình trạng chuẩn bị

CREATE TABLE shoot_props (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  label text NOT NULL,
  quantity numeric(20,4) NOT NULL,
  unit text NOT NULL,
  readiness text NOT NULL,
  owner_id uuid,
  PRIMARY KEY (workspace_id, id),
  CHECK (quantity > 0)
);

-- Shop/kênh/account theo pháp nhân/nền tảng

CREATE TABLE channels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  platform text NOT NULL,
  name text NOT NULL,
  external_account_id text NOT NULL,
  timezone text NOT NULL,
  currency char(3),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, platform, external_account_id)
);

-- Bài đăng thực tế khác link file final

CREATE TABLE publications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  approved_version_id uuid,
  external_id text,
  url text,
  published_at timestamptz NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, channel_id, external_id),
  CHECK (external_id IS NOT NULL OR url IS NOT NULL)
);

-- Phiên live là subject riêng

CREATE TABLE live_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  channel_id uuid NOT NULL,
  external_id text,
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  campaign_id uuid,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, channel_id, external_id),
  CHECK (end_at IS NULL OR end_at > start_at)
);

-- Thông tin KOC, contact nhạy cảm riêng quyền

CREATE TABLE koc_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  display_name text NOT NULL,
  platform text NOT NULL,
  profile_url text,
  contact_reference text,
  PRIMARY KEY (workspace_id, id)
);

-- Một KOC có nhiều lần hợp tác

CREATE TABLE koc_collaborations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  koc_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  campaign_id uuid,
  status text NOT NULL,
  brief text,
  expected_publish_at timestamptz,
  agreed_cost numeric(20,4),
  currency char(3),
  PRIMARY KEY (workspace_id, id)
);

-- Nhiều bài trong một hợp tác

CREATE TABLE koc_publications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  collaboration_id uuid NOT NULL,
  publication_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, collaboration_id, publication_id)
);

-- Đơn vị/aggregation/định nghĩa có version

CREATE TABLE metric_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  version_no integer NOT NULL,
  label text NOT NULL,
  unit text NOT NULL,
  aggregation text NOT NULL,
  direction text NOT NULL,
  definition text NOT NULL,
  numerator_code text,
  denominator_code text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code, version_no),
  CHECK (aggregation IN ('SUM','SOURCE_TOTAL','LATEST','RATIO')),
  CHECK (direction IN ('UP','DOWN','NEUTRAL'))
);

-- Đúng một loại đối tượng đo

CREATE TABLE measurement_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  publication_id uuid,
  live_session_id uuid,
  channel_id uuid,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, publication_id),
  UNIQUE (workspace_id, live_session_id),
  UNIQUE (workspace_id, channel_id),
  CHECK (num_nonnulls(publication_id, live_session_id, channel_id) = 1)
);

-- Mapping theo platform/report type/version, không hardcode dòng đầu

CREATE TABLE import_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL,
  report_type text NOT NULL,
  version_no integer NOT NULL,
  profile_schema jsonb NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, platform, report_type, version_no)
);

-- Nguồn file, checksum, scope và chất lượng

CREATE TABLE import_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  profile_id uuid,
  channel_id uuid,
  company_id uuid NOT NULL,
  source_system text NOT NULL,
  asset_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  checksum text NOT NULL,
  report_type text NOT NULL,
  period_start date,
  period_end date,
  status text NOT NULL,
  validation_summary jsonb NOT NULL,
  committed_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  CHECK (status IN ('UPLOADED','PREVIEWED','INVALID','READY','COMMITTED','FAILED','SUPERSEDED'))
);

-- Raw/normalized/error để truy vết

CREATE TABLE import_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  batch_id uuid NOT NULL,
  sheet_name text NOT NULL,
  row_no integer NOT NULL,
  row_kind text NOT NULL,
  business_key text,
  raw_values jsonb NOT NULL,
  normalized_values jsonb,
  errors jsonb NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, batch_id, sheet_name, row_no),
  CHECK (row_no > 0)
);

-- Giá trị metric có grain/window/source/revision; null khác 0

CREATE TABLE metric_observations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  subject_id uuid NOT NULL,
  metric_id uuid NOT NULL,
  business_key text NOT NULL,
  revision_no integer NOT NULL,
  grain text NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  as_of timestamptz NOT NULL,
  observation_kind text NOT NULL,
  value numeric(28,10),
  missing_reason text,
  currency char(3),
  source_kind text NOT NULL,
  source_scope text NOT NULL,
  import_row_id uuid,
  entered_by uuid NOT NULL,
  attribution_model text,
  attribution_window text,
  supersedes_id uuid,
  quality_status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, business_key, revision_no),
  CHECK (window_end >= window_start),
  CHECK (revision_no > 0),
  CHECK (value IS NOT NULL OR missing_reason IS NOT NULL),
  CHECK (grain IN ('DAILY','PERIOD','CUMULATIVE')),
  CHECK (observation_kind IN ('PERIOD','CUMULATIVE'))
);

-- Bồi hoàn cấp đơn; người nhập chịu trách nhiệm

CREATE TABLE order_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  channel_id uuid NOT NULL,
  external_order_id text NOT NULL,
  external_claim_id text,
  entered_by uuid NOT NULL,
  entered_at timestamptz NOT NULL,
  amount_stage text NOT NULL,
  reported_amount numeric(20,4) NOT NULL,
  currency char(3) NOT NULL,
  note text,
  PRIMARY KEY (workspace_id, id),
  CHECK (reported_amount >= 0)
);

-- SKU liên quan; không lặp amount cấp đơn

CREATE TABLE claim_sku_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid NOT NULL,
  sku text NOT NULL,
  quantity numeric(20,4),
  allocated_amount numeric(20,4),
  PRIMARY KEY (workspace_id, id),
  CHECK (quantity IS NULL OR quantity > 0),
  CHECK (allocated_amount IS NULL OR allocated_amount >= 0)
);

-- Tuần theo timezone/policy version

CREATE TABLE report_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  start_date date NOT NULL,
  end_date_exclusive date NOT NULL,
  timezone text NOT NULL,
  cohort_policy_version text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, start_date, end_date_exclusive, timezone, cohort_policy_version),
  CHECK (end_date_exclusive > start_date)
);

-- Container employee + period; không chứa draft chia sẻ

CREATE TABLE weekly_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  period_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, employee_id, period_id)
);

-- Bổ sung riêng tư theo người/role, không manager GET

CREATE TABLE report_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  report_id uuid NOT NULL,
  job_role_id uuid,
  scope_key text NOT NULL,
  role_scope_ids jsonb NOT NULL,
  narrative jsonb NOT NULL,
  row_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, report_id, scope_key)
);

-- Snapshot immutable được nộp; không update source join làm đổi số

CREATE TABLE report_revisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  report_id uuid NOT NULL,
  revision_no integer NOT NULL,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL,
  cutoff_at timestamptz NOT NULL,
  definition_version text NOT NULL,
  principal_task_snapshot jsonb NOT NULL,
  support_task_snapshot jsonb NOT NULL,
  carryover_snapshot jsonb NOT NULL,
  summary_snapshot jsonb NOT NULL,
  source_manifest jsonb NOT NULL,
  content_hash text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, report_id, revision_no),
  CHECK (revision_no > 0)
);

-- Snapshot role + narrative tách ACL được

CREATE TABLE report_role_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision_id uuid NOT NULL,
  job_role_id uuid,
  scope_key text NOT NULL,
  role_scope_ids jsonb NOT NULL,
  data_snapshot jsonb NOT NULL,
  narrative_snapshot jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, revision_id, scope_key)
);

-- Người nhận snapshot, hiện quyền kiểm lại khi đọc

CREATE TABLE report_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  recipient_kind text NOT NULL,
  first_viewed_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, revision_id, recipient_id),
  CHECK (recipient_kind IN ('MANAGER','BOSS','ADMIN'))
);

-- XLSX có scope, filter và revision cụ thể

CREATE TABLE export_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid NOT NULL,
  report_revision_id uuid,
  filters jsonb NOT NULL,
  status text NOT NULL,
  asset_id uuid,
  expires_at timestamptz,
  error_code text,
  PRIMARY KEY (workspace_id, id),
  CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','EXPIRED'))
);

-- Ứng viên, CCCD không lưu plaintext ở bảng listing

CREATE TABLE candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  full_name text NOT NULL,
  contact_reference text,
  cv_asset_id uuid,
  portfolio_asset_id uuid,
  PRIMARY KEY (workspace_id, id)
);

-- Lần ứng tuyển + người tuyển

CREATE TABLE applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  candidate_id uuid NOT NULL,
  position_title text NOT NULL,
  recruiter_id uuid,
  source text,
  stage text NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Lịch phỏng vấn và kết quả có người ghi

CREATE TABLE interviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  application_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  interviewer_id uuid,
  status text NOT NULL,
  result_note text,
  PRIMARY KEY (workspace_id, id),
  CHECK (end_at IS NULL OR end_at > start_at)
);

-- Nhân viên gắn user/candidate; sinh nhật theo ngày

CREATE TABLE employee_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  member_id uuid NOT NULL,
  candidate_id uuid,
  recruiter_id uuid,
  birth_date date,
  employment_status text NOT NULL,
  join_date date,
  leave_date date,
  identity_vault_ref text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, member_id),
  CHECK (employment_status IN ('PREJOIN','PROBATION','OFFICIAL','LEFT'))
);

-- Lịch sử thử việc/chính thức/hợp đồng; salary scope riêng

CREATE TABLE employment_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  term_type text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  contract_asset_id uuid,
  compensation_vault_ref text,
  recorded_by uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Dedup thưởng thử việc/sinh nhật; không tự ghi tiền lương

CREATE TABLE hr_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  event_type text NOT NULL,
  occurrence_key text NOT NULL,
  event_date date NOT NULL,
  notify_at timestamptz,
  payload_safe jsonb NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, employee_id, event_type, occurrence_key)
);

-- Tài khoản nền tảng và secret version mã hóa riêng

CREATE TABLE platform_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  platform text NOT NULL,
  account_label text NOT NULL,
  login_name text NOT NULL,
  external_account_id text,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Xem hiện tại đi kèm sửa theo yêu cầu; history Admin riêng

CREATE TABLE platform_account_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  member_id uuid NOT NULL,
  required_role_id uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  revoked_at timestamptz,
  approved_by uuid NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Mã hóa authenticated encryption; không plaintext/log/hash dùng thay ciphertext

CREATE TABLE credential_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  version_no integer NOT NULL,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  key_version text NOT NULL,
  algorithm text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL,
  change_note text,
  external_changed_confirmed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, account_id, version_no),
  CHECK (version_no > 0)
);

-- Đề nghị dùng chung, policy chi tiết chưa chốt

CREATE TABLE requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  related_task_id uuid,
  request_type text NOT NULL,
  purpose text NOT NULL,
  needed_at timestamptz,
  status text NOT NULL,
  revision_no integer NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, id),
  CHECK (request_type IN ('PURCHASE','RENTAL','EQUIPMENT_LOAN','SAMPLE_ISSUE','ADVANCE','REIMBURSEMENT','SALES_INVOICE_REQUEST','DOCUMENT_COLLECTION'))
);

-- Dòng nhu cầu không bắt có giá khi mới xin nhu cầu

CREATE TABLE request_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(20,4) NOT NULL,
  unit text NOT NULL,
  estimated_unit_price numeric(20,4),
  currency char(3),
  PRIMARY KEY (workspace_id, id),
  CHECK (quantity > 0),
  CHECK (estimated_unit_price IS NULL OR estimated_unit_price >= 0)
);

-- Policy phê duyệt versioned; chưa cấu hình không tự duyệt

CREATE TABLE approval_policy_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL,
  version_no integer NOT NULL,
  policy_schema jsonb NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, code, version_no)
);

-- Phê duyệt request đúng revision; task review dùng bảng riêng

CREATE TABLE approval_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  request_revision integer NOT NULL,
  policy_version_id uuid NOT NULL,
  subject_snapshot jsonb NOT NULL,
  status text NOT NULL,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, request_id, request_revision)
);

-- Approver đã giải tại lúc nộp, có thể delegate có audit

CREATE TABLE approval_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  instance_id uuid NOT NULL,
  step_no integer NOT NULL,
  approver_id uuid NOT NULL,
  delegated_from uuid,
  status text NOT NULL,
  decided_at timestamptz,
  decision_note text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, instance_id, step_no, approver_id)
);

-- NCC/khách hàng; bank info ở vùng protected riêng

CREATE TABLE partners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  kind text NOT NULL,
  tax_code text,
  payment_details_vault_ref text,
  PRIMARY KEY (workspace_id, id),
  CHECK (kind IN ('SUPPLIER','CUSTOMER','BOTH'))
);

-- Module mở rộng; không tự coi request đã duyệt là PO đã trả

CREATE TABLE purchase_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  order_number text NOT NULL,
  status text NOT NULL,
  currency char(3) NOT NULL,
  approval_instance_id uuid,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, company_id, order_number)
);

-- Dòng PO, qty/giá không float

CREATE TABLE purchase_order_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid NOT NULL,
  request_line_id uuid,
  description text NOT NULL,
  quantity numeric(20,4) NOT NULL,
  unit text NOT NULL,
  unit_price numeric(20,4) NOT NULL,
  tax_amount numeric(20,4),
  PRIMARY KEY (workspace_id, id),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0)
);

-- Nhận hàng/nghiệm thu riêng trạng thái payment

CREATE TABLE receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL,
  received_by uuid NOT NULL,
  received_at timestamptz NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (kind IN ('GOODS','SERVICE'))
);

-- Nhận một phần, không boolean

CREATE TABLE receipt_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  receipt_id uuid NOT NULL,
  po_line_id uuid NOT NULL,
  accepted_qty numeric(20,4) NOT NULL,
  rejected_qty numeric(20,4) NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (accepted_qty >= 0),
  CHECK (rejected_qty >= 0)
);

-- Chứng từ mua vào, identity hóa đơn theo company/NCC

CREATE TABLE vendor_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  series text,
  invoice_number text NOT NULL,
  issued_date date NOT NULL,
  currency char(3) NOT NULL,
  total_amount numeric(20,4) NOT NULL,
  status text NOT NULL,
  asset_id uuid,
  PRIMARY KEY (workspace_id, id),
  CHECK (total_amount >= 0)
);

-- Matching dòng, service kiểm tổng/cùng pháp nhân

CREATE TABLE bill_line_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  bill_id uuid NOT NULL,
  po_line_id uuid NOT NULL,
  receipt_line_id uuid,
  matched_quantity numeric(20,4),
  matched_amount numeric(20,4) NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (matched_amount >= 0)
);

-- Tạm ứng không phải chi phí

CREATE TABLE advances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  approved_amount numeric(20,4) NOT NULL,
  currency char(3) NOT NULL,
  settlement_due date,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (approved_amount >= 0)
);

-- Nhân viên đã chi xin hoàn; tránh trả NCC trùng

CREATE TABLE expense_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  request_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  currency char(3) NOT NULL,
  amount numeric(20,4) NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (amount >= 0)
);

-- Bằng chứng chi và liên kết hóa đơn

CREATE TABLE expense_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid NOT NULL,
  expense_date date NOT NULL,
  description text NOT NULL,
  amount numeric(20,4) NOT NULL,
  bill_id uuid,
  evidence_asset_id uuid,
  PRIMARY KEY (workspace_id, id),
  CHECK (amount >= 0)
);

-- Yêu cầu ghi nhận/duyệt trả tiền; chưa tích hợp ngân hàng

CREATE TABLE payment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  partner_id uuid,
  employee_id uuid,
  amount numeric(20,4) NOT NULL,
  currency char(3) NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (num_nonnulls(partner_id, employee_id) = 1),
  CHECK (amount > 0)
);

-- Giao dịch đã ghi nhận có evidence, không tự chuyển tiền

CREATE TABLE payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  payment_request_id uuid NOT NULL,
  amount numeric(20,4) NOT NULL,
  currency char(3) NOT NULL,
  paid_at timestamptz NOT NULL,
  method text NOT NULL,
  external_reference text,
  recorded_by uuid NOT NULL,
  reconciliation_status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (amount > 0)
);

-- Đúng một loại đích; sum kiểm bằng transaction

CREATE TABLE payment_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  payment_id uuid NOT NULL,
  bill_id uuid,
  advance_id uuid,
  expense_claim_id uuid,
  amount numeric(20,4) NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (num_nonnulls(bill_id, advance_id, expense_claim_id) = 1),
  CHECK (amount > 0)
);

-- Yêu cầu kế toán xử lý hóa đơn bán ra; không phát hành thật

CREATE TABLE sales_invoice_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  sale_reference text,
  status text NOT NULL,
  external_invoice_id text,
  invoice_asset_id uuid,
  PRIMARY KEY (workspace_id, id)
);

-- Thiết bị riêng lẻ có người giữ

CREATE TABLE equipment_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  asset_tag text NOT NULL,
  name text NOT NULL,
  serial_number text,
  condition text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, company_id, asset_tag)
);

-- Mượn-trả; không coi đã trả khi task DONE

CREATE TABLE equipment_loans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  unit_id uuid NOT NULL,
  request_id uuid,
  borrower_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  due_back_at timestamptz NOT NULL,
  returned_at timestamptz,
  condition_out text,
  condition_in text,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (due_back_at > start_at)
);

-- External reference BigSeller, không tạo sổ tồn cạnh tranh

CREATE TABLE sample_fulfillments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  channel_id uuid,
  external_transaction_id text,
  tracking_number text,
  return_expected boolean NOT NULL,
  status text NOT NULL,
  fulfilled_at timestamptz,
  PRIMARY KEY (workspace_id, id)
);

-- Snapshot/read model từ BigSeller; không stock posting MVP

CREATE TABLE inventory_source_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  source text NOT NULL,
  external_key text NOT NULL,
  sku text NOT NULL,
  location_code text,
  quantity numeric(20,4) NOT NULL,
  unit text NOT NULL,
  as_of timestamptz NOT NULL,
  import_batch_id uuid,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, source, external_key, as_of),
  CHECK (source = 'BIGSELLER')
);

-- Brand guide/quy trình có phiên bản, module tùy chọn

CREATE TABLE knowledge_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  category text NOT NULL,
  revision_no integer NOT NULL,
  body text NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Bằng chứng quyền sử dụng nhạc/ảnh/KOC, extension

CREATE TABLE asset_usage_rights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  asset_id uuid NOT NULL,
  licensor text,
  usage_scope text NOT NULL,
  permitted_channels jsonb NOT NULL,
  expires_at timestamptz,
  evidence_asset_id uuid,
  PRIMARY KEY (workspace_id, id)
);

-- In-app notification, không secret payload

CREATE TABLE notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  recipient_id uuid NOT NULL,
  type text NOT NULL,
  subject_type text NOT NULL,
  subject_key text NOT NULL,
  message_safe text NOT NULL,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, recipient_id, dedupe_key)
);

-- Ghi cùng transaction nghiệp vụ, worker gửi sau commit

CREATE TABLE outbox_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  payload_safe jsonb NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  processed_at timestamptz,
  last_error_safe text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, dedupe_key)
);

-- Request key unique per actor/operation; không double submit

CREATE TABLE idempotency_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_safe jsonb,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, actor_id, operation, key)
);

-- Append-only actor/action/object metadata; secret chỉ version refs

CREATE TABLE audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  object_type text NOT NULL,
  object_key text NOT NULL,
  before_safe jsonb,
  after_safe jsonb,
  request_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

-- Bằng cấp, CCCD/hồ sơ và giấy tờ nhân sự theo ACL riêng

CREATE TABLE employee_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  document_kind text NOT NULL,
  sensitivity text NOT NULL,
  issued_date date,
  expires_date date,
  note text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, employee_id, asset_id, document_kind)
);

-- Xuất hàng ngày/tuần từ BigSeller; order/package/items tách đơn vị

CREATE TABLE warehouse_outbound_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  external_transaction_id text NOT NULL,
  external_line_id text NOT NULL,
  order_reference text,
  package_reference text,
  sku text NOT NULL,
  quantity numeric(20,4) NOT NULL,
  unit text NOT NULL,
  occurred_at timestamptz NOT NULL,
  operator_id uuid,
  import_batch_id uuid,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, company_id, external_transaction_id, external_line_id),
  CHECK (quantity > 0)
);

ALTER TABLE memberships ADD CONSTRAINT memberships_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id);

ALTER TABLE memberships ADD CONSTRAINT memberships_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE teams ADD CONSTRAINT teams_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE manager_relations ADD CONSTRAINT manager_relations_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE manager_relations ADD CONSTRAINT manager_relations_manager_id_fk FOREIGN KEY (workspace_id, manager_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE manager_relations ADD CONSTRAINT manager_relations_team_id_fk FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id);

CREATE INDEX idx_manager_relations_1 ON manager_relations (workspace_id, employee_id, valid_from);

ALTER TABLE access_role_permissions ADD CONSTRAINT access_role_permissions_access_role_id_fk FOREIGN KEY (workspace_id, access_role_id) REFERENCES access_roles (workspace_id, id);

ALTER TABLE access_role_permissions ADD CONSTRAINT access_role_permissions_permission_id_fk FOREIGN KEY (workspace_id, permission_id) REFERENCES permissions (workspace_id, id);

ALTER TABLE role_grants ADD CONSTRAINT role_grants_member_id_fk FOREIGN KEY (workspace_id, member_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE role_grants ADD CONSTRAINT role_grants_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE role_grants ADD CONSTRAINT role_grants_access_role_id_fk FOREIGN KEY (workspace_id, access_role_id) REFERENCES access_roles (workspace_id, id);

ALTER TABLE role_grants ADD CONSTRAINT role_grants_scope_team_id_fk FOREIGN KEY (workspace_id, scope_team_id) REFERENCES teams (workspace_id, id);

ALTER TABLE role_grants ADD CONSTRAINT role_grants_scope_company_id_fk FOREIGN KEY (workspace_id, scope_company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE role_grants ADD CONSTRAINT role_grants_granted_by_fk FOREIGN KEY (workspace_id, granted_by) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_role_grants_1 ON role_grants (workspace_id, member_id, valid_from, valid_to);

ALTER TABLE mentorships ADD CONSTRAINT mentorships_trainee_id_fk FOREIGN KEY (workspace_id, trainee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE mentorships ADD CONSTRAINT mentorships_mentor_id_fk FOREIGN KEY (workspace_id, mentor_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE mentorships ADD CONSTRAINT mentorships_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE assets ADD CONSTRAINT assets_uploaded_by_fk FOREIGN KEY (workspace_id, uploaded_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE asset_permissions ADD CONSTRAINT asset_permissions_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE asset_permissions ADD CONSTRAINT asset_permissions_member_id_fk FOREIGN KEY (workspace_id, member_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE asset_permissions ADD CONSTRAINT asset_permissions_required_role_id_fk FOREIGN KEY (workspace_id, required_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE task_template_versions ADD CONSTRAINT task_template_versions_task_type_id_fk FOREIGN KEY (workspace_id, task_type_id) REFERENCES task_types (workspace_id, id);

ALTER TABLE role_task_rules ADD CONSTRAINT role_task_rules_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE role_task_rules ADD CONSTRAINT role_task_rules_template_version_id_fk FOREIGN KEY (workspace_id, template_version_id) REFERENCES task_template_versions (workspace_id, id);

ALTER TABLE role_task_rules ADD CONSTRAINT role_task_rules_assignee_id_fk FOREIGN KEY (workspace_id, assignee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE role_task_rules ADD CONSTRAINT role_task_rules_team_id_fk FOREIGN KEY (workspace_id, team_id) REFERENCES teams (workspace_id, id);

ALTER TABLE campaigns ADD CONSTRAINT campaigns_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE campaigns ADD CONSTRAINT campaigns_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_reviewer_id_fk FOREIGN KEY (workspace_id, reviewer_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_principal_role_id_fk FOREIGN KEY (workspace_id, principal_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_id_fk FOREIGN KEY (workspace_id, task_type_id) REFERENCES task_types (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_template_version_id_fk FOREIGN KEY (workspace_id, template_version_id) REFERENCES task_template_versions (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_campaign_id_fk FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_parent_id_fk FOREIGN KEY (workspace_id, parent_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_fk FOREIGN KEY (workspace_id, created_by) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_tasks_1 ON tasks (workspace_id, owner_id, status, due_at);

CREATE INDEX idx_tasks_2 ON tasks (workspace_id, principal_role_id, created_at);

CREATE INDEX idx_tasks_3 ON tasks (workspace_id, reviewer_id, status);

ALTER TABLE task_related_roles ADD CONSTRAINT task_related_roles_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_related_roles ADD CONSTRAINT task_related_roles_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE task_assignment_attempts ADD CONSTRAINT task_assignment_attempts_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_assignment_attempts ADD CONSTRAINT task_assignment_attempts_assignee_id_fk FOREIGN KEY (workspace_id, assignee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_assignment_attempts ADD CONSTRAINT task_assignment_attempts_assigned_by_fk FOREIGN KEY (workspace_id, assigned_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_assignment_attempts ADD CONSTRAINT task_assignment_attempts_calendar_version_id_fk FOREIGN KEY (workspace_id, calendar_version_id) REFERENCES calendar_versions (workspace_id, id);

CREATE INDEX idx_task_assignment_attempts_1 ON task_assignment_attempts (workspace_id, status, response_due_at);

ALTER TABLE task_owner_history ADD CONSTRAINT task_owner_history_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_owner_history ADD CONSTRAINT task_owner_history_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_owner_history ADD CONSTRAINT task_owner_history_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE task_owner_history ADD CONSTRAINT task_owner_history_changed_by_fk FOREIGN KEY (workspace_id, changed_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_payloads ADD CONSTRAINT task_payloads_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_payloads ADD CONSTRAINT task_payloads_updated_by_fk FOREIGN KEY (workspace_id, updated_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_assets ADD CONSTRAINT task_assets_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_assets ADD CONSTRAINT task_assets_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE task_support_invitations ADD CONSTRAINT task_support_invitations_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_support_invitations ADD CONSTRAINT task_support_invitations_invitee_id_fk FOREIGN KEY (workspace_id, invitee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_support_invitations ADD CONSTRAINT task_support_invitations_support_role_id_fk FOREIGN KEY (workspace_id, support_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE task_support_invitations ADD CONSTRAINT task_support_invitations_invited_by_fk FOREIGN KEY (workspace_id, invited_by) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_task_support_invitations_1 ON task_support_invitations (workspace_id, invitee_id, status);

ALTER TABLE task_support_responses ADD CONSTRAINT task_support_responses_invitation_id_fk FOREIGN KEY (workspace_id, invitation_id) REFERENCES task_support_invitations (workspace_id, id);

ALTER TABLE task_support_responses ADD CONSTRAINT task_support_responses_actor_id_fk FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE support_contributions ADD CONSTRAINT support_contributions_invitation_id_fk FOREIGN KEY (workspace_id, invitation_id) REFERENCES task_support_invitations (workspace_id, id);

ALTER TABLE support_contributions ADD CONSTRAINT support_contributions_updated_by_fk FOREIGN KEY (workspace_id, updated_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE support_contribution_events ADD CONSTRAINT support_contribution_events_contribution_id_fk FOREIGN KEY (workspace_id, contribution_id) REFERENCES support_contributions (workspace_id, id);

ALTER TABLE support_contribution_events ADD CONSTRAINT support_contribution_events_actor_id_fk FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_checkpoints ADD CONSTRAINT task_checkpoints_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_checkpoints ADD CONSTRAINT task_checkpoints_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_checkpoints ADD CONSTRAINT task_checkpoints_reviewer_id_fk FOREIGN KEY (workspace_id, reviewer_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_checkpoint_id_fk FOREIGN KEY (workspace_id, checkpoint_id) REFERENCES task_checkpoints (workspace_id, id);

ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_checked_by_fk FOREIGN KEY (workspace_id, checked_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_updates ADD CONSTRAINT task_updates_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_updates ADD CONSTRAINT task_updates_author_id_fk FOREIGN KEY (workspace_id, author_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE blockers ADD CONSTRAINT blockers_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE blockers ADD CONSTRAINT blockers_opened_by_fk FOREIGN KEY (workspace_id, opened_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE blockers ADD CONSTRAINT blockers_help_owner_id_fk FOREIGN KEY (workspace_id, help_owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_deadline_changes ADD CONSTRAINT task_deadline_changes_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_deadline_changes ADD CONSTRAINT task_deadline_changes_requested_by_fk FOREIGN KEY (workspace_id, requested_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_deadline_changes ADD CONSTRAINT task_deadline_changes_decided_by_fk FOREIGN KEY (workspace_id, decided_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_submissions ADD CONSTRAINT task_submissions_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_submissions ADD CONSTRAINT task_submissions_submitted_by_fk FOREIGN KEY (workspace_id, submitted_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_reviews ADD CONSTRAINT task_reviews_submission_id_fk FOREIGN KEY (workspace_id, submission_id) REFERENCES task_submissions (workspace_id, id);

ALTER TABLE task_reviews ADD CONSTRAINT task_reviews_reviewer_id_fk FOREIGN KEY (workspace_id, reviewer_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_events ADD CONSTRAINT task_events_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_events ADD CONSTRAINT task_events_actor_id_fk FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_task_events_1 ON task_events (workspace_id, task_id, occurred_at);

ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_depends_on_id_fk FOREIGN KEY (workspace_id, depends_on_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_generations ADD CONSTRAINT task_generations_rule_id_fk FOREIGN KEY (workspace_id, rule_id) REFERENCES role_task_rules (workspace_id, id);

ALTER TABLE task_generations ADD CONSTRAINT task_generations_assignee_id_fk FOREIGN KEY (workspace_id, assignee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE task_generations ADD CONSTRAINT task_generations_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE week_plans ADD CONSTRAINT week_plans_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE week_plans ADD CONSTRAINT week_plans_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE week_plan_items ADD CONSTRAINT week_plan_items_plan_id_fk FOREIGN KEY (workspace_id, plan_id) REFERENCES week_plans (workspace_id, id);

ALTER TABLE week_plan_items ADD CONSTRAINT week_plan_items_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE products ADD CONSTRAINT products_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE content_items ADD CONSTRAINT content_items_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE content_items ADD CONSTRAINT content_items_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE content_items ADD CONSTRAINT content_items_campaign_id_fk FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns (workspace_id, id);

ALTER TABLE content_products ADD CONSTRAINT content_products_content_id_fk FOREIGN KEY (workspace_id, content_id) REFERENCES content_items (workspace_id, id);

ALTER TABLE content_products ADD CONSTRAINT content_products_product_id_fk FOREIGN KEY (workspace_id, product_id) REFERENCES products (workspace_id, id);

ALTER TABLE task_content_links ADD CONSTRAINT task_content_links_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE task_content_links ADD CONSTRAINT task_content_links_content_id_fk FOREIGN KEY (workspace_id, content_id) REFERENCES content_items (workspace_id, id);

ALTER TABLE deliverables ADD CONSTRAINT deliverables_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE deliverables ADD CONSTRAINT deliverables_content_id_fk FOREIGN KEY (workspace_id, content_id) REFERENCES content_items (workspace_id, id);

ALTER TABLE deliverable_versions ADD CONSTRAINT deliverable_versions_deliverable_id_fk FOREIGN KEY (workspace_id, deliverable_id) REFERENCES deliverables (workspace_id, id);

ALTER TABLE deliverable_versions ADD CONSTRAINT deliverable_versions_submission_id_fk FOREIGN KEY (workspace_id, submission_id) REFERENCES task_submissions (workspace_id, id);

ALTER TABLE deliverable_versions ADD CONSTRAINT deliverable_versions_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE deliverable_versions ADD CONSTRAINT deliverable_versions_created_by_fk FOREIGN KEY (workspace_id, created_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE shoot_sessions ADD CONSTRAINT shoot_sessions_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE shoot_participants ADD CONSTRAINT shoot_participants_session_id_fk FOREIGN KEY (workspace_id, session_id) REFERENCES shoot_sessions (workspace_id, id);

ALTER TABLE shoot_participants ADD CONSTRAINT shoot_participants_member_id_fk FOREIGN KEY (workspace_id, member_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE shoot_content_links ADD CONSTRAINT shoot_content_links_session_id_fk FOREIGN KEY (workspace_id, session_id) REFERENCES shoot_sessions (workspace_id, id);

ALTER TABLE shoot_content_links ADD CONSTRAINT shoot_content_links_content_id_fk FOREIGN KEY (workspace_id, content_id) REFERENCES content_items (workspace_id, id);

ALTER TABLE shoot_props ADD CONSTRAINT shoot_props_session_id_fk FOREIGN KEY (workspace_id, session_id) REFERENCES shoot_sessions (workspace_id, id);

ALTER TABLE shoot_props ADD CONSTRAINT shoot_props_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE channels ADD CONSTRAINT channels_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE publications ADD CONSTRAINT publications_content_id_fk FOREIGN KEY (workspace_id, content_id) REFERENCES content_items (workspace_id, id);

ALTER TABLE publications ADD CONSTRAINT publications_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE publications ADD CONSTRAINT publications_approved_version_id_fk FOREIGN KEY (workspace_id, approved_version_id) REFERENCES deliverable_versions (workspace_id, id);

ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_campaign_id_fk FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns (workspace_id, id);

ALTER TABLE koc_collaborations ADD CONSTRAINT koc_collaborations_koc_id_fk FOREIGN KEY (workspace_id, koc_id) REFERENCES koc_contacts (workspace_id, id);

ALTER TABLE koc_collaborations ADD CONSTRAINT koc_collaborations_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE koc_collaborations ADD CONSTRAINT koc_collaborations_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE koc_collaborations ADD CONSTRAINT koc_collaborations_campaign_id_fk FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns (workspace_id, id);

ALTER TABLE koc_publications ADD CONSTRAINT koc_publications_collaboration_id_fk FOREIGN KEY (workspace_id, collaboration_id) REFERENCES koc_collaborations (workspace_id, id);

ALTER TABLE koc_publications ADD CONSTRAINT koc_publications_publication_id_fk FOREIGN KEY (workspace_id, publication_id) REFERENCES publications (workspace_id, id);

ALTER TABLE measurement_subjects ADD CONSTRAINT measurement_subjects_publication_id_fk FOREIGN KEY (workspace_id, publication_id) REFERENCES publications (workspace_id, id);

ALTER TABLE measurement_subjects ADD CONSTRAINT measurement_subjects_live_session_id_fk FOREIGN KEY (workspace_id, live_session_id) REFERENCES live_sessions (workspace_id, id);

ALTER TABLE measurement_subjects ADD CONSTRAINT measurement_subjects_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE import_batches ADD CONSTRAINT import_batches_profile_id_fk FOREIGN KEY (workspace_id, profile_id) REFERENCES import_profiles (workspace_id, id);

ALTER TABLE import_batches ADD CONSTRAINT import_batches_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE import_batches ADD CONSTRAINT import_batches_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE import_batches ADD CONSTRAINT import_batches_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE import_batches ADD CONSTRAINT import_batches_uploaded_by_fk FOREIGN KEY (workspace_id, uploaded_by) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_import_batches_1 ON import_batches (workspace_id, channel_id, checksum, report_type);

ALTER TABLE import_rows ADD CONSTRAINT import_rows_batch_id_fk FOREIGN KEY (workspace_id, batch_id) REFERENCES import_batches (workspace_id, id);

ALTER TABLE metric_observations ADD CONSTRAINT metric_observations_subject_id_fk FOREIGN KEY (workspace_id, subject_id) REFERENCES measurement_subjects (workspace_id, id);

ALTER TABLE metric_observations ADD CONSTRAINT metric_observations_metric_id_fk FOREIGN KEY (workspace_id, metric_id) REFERENCES metric_definitions (workspace_id, id);

ALTER TABLE metric_observations ADD CONSTRAINT metric_observations_import_row_id_fk FOREIGN KEY (workspace_id, import_row_id) REFERENCES import_rows (workspace_id, id);

ALTER TABLE metric_observations ADD CONSTRAINT metric_observations_entered_by_fk FOREIGN KEY (workspace_id, entered_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE metric_observations ADD CONSTRAINT metric_observations_supersedes_id_fk FOREIGN KEY (workspace_id, supersedes_id) REFERENCES metric_observations (workspace_id, id);

CREATE INDEX idx_metric_observations_1 ON metric_observations (workspace_id, subject_id, metric_id, window_start, window_end);

ALTER TABLE order_claims ADD CONSTRAINT order_claims_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE order_claims ADD CONSTRAINT order_claims_entered_by_fk FOREIGN KEY (workspace_id, entered_by) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_order_claims_1 ON order_claims (workspace_id, entered_by, entered_at);

ALTER TABLE claim_sku_lines ADD CONSTRAINT claim_sku_lines_claim_id_fk FOREIGN KEY (workspace_id, claim_id) REFERENCES order_claims (workspace_id, id);

ALTER TABLE weekly_reports ADD CONSTRAINT weekly_reports_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE weekly_reports ADD CONSTRAINT weekly_reports_period_id_fk FOREIGN KEY (workspace_id, period_id) REFERENCES report_periods (workspace_id, id);

ALTER TABLE report_drafts ADD CONSTRAINT report_drafts_report_id_fk FOREIGN KEY (workspace_id, report_id) REFERENCES weekly_reports (workspace_id, id);

ALTER TABLE report_drafts ADD CONSTRAINT report_drafts_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE report_revisions ADD CONSTRAINT report_revisions_report_id_fk FOREIGN KEY (workspace_id, report_id) REFERENCES weekly_reports (workspace_id, id);

ALTER TABLE report_revisions ADD CONSTRAINT report_revisions_submitted_by_fk FOREIGN KEY (workspace_id, submitted_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE report_role_sections ADD CONSTRAINT report_role_sections_revision_id_fk FOREIGN KEY (workspace_id, revision_id) REFERENCES report_revisions (workspace_id, id);

ALTER TABLE report_role_sections ADD CONSTRAINT report_role_sections_job_role_id_fk FOREIGN KEY (workspace_id, job_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE report_recipients ADD CONSTRAINT report_recipients_revision_id_fk FOREIGN KEY (workspace_id, revision_id) REFERENCES report_revisions (workspace_id, id);

ALTER TABLE report_recipients ADD CONSTRAINT report_recipients_recipient_id_fk FOREIGN KEY (workspace_id, recipient_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE export_jobs ADD CONSTRAINT export_jobs_requested_by_fk FOREIGN KEY (workspace_id, requested_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE export_jobs ADD CONSTRAINT export_jobs_report_revision_id_fk FOREIGN KEY (workspace_id, report_revision_id) REFERENCES report_revisions (workspace_id, id);

ALTER TABLE export_jobs ADD CONSTRAINT export_jobs_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE candidates ADD CONSTRAINT candidates_cv_asset_id_fk FOREIGN KEY (workspace_id, cv_asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE candidates ADD CONSTRAINT candidates_portfolio_asset_id_fk FOREIGN KEY (workspace_id, portfolio_asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE applications ADD CONSTRAINT applications_candidate_id_fk FOREIGN KEY (workspace_id, candidate_id) REFERENCES candidates (workspace_id, id);

ALTER TABLE applications ADD CONSTRAINT applications_recruiter_id_fk FOREIGN KEY (workspace_id, recruiter_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE interviews ADD CONSTRAINT interviews_application_id_fk FOREIGN KEY (workspace_id, application_id) REFERENCES applications (workspace_id, id);

ALTER TABLE interviews ADD CONSTRAINT interviews_interviewer_id_fk FOREIGN KEY (workspace_id, interviewer_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE employee_profiles ADD CONSTRAINT employee_profiles_member_id_fk FOREIGN KEY (workspace_id, member_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE employee_profiles ADD CONSTRAINT employee_profiles_candidate_id_fk FOREIGN KEY (workspace_id, candidate_id) REFERENCES candidates (workspace_id, id);

ALTER TABLE employee_profiles ADD CONSTRAINT employee_profiles_recruiter_id_fk FOREIGN KEY (workspace_id, recruiter_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE employment_terms ADD CONSTRAINT employment_terms_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES employee_profiles (workspace_id, id);

ALTER TABLE employment_terms ADD CONSTRAINT employment_terms_contract_asset_id_fk FOREIGN KEY (workspace_id, contract_asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE employment_terms ADD CONSTRAINT employment_terms_recorded_by_fk FOREIGN KEY (workspace_id, recorded_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE hr_events ADD CONSTRAINT hr_events_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES employee_profiles (workspace_id, id);

ALTER TABLE platform_accounts ADD CONSTRAINT platform_accounts_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE platform_account_grants ADD CONSTRAINT platform_account_grants_account_id_fk FOREIGN KEY (workspace_id, account_id) REFERENCES platform_accounts (workspace_id, id);

ALTER TABLE platform_account_grants ADD CONSTRAINT platform_account_grants_member_id_fk FOREIGN KEY (workspace_id, member_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE platform_account_grants ADD CONSTRAINT platform_account_grants_required_role_id_fk FOREIGN KEY (workspace_id, required_role_id) REFERENCES job_roles (workspace_id, id);

ALTER TABLE platform_account_grants ADD CONSTRAINT platform_account_grants_approved_by_fk FOREIGN KEY (workspace_id, approved_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE credential_versions ADD CONSTRAINT credential_versions_account_id_fk FOREIGN KEY (workspace_id, account_id) REFERENCES platform_accounts (workspace_id, id);

ALTER TABLE credential_versions ADD CONSTRAINT credential_versions_changed_by_fk FOREIGN KEY (workspace_id, changed_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE requests ADD CONSTRAINT requests_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE requests ADD CONSTRAINT requests_requester_id_fk FOREIGN KEY (workspace_id, requester_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE requests ADD CONSTRAINT requests_related_task_id_fk FOREIGN KEY (workspace_id, related_task_id) REFERENCES tasks (workspace_id, id);

ALTER TABLE request_lines ADD CONSTRAINT request_lines_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE approval_instances ADD CONSTRAINT approval_instances_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE approval_instances ADD CONSTRAINT approval_instances_policy_version_id_fk FOREIGN KEY (workspace_id, policy_version_id) REFERENCES approval_policy_versions (workspace_id, id);

ALTER TABLE approval_instances ADD CONSTRAINT approval_instances_submitted_by_fk FOREIGN KEY (workspace_id, submitted_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_instance_id_fk FOREIGN KEY (workspace_id, instance_id) REFERENCES approval_instances (workspace_id, id);

ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_approver_id_fk FOREIGN KEY (workspace_id, approver_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_delegated_from_fk FOREIGN KEY (workspace_id, delegated_from) REFERENCES memberships (workspace_id, id);

ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fk FOREIGN KEY (workspace_id, supplier_id) REFERENCES partners (workspace_id, id);

ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_approval_instance_id_fk FOREIGN KEY (workspace_id, approval_instance_id) REFERENCES approval_instances (workspace_id, id);

ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_order_id_fk FOREIGN KEY (workspace_id, order_id) REFERENCES purchase_orders (workspace_id, id);

ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_request_line_id_fk FOREIGN KEY (workspace_id, request_line_id) REFERENCES request_lines (workspace_id, id);

ALTER TABLE receipts ADD CONSTRAINT receipts_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE receipts ADD CONSTRAINT receipts_order_id_fk FOREIGN KEY (workspace_id, order_id) REFERENCES purchase_orders (workspace_id, id);

ALTER TABLE receipts ADD CONSTRAINT receipts_received_by_fk FOREIGN KEY (workspace_id, received_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_receipt_id_fk FOREIGN KEY (workspace_id, receipt_id) REFERENCES receipts (workspace_id, id);

ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_po_line_id_fk FOREIGN KEY (workspace_id, po_line_id) REFERENCES purchase_order_lines (workspace_id, id);

ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_supplier_id_fk FOREIGN KEY (workspace_id, supplier_id) REFERENCES partners (workspace_id, id);

ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

CREATE INDEX idx_vendor_bills_1 ON vendor_bills (workspace_id, company_id, supplier_id, series, invoice_number);

ALTER TABLE bill_line_matches ADD CONSTRAINT bill_line_matches_bill_id_fk FOREIGN KEY (workspace_id, bill_id) REFERENCES vendor_bills (workspace_id, id);

ALTER TABLE bill_line_matches ADD CONSTRAINT bill_line_matches_po_line_id_fk FOREIGN KEY (workspace_id, po_line_id) REFERENCES purchase_order_lines (workspace_id, id);

ALTER TABLE bill_line_matches ADD CONSTRAINT bill_line_matches_receipt_line_id_fk FOREIGN KEY (workspace_id, receipt_line_id) REFERENCES receipt_lines (workspace_id, id);

ALTER TABLE advances ADD CONSTRAINT advances_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE advances ADD CONSTRAINT advances_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE expense_lines ADD CONSTRAINT expense_lines_claim_id_fk FOREIGN KEY (workspace_id, claim_id) REFERENCES expense_claims (workspace_id, id);

ALTER TABLE expense_lines ADD CONSTRAINT expense_lines_bill_id_fk FOREIGN KEY (workspace_id, bill_id) REFERENCES vendor_bills (workspace_id, id);

ALTER TABLE expense_lines ADD CONSTRAINT expense_lines_evidence_asset_id_fk FOREIGN KEY (workspace_id, evidence_asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_requester_id_fk FOREIGN KEY (workspace_id, requester_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_partner_id_fk FOREIGN KEY (workspace_id, partner_id) REFERENCES partners (workspace_id, id);

ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE payments ADD CONSTRAINT payments_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE payments ADD CONSTRAINT payments_payment_request_id_fk FOREIGN KEY (workspace_id, payment_request_id) REFERENCES payment_requests (workspace_id, id);

ALTER TABLE payments ADD CONSTRAINT payments_recorded_by_fk FOREIGN KEY (workspace_id, recorded_by) REFERENCES memberships (workspace_id, id);

ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_payment_id_fk FOREIGN KEY (workspace_id, payment_id) REFERENCES payments (workspace_id, id);

ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_bill_id_fk FOREIGN KEY (workspace_id, bill_id) REFERENCES vendor_bills (workspace_id, id);

ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_advance_id_fk FOREIGN KEY (workspace_id, advance_id) REFERENCES advances (workspace_id, id);

ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_expense_claim_id_fk FOREIGN KEY (workspace_id, expense_claim_id) REFERENCES expense_claims (workspace_id, id);

ALTER TABLE sales_invoice_requests ADD CONSTRAINT sales_invoice_requests_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE sales_invoice_requests ADD CONSTRAINT sales_invoice_requests_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE sales_invoice_requests ADD CONSTRAINT sales_invoice_requests_customer_id_fk FOREIGN KEY (workspace_id, customer_id) REFERENCES partners (workspace_id, id);

ALTER TABLE sales_invoice_requests ADD CONSTRAINT sales_invoice_requests_invoice_asset_id_fk FOREIGN KEY (workspace_id, invoice_asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE equipment_units ADD CONSTRAINT equipment_units_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE equipment_loans ADD CONSTRAINT equipment_loans_unit_id_fk FOREIGN KEY (workspace_id, unit_id) REFERENCES equipment_units (workspace_id, id);

ALTER TABLE equipment_loans ADD CONSTRAINT equipment_loans_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE equipment_loans ADD CONSTRAINT equipment_loans_borrower_id_fk FOREIGN KEY (workspace_id, borrower_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE sample_fulfillments ADD CONSTRAINT sample_fulfillments_request_id_fk FOREIGN KEY (workspace_id, request_id) REFERENCES requests (workspace_id, id);

ALTER TABLE sample_fulfillments ADD CONSTRAINT sample_fulfillments_channel_id_fk FOREIGN KEY (workspace_id, channel_id) REFERENCES channels (workspace_id, id);

ALTER TABLE inventory_source_records ADD CONSTRAINT inventory_source_records_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE inventory_source_records ADD CONSTRAINT inventory_source_records_import_batch_id_fk FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches (workspace_id, id);

ALTER TABLE knowledge_articles ADD CONSTRAINT knowledge_articles_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE asset_usage_rights ADD CONSTRAINT asset_usage_rights_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE asset_usage_rights ADD CONSTRAINT asset_usage_rights_evidence_asset_id_fk FOREIGN KEY (workspace_id, evidence_asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_id_fk FOREIGN KEY (workspace_id, recipient_id) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_notifications_1 ON notifications (workspace_id, recipient_id, read_at, created_at);

CREATE INDEX idx_outbox_events_1 ON outbox_events (workspace_id, status, next_attempt_at);

ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_records_actor_id_fk FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE audit_events ADD CONSTRAINT audit_events_actor_id_fk FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships (workspace_id, id);

CREATE INDEX idx_audit_events_1 ON audit_events (workspace_id, object_type, object_key, occurred_at);

ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_employee_id_fk FOREIGN KEY (workspace_id, employee_id) REFERENCES employee_profiles (workspace_id, id);

ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_asset_id_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets (workspace_id, id);

ALTER TABLE warehouse_outbound_records ADD CONSTRAINT warehouse_outbound_records_company_id_fk FOREIGN KEY (workspace_id, company_id) REFERENCES legal_entities (workspace_id, id);

ALTER TABLE warehouse_outbound_records ADD CONSTRAINT warehouse_outbound_records_operator_id_fk FOREIGN KEY (workspace_id, operator_id) REFERENCES memberships (workspace_id, id);

ALTER TABLE warehouse_outbound_records ADD CONSTRAINT warehouse_outbound_records_import_batch_id_fk FOREIGN KEY (workspace_id, import_batch_id) REFERENCES import_batches (workspace_id, id);

CREATE UNIQUE INDEX uq_assignment_pending ON task_assignment_attempts (workspace_id, task_id) WHERE status = 'PENDING';

CREATE UNIQUE INDEX uq_support_active ON task_support_invitations (workspace_id, task_id, invitee_id) WHERE status IN ('PENDING','ACCEPTED');

CREATE UNIQUE INDEX uq_vendor_bill_identity ON vendor_bills (workspace_id, company_id, supplier_id, COALESCE(series,''), invoice_number);

CREATE UNIQUE INDEX uq_claim_external_id ON order_claims (workspace_id, channel_id, external_claim_id) WHERE external_claim_id IS NOT NULL;

CREATE FUNCTION reject_immutable_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable historical record'; RETURN NULL; END $$;

CREATE TRIGGER immutable_task_submissions BEFORE UPDATE OR DELETE ON task_submissions FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_task_reviews BEFORE UPDATE OR DELETE ON task_reviews FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_task_events BEFORE UPDATE OR DELETE ON task_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_task_support_responses BEFORE UPDATE OR DELETE ON task_support_responses FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_support_contribution_events BEFORE UPDATE OR DELETE ON support_contribution_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_report_revisions BEFORE UPDATE OR DELETE ON report_revisions FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_report_role_sections BEFORE UPDATE OR DELETE ON report_role_sections FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_credential_versions BEFORE UPDATE OR DELETE ON credential_versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_audit_events BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER immutable_deliverable_versions BEFORE UPDATE OR DELETE ON deliverable_versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

-- Runtime role must not own tables or have BYPASSRLS. Apply tenant/member policies in reviewed migrations.

-- No permissive RLS policy or seeded production credentials are included.

-- Important service transactions/constraints not enforced by this candidate: see docs/07.

COMMIT;
