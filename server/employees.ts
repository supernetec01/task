import { z } from 'zod';
import ExcelJS from 'exceljs';
import type { API } from './app.js';
import {
  type DB,
  type Actor,
  one,
  rows,
  need,
  isAdmin,
  hasJob,
  manages,
  management,
  actor,
  version,
  localDate,
  jobs,
  setting,
  decipher,
} from './base.js';
import { employeeRevision, basicSnapshot } from './employee-history.js';
export const hrEdit = (a: Actor) => isAdmin(a) || hasJob(a, 'HR');
export const payrollAllowed = (a: Actor) => hrEdit(a);
export async function hrAccess(c: DB, a: Actor, id: string, lock = false) {
  need(hrEdit(a));
  const e = await one(
    c,
    'SELECT * FROM employee_profiles WHERE id=$1' + (lock ? ' FOR UPDATE' : ''),
    [id],
  );
  need(e, 'Không tìm thấy nhân viên', 404, 'NOT_FOUND');
  return e;
}
export async function sensitiveAllowed(c: DB, a: Actor, e: any) {
  return isAdmin(a);
}
const nullableDate = z.iso.date().nullable().default(null);
const contact = z
  .object({
    phone: z.string().max(40).default(''),
    email: z.union([z.email(), z.literal('')]).default(''),
    address: z.string().max(500).default(''),
    emergency_name: z.string().max(150).default(''),
    emergency_phone: z.string().max(40).default(''),
    photo_asset_id: z.uuid().nullable().optional(),
  })
  .strict();
