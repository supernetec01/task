import { employmentV2 } from './hr.js';
import { z } from 'zod';
import { type API } from './app.js';
import {
  type Actor,
  type DB,
  rows,
  one,
  need,
  isAdmin,
  hasJob,
  manages,
  moduleAllowed,
  moduleRole,
  version,
  audit,
  cipher,
  decipher,
  notify,
  setting,
  actor,
} from './base.js';
import { recordKinds, recordSchema } from './record-config.js';
import { recordAccess, fileRoutes } from './files.js';
import { metricRoutes } from './metrics.js';
import { employeeRevision, basicSnapshot } from './employee-history.js';
import { employeeRoutes, hrAccess, sensitiveAllowed, payrollAllowed } from './employees.js';
import { accountRoutes } from './accounts.js';
import { taskAccess } from './tasks.js';
const requestKinds = [
  'PURCHASE',
  'RENTAL',
  'EQUIPMENT_LOAN',
  'SAMPLE_ISSUE',
  'ADVANCE',
  'REIMBURSEMENT',
  'SALES_INVOICE_REQUEST',
  'DOCUMENT_COLLECTION',
] as const;
export function moduleRoutes(api: API) {
  fileRoutes(api);
  accountRoutes(api);
  employeeRoutes(api);
  metricRoutes(api);
  api('GET', '/modules', async (c, a) => ({
    kinds: Object.fromEntries(
      Object.entries(recordKinds).filter(
        ([, v]) =>
          v.module !== 'hr' && moduleAllowed(a, v.module) && (isAdmin(a) || hasJob(a, v.role)),
      ),
    ),
    requestKinds,
  }));
  api('GET', '/records', async (c, a, b, q) => {
    need(moduleAllowed(a, q.module));
    const data = await rows(
      c,
      "SELECT r.*,u.team_id,u.name AS owner_name FROM records r JOIN users u ON u.id=r.owner_id WHERE module=$1 AND ($2='' OR kind=$2) AND title ILIKE $3 ORDER BY updated_at DESC LIMIT 201 OFFSET $4",
      [
        q.module,
        q.kind || '',
        '%' + String(q.search || '').slice(0, 200) + '%',
        Math.max(0, Number(q.cursor) || 0),
      ],
    );
    return {
      items: data
        .filter(
          (r) =>
            isAdmin(a) ||
            (hasJob(a, r.role) &&
              (r.owner_id === a.id || manages(a, { id: r.owner_id, team_id: r.team_id }))),
        )
        .slice(0, 200),
      next_cursor: data.length > 200 ? String((Number(q.cursor) || 0) + 200) : null,
      source:
        q.module === 'warehouse'
          ? 'BigSeller là nguồn tồn kho. Chưa kết nối đồng bộ tự động; bản ghi ở đây là tham chiếu/yêu cầu.'
          : null,
    };
  });
  api('GET', '/records/:id', async (c, a, b, q, p) => {
    const r = await recordAccess(c, a, p.id);
    return {
      ...r,
      assets: await rows(c, 'SELECT id,filename,size FROM assets WHERE record_id=$1', [r.id]),
      links: await rows(c, 'SELECT * FROM record_links WHERE parent_id=$1 OR child_id=$1', [r.id]),
    };
  });
  async function saveRecord(c: DB, a: Actor, b: any, id?: string) {
    const v = z
      .object({
        kind: z.string(),
        title: z.string().trim().min(1).max(255),
        company: z.string().max(150).default(''),
        status: z.string().max(80).default('DRAFT'),
        payload: z.record(z.string(), z.unknown()),
        expected_version: z.number().int().optional(),
      })
      .parse(b);
    const conf = recordKinds[v.kind];
    need(
      conf?.module !== 'hr',
      'Luồng tuyển dụng cũ chỉ còn dữ liệu lưu trữ',
      410,
      'LEGACY_READ_ONLY',
    );
    need(conf, 'Loại hồ sơ chưa được định nghĩa', 422, 'VALIDATION');
    need(isAdmin(a) || hasJob(a, conf.role));
    const payload = recordSchema(v.kind)!.parse(v.payload);
    let old: any;
    if (id) {
      old = await recordAccess(c, a, id, true);
      need(
        !(await one(c, 'SELECT id FROM content_items WHERE id=$1', [id])),
        'Hồ sơ mới cần cập nhật qua quy trình sản xuất',
        409,
        'TYPED_ROUTE_REQUIRED',
      );
      version(old, v.expected_version);
      need(old.kind === v.kind, 'Không đổi loại hồ sơ', 422, 'VALIDATION');
    }
    const references: Record<string, string> = {
      campaign_id: 'CAMPAIGN',
      content_id: 'CONTENT',
      candidate_id: 'CANDIDATE',
      application_id: 'APPLICATION',
      koc_id: 'KOC',
      collaboration_id: 'KOC_COLLAB',
      equipment_id: 'EQUIPMENT',
    };
    for (const [field, kind] of Object.entries(references)) {
      if (payload[field]) {
        const linked = await recordAccess(c, a, payload[field] as string);
        need(
          linked.kind === kind && linked.company === v.company,
          'Liên kết sai loại hoặc pháp nhân',
          422,
          'VALIDATION',
        );
      }
    }
    if (payload.request_id) {
      const req = await one(c, 'SELECT * FROM requests WHERE id=$1', [payload.request_id]);
      need(
        req &&
          req.company === v.company &&
          (isAdmin(a) || req.owner_id === a.id || req.policy_snapshot?.approvers?.includes(a.id)),
        'Đề nghị khác pháp nhân hoặc ngoài phạm vi',
        422,
        'VALIDATION',
      );
    }
    if (v.kind === 'PUBLICATION') {
      const { t } = await taskAccess(c, a, payload.approved_task_id as string);
      const content = await recordAccess(c, a, payload.content_id as string);
      need(
        content.payload.task_id === t.id || t.payload.content_id === content.id,
        'Bản duyệt không thuộc nội dung này',
        422,
        'CONTENT_MISMATCH',
      );
      need(
        t.status === 'DONE' && t.approved_submission_id,
        'Bài đăng cần bản đầu ra đã duyệt',
        422,
        'APPROVAL_REQUIRED',
      );
      need(payload.url || payload.platform_id, 'Cần link hoặc ID bài đăng', 422, 'VALIDATION');
    }
    const r = id
      ? await one(
          c,
          'UPDATE records SET title=$2,company=$3,status=$4,payload=$5,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
          [id, v.title, v.company, v.status, JSON.stringify(payload)],
        )
      : await one(
          c,
          'INSERT INTO records(module,kind,role,owner_id,company,title,status,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            conf.module,
            v.kind,
            conf.role,
            a.id,
            v.company,
            v.title,
            v.status,
            JSON.stringify(payload),
          ],
        );
    let warnings: string[] = [];
    if (['SHOOT', 'LOAN'].includes(v.kind) && payload.start_at && payload.end_at) {
      need(
        new Date(payload.end_at as string) > new Date(payload.start_at as string),
        'Ngày kết thúc phải sau bắt đầu',
        422,
        'VALIDATION',
      );
      const conflicts = await rows(
        c,
        "SELECT id FROM records WHERE kind=$1 AND id<>$2 AND payload->>'equipment_id'=$3 AND (payload->>'start_at')::timestamptz<$4 AND (payload->>'end_at')::timestamptz>$5",
        [v.kind, r.id, payload.equipment_id || '', payload.end_at, payload.start_at],
      );
      if (conflicts.length)
        warnings.push('Có lịch trùng thiết bị; kiểm tra và điều phối theo Q21.');
    }
    if (v.kind === 'BIGSELLER_OUTBOUND') {
      const dupe = await one(
        c,
        "SELECT id FROM records WHERE kind='BIGSELLER_OUTBOUND' AND company=$1 AND payload->>'external_id'=$2 AND id<>$3",
        [v.company, payload.external_id, r.id],
      );
      need(!dupe, 'Dòng BigSeller đã tồn tại', 409, 'DUPLICATE_SOURCE');
    }
    await audit(c, a, id ? 'RECORD_UPDATED' : 'RECORD_CREATED', 'record', r.id, { kind: r.kind });
    return { ...r, warnings };
  }
  api('POST', '/records', async (c, a, b) => saveRecord(c, a, b));
  api('PATCH', '/records/:id', async (c, a, b, q, p) => saveRecord(c, a, b, p.id));
  api('POST', '/employees/:id/probation-start', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id, true);
    version(e, b.expected_version);
    const v = z.object({ actual_start_date: z.iso.date() }).parse(b);
    need(e.employment_state === 'CANDIDATE', 'Đã bắt đầu thử việc hoặc đã nghỉ', 409, 'STATE');
    await c.query(
      "UPDATE employee_profiles SET employment_state='PROBATION',probation_start=$2,version=version+1 WHERE id=$1",
      [e.id, v.actual_start_date],
    );
    await c.query(
      "INSERT INTO employment_events(employee_id,kind,business_date,actor_id) VALUES($1,'PROBATION_STARTED',$2,$3)",
      [e.id, v.actual_start_date, a.id],
    );
    const hr = await rows(
      c,
      "SELECT DISTINCT user_id FROM grants WHERE kind='JOB' AND role='HR' AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())",
    );
    if ((await setting(c, 'policies')).recruiter_reminders_confirmed)
      for (const u of hr)
        if (u.user_id === e.created_by || isAdmin(await actor(c, u.user_id)))
          await notify(
            c,
            u.user_id,
            'probation:' + e.id,
            'Có sự kiện bắt đầu thử việc; HR kiểm tra thưởng tuyển dụng, không tự tính tiền',
            e.id,
          );
    await employeeRevision(
      c,
      a,
      e.id,
      'PROBATION_STARTED',
      basicSnapshot(e),
      basicSnapshot(await hrAccess(c, a, e.id)),
    );
    await audit(c, a, 'PROBATION_STARTED', 'employee', e.id);
    return { ok: true };
  });
  api('POST', '/employees/:id/employment', async (c, a, b, q, p) => {
    if (b.phase) return employmentV2(c, a, p.id, b);
    const e = await hrAccess(c, a, p.id, true);
    version(e, b.expected_version);
    const v = z
      .object({
        state: z.enum(['OFFICIAL', 'LEFT']),
        date: z.iso.date(),
        reason: z.string().trim().min(1),
      })
      .parse(b);
    need(
      v.state !== 'LEFT',
      'Luồng nghỉ việc đã chuyển sang /employees/:id/leave để kiểm tra chính sách bàn giao',
      410,
      'ENDPOINT_RETIRED',
    );
    need(e.employment_state === 'PROBATION', 'Chuyển trạng thái không hợp lệ', 409, 'STATE');
    await c.query(
      "UPDATE employee_profiles SET employment_state=$2,official_start=CASE WHEN $2='OFFICIAL' THEN $3 ELSE official_start END,version=version+1 WHERE id=$1",
      [e.id, v.state, v.date],
    );
    await c.query(
      'INSERT INTO employment_events(employee_id,kind,business_date,actor_id,payload) VALUES($1,$2,$3,$4,$5)',
      [e.id, v.state, v.date, a.id, JSON.stringify({ reason: v.reason })],
    );
    await employeeRevision(
      c,
      a,
      e.id,
      'EMPLOYMENT_CHANGED',
      basicSnapshot(e),
      basicSnapshot(await hrAccess(c, a, e.id)),
    );
    await audit(c, a, 'EMPLOYMENT_CHANGED', 'employee', e.id, { state: v.state });
    return { ok: true };
  });
  api('GET', '/employees/:id/sensitive', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id);
    need(await sensitiveAllowed(c, a, e));
    await audit(c, a, 'HR_SENSITIVE_READ', 'employee', e.id);
    const data = e.sensitive_cipher ? JSON.parse(decipher(e.sensitive_cipher)) : null;
    if (data) {
      delete data.salary;
      delete data.bonus;
    }
    return { data };
  });
  api('PUT', '/employees/:id/sensitive', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id, true);
    need(await sensitiveAllowed(c, a, e));
    version(e, b.expected_version);
    const v = z
      .object({
        salary: z.string().max(100).optional(),
        identity_document: z.string().max(100),
        tax_id: z.string().max(100).default(''),
        social_insurance: z.string().max(100).default(''),
        bank_name: z.string().max(150).default(''),
        bank_account: z.string().max(150).default(''),
        notes: z.string().max(5000),
      })
      .parse(b.data);
    const old = e.sensitive_cipher ? JSON.parse(decipher(e.sensitive_cipher)) : {};
    const next = { ...old, ...v };
    let payrollCipher = e.payroll_cipher;
    // Compatibility for a cached older Admin form: split its salary into payroll storage/history.
    if (v.salary !== undefined) {
      const previousPayroll = e.payroll_cipher ? JSON.parse(decipher(e.payroll_cipher)) : old;
      const beforePayroll = {
        salary: previousPayroll.salary || '',
        bonus: previousPayroll.bonus || '',
        notes: e.payroll_cipher ? previousPayroll.notes || '' : '',
      };
      const afterPayroll = { ...beforePayroll, salary: v.salary };
      payrollCipher = cipher(JSON.stringify(afterPayroll));
      await employeeRevision(c, a, e.id, 'PAYROLL_UPDATED', beforePayroll, afterPayroll, 'PAYROLL');
      delete next.salary;
    } else if (old.salary !== undefined) next.salary = old.salary;
    else delete next.salary;
    await employeeRevision(c, a, e.id, 'SENSITIVE_UPDATED', old, next, 'SENSITIVE');
    await c.query(
      'UPDATE employee_profiles SET sensitive_cipher=$2,payroll_cipher=$3,version=version+1 WHERE id=$1',
      [e.id, cipher(JSON.stringify(next)), payrollCipher],
    );
    await audit(c, a, 'HR_SENSITIVE_UPDATED', 'employee', e.id);
    return { ok: true };
  });
  api('GET', '/employees/:id/payroll', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id);
    need(payrollAllowed(a));
    const stored = e.payroll_cipher
      ? JSON.parse(decipher(e.payroll_cipher))
      : e.sensitive_cipher
        ? JSON.parse(decipher(e.sensitive_cipher))
        : {};
    return {
      data: {
        salary: stored.salary || '',
        bonus: stored.bonus || '',
        notes: e.payroll_cipher ? stored.notes || '' : '',
      },
    };
  });
  api('PUT', '/employees/:id/payroll', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id, true);
    need(payrollAllowed(a));
    version(e, b.expected_version);
    const v = z
      .object({
        salary: z.string().max(100),
        bonus: z.string().max(1000).default(''),
        notes: z.string().max(5000).default(''),
      })
      .strict()
      .parse(b.data);
    const stored = e.payroll_cipher
      ? JSON.parse(decipher(e.payroll_cipher))
      : e.sensitive_cipher
        ? JSON.parse(decipher(e.sensitive_cipher))
        : {};
    const before = {
      salary: stored.salary || '',
      bonus: stored.bonus || '',
      notes: e.payroll_cipher ? stored.notes || '' : '',
    };
    await c.query('UPDATE employee_profiles SET payroll_cipher=$2,version=version+1 WHERE id=$1', [
      e.id,
      cipher(JSON.stringify(v)),
    ]);
    await employeeRevision(c, a, e.id, 'PAYROLL_UPDATED', before, v, 'PAYROLL');
    return { ok: true };
  });
  api('POST', '/approval-policies', async (c, a, b) => {
    need(isAdmin(a));
    const v = z
      .object({
        kind: z.enum(requestKinds),
        company: z.string().min(1),
        max_amount: z
          .string()
          .regex(/^\d{1,14}(\.\d{1,2})?$/)
          .nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        approvers: z.array(z.uuid()).min(1).max(10),
        enabled: z.boolean(),
        reason: z.string().min(1),
      })
      .parse(b);
    for (const id of v.approvers) await actor(c, id);
    need(
      new Set(v.approvers).size === v.approvers.length,
      'Người duyệt bị trùng',
      422,
      'VALIDATION',
    );
    const policy = await one(
      c,
      'INSERT INTO approval_policies(kind,company,max_amount,currency,approvers,enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,company) DO UPDATE SET max_amount=EXCLUDED.max_amount,currency=EXCLUDED.currency,approvers=EXCLUDED.approvers,enabled=EXCLUDED.enabled,version=approval_policies.version+1 RETURNING *',
      [v.kind, v.company, v.max_amount, v.currency, v.approvers, v.enabled],
    );
    await audit(c, a, 'APPROVAL_POLICY_DECISION', 'approval_policy', policy.id, {
      reason: v.reason,
    });
    return policy;
  });
  api('GET', '/requests', async (c, a) => {
    const data = await rows(
      c,
      'SELECT r.*,u.name AS owner_name,u.team_id FROM requests r JOIN users u ON u.id=r.owner_id ORDER BY created_at DESC LIMIT 300',
    );
    return {
      items: data.filter(
        (r) => r.owner_id === a.id || isAdmin(a) || r.policy_snapshot?.approvers?.includes(a.id),
      ),
    };
  });
  async function saveRequest(c: DB, a: Actor, b: any, id?: string) {
    need(a.grants.length, 'Chưa có quyền', 403, 'FORBIDDEN');
    const v = z
      .object({
        kind: z.enum(requestKinds),
        title: z.string().trim().min(1).max(255),
        company: z.string().trim().min(1).max(150),
        amount: z
          .string()
          .regex(/^\d{1,14}(\.\d{1,2})?$/)
          .nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        needed_on: z.iso.date().nullable(),
        task_id: z.uuid().nullable().default(null),
        payload: z.object({
          purpose: z.string().max(5000),
          items: z
            .array(
              z.object({
                name: z.string().min(1),
                quantity: z.number().positive(),
                unit: z.string().min(1),
              }),
            )
            .max(100),
          supplier: z.string().max(255).default(''),
          external_invoice_status: z.string().max(100).default('NOT_ISSUED'),
          external_invoice_id: z.string().max(150).default(''),
        }),
        expected_version: z.number().int().optional(),
      })
      .parse(b);
    if (v.task_id) await taskAccess(c, a, v.task_id);
    if (id) {
      const old = await one(c, 'SELECT * FROM requests WHERE id=$1 FOR UPDATE', [id]);
      need(old && old.owner_id === a.id);
      version(old, v.expected_version);
      need(
        !['SUBMITTED', 'FULFILLED'].includes(old.state),
        'Đang duyệt hoặc đã hoàn tất; không sửa trực tiếp',
        409,
        'STATE',
      );
      await c.query(
        'INSERT INTO request_revisions(request_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [id, old.version, JSON.stringify(old), a.id],
      );
      const r = await one(
        c,
        "UPDATE requests SET kind=$2,title=$3,company=$4,amount=$5,currency=$6,needed_on=$7,task_id=$8,payload=$9,state='DRAFT',policy_snapshot=NULL,step=0,version=version+1 WHERE id=$1 RETURNING *",
        [
          id,
          v.kind,
          v.title,
          v.company,
          v.amount,
          v.currency,
          v.needed_on,
          v.task_id,
          JSON.stringify(v.payload),
        ],
      );
      await audit(c, a, 'REQUEST_REVISED', 'request', r.id);
      return r;
    }
    const r = await one(
      c,
      'INSERT INTO requests(owner_id,kind,title,company,amount,currency,needed_on,task_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [
        a.id,
        v.kind,
        v.title,
        v.company,
        v.amount,
        v.currency,
        v.needed_on,
        v.task_id,
        JSON.stringify(v.payload),
      ],
    );
    await audit(c, a, 'REQUEST_CREATED', 'request', r.id);
    return r;
  }
  api('POST', '/requests', async (c, a, b) => saveRequest(c, a, b));
  api('PATCH', '/requests/:id', async (c, a, b, q, p) => saveRequest(c, a, b, p.id));
  api('POST', '/requests/:id/submit', async (c, a, b, q, p) => {
    const r = await one(c, 'SELECT * FROM requests WHERE id=$1 FOR UPDATE', [p.id]);
    need(r && r.owner_id === a.id);
    version(r, b.expected_version);
    need(['DRAFT', 'NEEDS_INFO', 'REJECTED'].includes(r.state), 'Không thể nộp', 409, 'STATE');
    const policy = await one(
      c,
      'SELECT * FROM approval_policies WHERE kind=$1 AND company=$2 AND enabled',
      [r.kind, r.company],
    );
    need(policy, 'Chưa cấu hình chính sách/người duyệt Q22–Q23', 422, 'CONFIG_REQUIRED');
    need(policy.currency === r.currency, 'Tiền tệ khác chính sách', 422, 'VALIDATION');
    need(!policy.approvers.includes(a.id), 'Không được tự duyệt đề nghị', 422, 'SELF_APPROVAL');
    if (r.amount !== null) {
      need(policy.max_amount !== null, 'Cần hạn mức đã chốt để duyệt tiền', 422, 'CONFIG_REQUIRED');
      need(
        Number(r.amount) <= Number(policy.max_amount),
        'Vượt hạn mức chính sách',
        422,
        'LIMIT_EXCEEDED',
      );
    }
    for (const id of policy.approvers) await actor(c, id);
    await c.query(
      'INSERT INTO request_revisions(request_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [r.id, r.version, JSON.stringify(r), a.id],
    );
    const out = await one(
      c,
      "UPDATE requests SET state='SUBMITTED',step=0,policy_snapshot=$2,version=version+1 WHERE id=$1 RETURNING *",
      [r.id, JSON.stringify(policy)],
    );
    await notify(
      c,
      policy.approvers[0],
      `request:${r.id}:${out.version}`,
      'Có đề nghị chờ bạn phê duyệt',
      r.id,
    );
    await audit(c, a, 'REQUEST_SUBMITTED', 'request', r.id);
    return out;
  });
  api('POST', '/requests/:id/decision', async (c, a, b, q, p) => {
    const r = await one(c, 'SELECT * FROM requests WHERE id=$1 FOR UPDATE', [p.id]);
    need(r && r.policy_snapshot?.approvers[r.step] === a.id && r.owner_id !== a.id);
    version(r, b.expected_version);
    need(r.state === 'SUBMITTED', 'Đã có quyết định hoặc bản mới', 409, 'STATE');
    const v = z
      .object({
        decision: z.enum(['APPROVE', 'REJECT', 'NEEDS_INFO']),
        note: z.string().trim().min(1).max(5000),
      })
      .parse(b);
    await c.query(
      'INSERT INTO approval_decisions(request_id,request_version,step,actor_id,decision,note) VALUES($1,$2,$3,$4,$5,$6)',
      [r.id, r.version, r.step, a.id, v.decision, v.note],
    );
    const next = r.step + 1,
      last = next >= r.policy_snapshot.approvers.length,
      state =
        v.decision === 'APPROVE'
          ? last
            ? r.amount === null
              ? 'NEEDS_QUOTE'
              : 'APPROVED'
            : 'SUBMITTED'
          : v.decision === 'REJECT'
            ? 'REJECTED'
            : 'NEEDS_INFO';
    const out = await one(
      c,
      'UPDATE requests SET state=$2,step=$3,version=version+1 WHERE id=$1 RETURNING *',
      [r.id, state, next],
    );
    await notify(
      c,
      state === 'SUBMITTED' ? r.policy_snapshot.approvers[next] : r.owner_id,
      `decision:${r.id}:${out.version}`,
      'Đề nghị có cập nhật phê duyệt',
      r.id,
    );
    await audit(c, a, 'REQUEST_DECIDED', 'request', r.id, { state });
    return out;
  });
  api('POST', '/requests/:id/fulfillment', async (c, a, b, q, p) => {
    const r = await one(c, 'SELECT * FROM requests WHERE id=$1 FOR UPDATE', [p.id]);
    need(
      r &&
        (isAdmin(a) || hasJob(a, 'ACCOUNTANT')) &&
        (isAdmin(a) || r.policy_snapshot?.approvers.includes(a.id)),
    );
    version(r, b.expected_version);
    need(r.state === 'APPROVED', 'Chỉ xử lý sau phê duyệt đầy đủ', 409, 'STATE');
    const v = z
      .object({
        external_reference: z.string().trim().min(1).max(500),
        note: z.string().trim().min(1).max(5000),
      })
      .parse(b);
    const out = await one(
      c,
      "UPDATE requests SET state='FULFILLED',payload=payload||$2::jsonb,version=version+1 WHERE id=$1 RETURNING *",
      [r.id, JSON.stringify({ fulfillment: v })],
    );
    await audit(c, a, 'EXTERNAL_FULFILLMENT_RECORDED', 'request', r.id);
    return out;
  });
  api('POST', '/recurring-rules', async (c, a, b) => {
    need(isAdmin(a));
    const v = z
      .object({
        owner_id: z.uuid(),
        role: z.string(),
        title: z.string().min(1).max(255),
        type: z.string().default('OTHER'),
        iso_weekdays: z.array(z.number().int().min(1).max(7)).min(1),
        due_hour: z.number().int().min(0).max(23),
        enabled: z.boolean(),
      })
      .parse(b);
    need(hasJob(await actor(c, v.owner_id), v.role));
    const r = await one(
      c,
      'INSERT INTO recurring_rules(owner_id,role,title,type,iso_weekdays,due_hour,enabled) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [v.owner_id, v.role, v.title, v.type, v.iso_weekdays, v.due_hour, v.enabled],
    );
    await audit(c, a, 'RECURRING_CONFIGURED', 'rule', r.id);
    return r;
  });
}