const employeeSchema = z.object({
  employee_code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(150),
  joined_on: z.iso.date(),
  positions: z.array(z.string()).min(1).max(20),
  birthday: nullableDate,
  team_id: z.uuid().nullable().default(null),
  manager_id: z.uuid().nullable().default(null),
  user_id: z.uuid().nullable().default(null),
  phase: z.enum(['PROBATION', 'OFFICIAL']),
  employment_type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR']),
  probation_end: nullableDate,
  contract_date: nullableDate,
  contract_end: nullableDate,
  contact: contact.default({
    phone: '',
    email: '',
    address: '',
    emergency_name: '',
    emergency_phone: '',
  }),
});
async function details(c: DB, a: Actor, e: any) {
  const positions = await rows(
    c,
    'SELECT * FROM employee_positions WHERE employee_id=$1 ORDER BY effective_from DESC,position_code',
    [e.id],
  );
  const sensitive = await sensitiveAllowed(c, a, e);
  const documents = await rows(
    c,
    `SELECT d.id,d.asset_id,d.document_kind,d.classification,d.created_at,f.filename,f.size FROM employee_documents d JOIN assets f ON f.id=d.asset_id WHERE d.employee_id=$1 AND ($2 OR d.classification='BASIC' OR ($3 AND d.document_kind='PAYROLL')) ORDER BY d.created_at DESC`,
    [e.id, sensitive, payrollAllowed(a)],
  );
  const present = await rows(
    c,
    'SELECT DISTINCT document_kind FROM employee_documents WHERE employee_id=$1',
    [e.id],
  );
  const linked = e.user_id
    ? await one(c, 'SELECT id,username,name,active FROM users WHERE id=$1', [e.user_id])
    : null;
  const policies = await setting(c, 'policies');
  const checklist = Array.isArray(policies.employee_document_checklists?.[e.employment_type])
    ? policies.employee_document_checklists[e.employment_type]
    : [];
  return {
    id: e.id,
    employee_code: e.employee_code,
    name: e.name,
    user_id: e.user_id,
    linked_user: linked,
    birthday: e.birthday,
    joined_on: e.joined_on,
    team_id: e.team_id,
    manager_id: e.manager_id,
    employment_state: e.employment_state,
    employment_type: e.employment_type,
    probation_start: e.probation_start,
    probation_end: e.probation_end,
    official_start: e.official_start,
    contract_date: e.contract_date,
    contract_end: e.contract_end,
    left_on: e.left_on,
    archived_at: e.archived_at,
    contact: e.contact,
    version: e.version,
    positions,
    documents,
    missing_documents: checklist.filter(
      (kind: string) => !present.some((d) => d.document_kind === kind),
    ),
    checklist_configured: checklist.length > 0,
    capabilities: {
      edit: hrEdit(a) && !e.archived_at,
      payroll: payrollAllowed(a),
      provision_user: isAdmin(a) && !e.archived_at && !e.user_id,
      sensitive,
      leave: hrEdit(a) && !e.archived_at && e.employment_state !== 'CANDIDATE',
    },
    events: await rows(
      c,
      'SELECT id,kind,business_date,payload FROM employment_events WHERE employee_id=$1 ORDER BY created_at DESC',
      [e.id],
    ),
  };
}
async function employeeList(c: DB, a: Actor, q: any) {
  need(hrEdit(a));
  const data = await rows(
    c,
    `SELECT e.*,t.name AS team_name FROM employee_profiles e LEFT JOIN teams t ON t.id=e.team_id WHERE e.employment_state<>'CANDIDATE' AND ($1::boolean=(e.archived_at IS NOT NULL OR e.employment_state='LEFT')) AND (e.name ILIKE $2 OR coalesce(e.employee_code,'') ILIKE $2) AND ($3='' OR e.team_id::text=$3) AND ($4='' OR e.employment_state=$4) AND ($5='' OR e.employment_type=$5) AND ($6='' OR EXISTS(SELECT 1 FROM employee_positions p WHERE p.employee_id=e.id AND p.position_code=$6 AND p.effective_to IS NULL)) ORDER BY e.name,e.id`,
    [
      q.status === 'archived',
      '%' + String(q.search || '').slice(0, 150) + '%',
      q.team_id || '',
      q.phase || '',
      q.type || '',
      q.position || '',
    ],
  );
  const visible = [];
  for (const e of data)
    if (
      await hrAccess(c, a, e.id)
        .then(() => true)
        .catch(() => false)
    )
      visible.push({ ...(await details(c, a, e)), team_name: e.team_name });
  return visible;
}
async function validate(c: DB, a: Actor, v: z.infer<typeof employeeSchema>, id?: string) {
  need(
    new Set(v.positions).size === v.positions.length && v.positions.every((p) => jobs.includes(p)),
    'Vị trí không hợp lệ hoặc bị trùng',
    422,
    'VALIDATION',
  );
  const duplicate = await one(
    c,
    'SELECT id FROM employee_profiles WHERE lower(employee_code)=lower($1) AND ($2::uuid IS NULL OR id<>$2)',
    [v.employee_code, id || null],
  );
  need(
    !duplicate,
    'Mã nhân sự này đã tồn tại. Hãy chọn mã khác hoặc mở hồ sơ đã có.',
    409,
    'EMPLOYEE_CODE_EXISTS',
  );
  if (v.team_id)
    need(
      await one(c, 'SELECT id FROM teams WHERE id=$1', [v.team_id]),
      'Bộ phận không tồn tại',
      422,
      'VALIDATION',
    );
  if (v.manager_id) {
    const m = await actor(c, v.manager_id);
    need(
      v.manager_id !== v.user_id && manages(m, { id: v.user_id || '', team_id: v.team_id }),
      'Quản lý phải có quyền và phạm vi phù hợp',
      422,
      'VALIDATION',
    );
  }
  if (v.user_id) {
    await actor(c, v.user_id);
    const linked = await one(
      c,
      'SELECT id FROM employee_profiles WHERE user_id=$1 AND ($2::uuid IS NULL OR id<>$2)',
      [v.user_id, id || null],
    );
    need(!linked, 'Tài khoản đã liên kết một hồ sơ nhân viên', 409, 'EMPLOYEE_LINK_CONFLICT');
  }
  need(!v.birthday || v.birthday <= localDate(), 'Ngày sinh không hợp lệ', 422, 'VALIDATION');
  need(
    !v.probation_end || v.probation_end >= v.joined_on,
    'Hết thử việc phải sau ngày vào làm',
    422,
    'VALIDATION',
  );
  need(
    !v.contract_end || !v.contract_date || v.contract_end >= v.contract_date,
    'Hợp đồng có ngày kết thúc trước ngày ký',
    422,
    'VALIDATION',
  );
  if (v.contact.photo_asset_id) {
    const file = id
      ? await one(
          c,
          "SELECT f.filename FROM assets f JOIN employee_documents d ON d.asset_id=f.id WHERE f.id=$1 AND f.employee_id=$2 AND d.employee_id=$2 AND d.document_kind='PHOTO' AND d.classification='BASIC'",
          [v.contact.photo_asset_id, id],
        )
      : null;
    need(
      file && /\.(png|jpe?g|webp)$/i.test(file.filename),
      'Ảnh phải thuộc tài liệu riêng của nhân viên này',
      422,
      'PHOTO_INVALID',
    );
  }
}
export async function createEmployee(c: DB, a: Actor, b: any) {
  need(hrEdit(a));
  const v = employeeSchema.parse(b);
  await validate(c, a, v);
  need(v.team_id, 'Cần chọn bộ phận khi tạo hồ sơ', 422, 'TEAM_REQUIRED');
  need(!v.user_id || isAdmin(a), 'Chỉ Admin liên kết tài khoản đăng nhập', 403, 'FORBIDDEN');
  const e = await one(
    c,
    'INSERT INTO employee_profiles(created_by,user_id,name,birthday,employee_code,joined_on,team_id,manager_id,employment_state,employment_type,probation_start,official_start,probation_end,contract_date,contract_end,contact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *',
    [
      a.id,
      v.user_id,
      v.name,
      v.birthday,
      v.employee_code,
      v.joined_on,
      v.team_id,
      v.manager_id,
      v.phase,
      v.employment_type,
      v.phase === 'PROBATION' ? v.joined_on : null,
      v.phase === 'OFFICIAL' ? v.joined_on : null,
      v.probation_end,
      v.contract_date,
      v.contract_end,
      JSON.stringify(v.contact),
    ],
  );
  for (const p of v.positions)
    await c.query(
      'INSERT INTO employee_positions(employee_id,position_code,effective_from) VALUES($1,$2,$3)',
      [e.id, p, v.joined_on],
    );
  await c.query(
    "INSERT INTO employment_events(employee_id,kind,business_date,actor_id,payload) VALUES($1,'PROFILE_CREATED',$2,$3,$4)",
    [
      e.id,
      v.joined_on,
      a.id,
      JSON.stringify({
        positions: v.positions,
        phase: v.phase,
        employment_type: v.employment_type,
      }),
    ],
  );
  await employeeRevision(c, a, e.id, 'PROFILE_CREATED', null, basicSnapshot(e, v.positions));
  return details(c, a, e);
}
export function employeeRoutes(api: API) {
  api('GET', '/employees/options', async (c, a) => {
    need(hrEdit(a));
    const people = await rows(c, 'SELECT id,name,team_id FROM users WHERE active ORDER BY name');
    const managers = [];
    for (const p of people) {
      const u = await actor(c, p.id);
      if (management(u))
        managers.push({
          id: p.id,
          name: p.name,
          team_id: p.team_id,
          scopes: u.grants
            .filter((g) => g.kind === 'ACCESS' && ['ADMIN', 'BOSS'].includes(g.role))
            .map((g) => ({ scope: g.scope, team_id: g.team_id })),
        });
    }
    return {
      teams: await rows(c, 'SELECT id,name FROM teams ORDER BY name'),
      positions: jobs,
      managers,
      users: isAdmin(a) ? people : [],
    };
  });
  api('GET', '/employees', async (c, a, b, q) => {
    const all = await employeeList(c, a, q);
    const offset = Math.max(0, Number(q.cursor) || 0),
      limit = 30;
    return {
      items: all.slice(offset, offset + limit),
      next_cursor: all.length > offset + limit ? String(offset + limit) : null,
      total: all.length,
      summary: {
        active: all.filter((e) => !e.archived_at).length,
        probation: all.filter((e) => e.employment_state === 'PROBATION').length,
        incomplete: all.filter((e) => e.missing_documents.length).length,
      },
      checklist_configured: all.some((e) => e.checklist_configured),
    };
  });
  api('GET', '/employees/export', async (c, a, b, q, p, reply) => {
    const list = await employeeList(c, a, q);
    const w = new ExcelJS.Workbook(),
      s = w.addWorksheet('Nhan_su');
    s.addRow([
      'Mã nhân sự',
      'Họ tên',
      'Bộ phận',
      'Ngày vào làm',
      'Giai đoạn',
      'Loại hình',
      'Vị trí',
    ]);
    const positionLabels: Record<string, string> = {
      CONTENT: 'Nội dung',
      DESIGNER: 'Thiết kế',
      MARKETPLACE: 'Vận hành sàn',
      ADS: 'Quảng cáo',
      HR: 'Nhân sự',
      ACCOUNTANT: 'Kế toán',
      WAREHOUSE: 'Kho',
      INTERN: 'Thực tập sinh',
      TESTER_OPTIONAL: 'Kiểm thử',
    };
    for (const e of list)
      s.addRow([
        e.employee_code || '',
        e.name,
        e.team_name || '',
        e.joined_on || '',
        e.employment_state === 'PROBATION'
          ? 'Thử việc'
          : e.employment_state === 'LEFT'
            ? 'Đã nghỉ'
            : 'Chính thức',
        (
          {
            FULL_TIME: 'Toàn thời gian',
            PART_TIME: 'Bán thời gian',
            INTERN: 'Thực tập',
            CONTRACTOR: 'Cộng tác',
          } as any
        )[e.employment_type] || '',
        e.positions
          .filter((p) => !p.effective_to)
          .map((p) => positionLabels[p.position_code] || p.position_code)
          .join(', '),
      ]);
    s.columns.forEach((col) => {
      col.width = 24;
    });
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="nhan-su.xlsx"');
    return Buffer.from(await w.xlsx.writeBuffer());
  });
  api('POST', '/employees/exports', async (c, a, b) => {
    await employeeList(c, a, b || {});
    const q = new URLSearchParams();
    for (const key of ['status', 'search', 'team_id', 'phase', 'type', 'position'])
      if (b[key]) q.set(key, String(b[key]));
    return { url: '/api/v1/employees/export?' + q };
  });
  api('POST', '/employees', createEmployee);
  api('GET', '/employees/:id', async (c, a, b, q, p) => details(c, a, await hrAccess(c, a, p.id)));
  api('PATCH', '/employees/:id', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id, true);
    version(e, b.expected_version);
    need(!e.archived_at, 'Hồ sơ đã được lưu trữ', 409, 'STATE');
    const v = employeeSchema.parse(b);
    need(
      v.phase === e.employment_state,
      'Chuyển giai đoạn cần thao tác công tác riêng',
      422,
      'EMPLOYMENT_ACTION_REQUIRED',
    );
    await validate(c, a, v, e.id);
    need(
      e.user_id === v.user_id || (!e.user_id && isAdmin(a)),
      'Không được đổi liên kết tài khoản đã thiết lập',
      422,
      'EMPLOYEE_LINK_CONFLICT',
    );
    const updated = await one(
      c,
      'UPDATE employee_profiles SET employee_code=$2,name=$3,joined_on=$4,birthday=$5,team_id=$6,manager_id=$7,user_id=$8,employment_state=$9,employment_type=$10,probation_end=$11,contract_date=$12,contract_end=$13,contact=$14,version=version+1 WHERE id=$1 RETURNING *',
      [
        e.id,
        v.employee_code,
        v.name,
        v.joined_on,
        v.birthday,
        v.team_id,
        v.manager_id,
        v.user_id,
        v.phase,
        v.employment_type,
        v.probation_end,
        v.contract_date,
        v.contract_end,
        JSON.stringify({
          ...v.contact,
          photo_asset_id:
            v.contact.photo_asset_id === undefined
              ? e.contact.photo_asset_id || null
              : v.contact.photo_asset_id,
        }),
      ],
    );
    const old = await rows(
      c,
      'SELECT * FROM employee_positions WHERE employee_id=$1 AND effective_to IS NULL',
      [e.id],
    );
    for (const p of old.filter((p) => !v.positions.includes(p.position_code)))
      await c.query(
        'UPDATE employee_positions SET effective_to=greatest(effective_from,$2::date) WHERE id=$1',
        [p.id, localDate()],
      );
    for (const p of v.positions.filter((p) => !old.some((o) => o.position_code === p)))
      await c.query(
        'INSERT INTO employee_positions(employee_id,position_code,effective_from) VALUES($1,$2,$3)',
        [e.id, p, localDate()],
      );
    await c.query(
      "INSERT INTO employment_events(employee_id,kind,business_date,actor_id,payload) VALUES($1,'PROFILE_UPDATED',$2,$3,$4)",
      [
        e.id,
        localDate(),
        a.id,
        JSON.stringify({
          positions: v.positions,
          phase: v.phase,
          employment_type: v.employment_type,
        }),
      ],
    );
    await employeeRevision(
      c,
      a,
      e.id,
      'PROFILE_UPDATED',
      basicSnapshot(
        e,
        old.map((p) => p.position_code),
      ),
      basicSnapshot(updated, v.positions),
    );
    return details(c, a, updated);
  });
  api('PUT', '/employees/:id/photo', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id, true);
    version(e, b.expected_version);
    need(!e.archived_at, 'Hồ sơ đã lưu trữ', 409, 'STATE');
    const id = z.uuid().nullable().parse(b.asset_id);
    if (id) {
      const asset = await one(
        c,
        "SELECT f.id,f.filename FROM assets f JOIN employee_documents d ON d.asset_id=f.id WHERE f.id=$1 AND f.employee_id=$2 AND d.employee_id=$2 AND d.document_kind='PHOTO' AND d.classification='BASIC'",
        [id, e.id],
      );
      need(
        asset && /\.(png|jpe?g|webp)$/i.test(asset.filename),
        'Chọn ảnh PNG/JPG/WebP đã tải vào tài liệu của nhân viên này',
        422,
        'PHOTO_INVALID',
      );
    }
    await c.query(
      "UPDATE employee_profiles SET contact=jsonb_set(contact,'{photo_asset_id}',$2::jsonb),version=version+1 WHERE id=$1",
      [e.id, JSON.stringify(id)],
    );
    const updated = await hrAccess(c, a, e.id);
    await employeeRevision(c, a, e.id, 'PHOTO_UPDATED', basicSnapshot(e), basicSnapshot(updated));
    return details(c, a, updated);
  });
  api('POST', '/employees/:id/leave', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id, true);
    version(e, b.expected_version);
    const v = z
      .object({
        left_on: z.iso.date(),
        reason: z.string().trim().min(1).max(1000),
        confirm_disable: z.literal(true),
      })
      .parse(b);
    need(
      !e.archived_at && e.employment_state !== 'CANDIDATE',
      'Hồ sơ không thể nghỉ việc',
      409,
      'STATE',
    );
    need(e.user_id !== a.id, 'Không tự khóa tài khoản đang thực hiện', 422, 'VALIDATION');
    if (e.user_id && !isAdmin(a))
      need(
        !(await actor(c, e.user_id)).grants.some(
          (g) => g.kind === 'ACCESS' && ['ADMIN', 'BOSS'].includes(g.role),
        ),
        'Chỉ Admin được xử lý nghỉ việc cho tài khoản quản trị',
        403,
        'FORBIDDEN',
      );
    if (v.left_on > localDate()) {
      need(!e.archived_at, 'Hồ sơ đã nghỉ', 409, 'STATE');
      await c.query('UPDATE employee_profiles SET left_on=$2,version=version+1 WHERE id=$1', [
        e.id,
        v.left_on,
      ]);
      await employeeRevision(
        c,
        a,
        e.id,
        'LEAVE_PLANNED',
        basicSnapshot(e),
        basicSnapshot({ ...e, left_on: v.left_on }),
      );
      return { ok: true, planned: true, account_disabled: false };
    }
    await c.query(
      "UPDATE employee_profiles SET employment_state='LEFT',left_on=$2,archived_at=now(),version=version+1 WHERE id=$1",
      [e.id, v.left_on],
    );
    if (e.user_id) {
      await c.query(
        'UPDATE users SET active=false,permission_version=permission_version+1 WHERE id=$1',
        [e.user_id],
      );
      await c.query('DELETE FROM sessions WHERE user_id=$1', [e.user_id]);
      await c.query(
        'UPDATE resource_grants SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [e.user_id],
      );
      await c.query('UPDATE grants SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [
        e.user_id,
      ]);
      const ids = await rows(
        c,
        "UPDATE account_grants SET revoked_at=now(),revoke_reason='Nhân viên nghỉ việc' WHERE user_id=$1 AND revoked_at IS NULL RETURNING account_id",
        [e.user_id],
      );
      for (const { account_id } of ids)
        await c.query(
          'UPDATE platform_accounts SET sharing_version=sharing_version+1 WHERE id=$1',
          [account_id],
        );
    }
    await c.query(
      "INSERT INTO employment_events(employee_id,kind,business_date,actor_id,payload) VALUES($1,'LEFT',$2,$3,$4)",
      [e.id, v.left_on, a.id, JSON.stringify({ reason: v.reason })],
    );
    if (e.user_id) {
      await c.query('DELETE FROM platform_viewers WHERE user_id=$1', [e.user_id]);
      await c.query('UPDATE account_viewer_overrides SET allowed=false WHERE user_id=$1', [
        e.user_id,
      ]);
    }
    await employeeRevision(
      c,
      a,
      e.id,
      'LEFT',
      basicSnapshot(e),
      basicSnapshot(await hrAccess(c, a, e.id)),
    );
    return { ok: true, handover_required: true };
  });
  api('GET', '/employees/:id/history', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id);
    const category = z.enum(['BASIC', 'PAYROLL', 'SENSITIVE']).default('BASIC').parse(q.category);
    if (category === 'SENSITIVE') need(await sensitiveAllowed(c, a, e));
    if (category === 'PAYROLL') need(payrollAllowed(a));
    const cursor = z.coerce.number().int().min(0).default(0).parse(q.cursor);
    const records = await rows(
      c,
      'SELECT r.*,u.name AS actor_name FROM employee_revisions r JOIN users u ON u.id=r.actor_id WHERE employee_id=$1 AND category=$2 ORDER BY r.id DESC LIMIT 31 OFFSET $3',
      [e.id, category, cursor],
    );
    return {
      items: records.slice(0, 30).map((r) => ({
        id: r.id,
        action: r.action,
        category: r.category,
        actor_id: r.actor_id,
        actor_name: r.actor_name,
        created_at: r.created_at,
        ...(category === 'BASIC'
          ? { before: r.before_data, after: r.after_data }
          : JSON.parse(decipher(r.encrypted_change))),
      })),
      next_cursor: records.length > 30 ? String(cursor + 30) : null,
    };
  });
  api('GET', '/employees/:id/handover', async (c, a, b, q, p) => {
    const e = await hrAccess(c, a, p.id);
    return {
      tasks: e.user_id
        ? await rows(
            c,
            "SELECT id,code,title,status FROM tasks WHERE owner_id=$1 AND status NOT IN ('DONE','CANCELLED','DECLINED') ORDER BY due_at",
            [e.user_id],
          )
        : [],
      note: 'Quản lý cần phân công bàn giao; hệ thống không tự giao việc hoặc thay mật khẩu bên ngoài.',
    };
  });
}
