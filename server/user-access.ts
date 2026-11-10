import { employeeRevision, basicSnapshot } from './employee-history.js';
import { hash as passwordHash } from 'argon2';
import { z } from 'zod';
import { grantRoles } from './role-bundles.js';
import type { API } from './app.js';
import {
  type DB,
  type Actor,
  one,
  rows,
  need,
  actor,
  isAdmin,
  manages,
  jobs,
  access,
  version,
} from './base.js';
const instant = z.iso.datetime({ offset: true });
const dates = { valid_from: instant.optional(), valid_to: instant.nullable().optional() };
export const grantSchema = z.object({
  kind: z.enum(['JOB', 'ACCESS']),
  role: z.string(),
  scope: z.enum(['SELF', 'TEAM', 'ALL']),
  team_id: z.uuid().nullable().default(null),
  ...dates,
  reason: z.string().trim().min(1).max(1000).default('Cấp quyền theo hồ sơ'),
});
export async function validateReporting(
  c: DB,
  userId: string,
  team: string | null,
  manager: string | null,
  reviewer: string | null,
) {
  for (const [label, id] of [
    ['Quản lý', manager],
    ['Người duyệt', reviewer],
  ])
    if (id) {
      need(id !== userId, 'Không tự làm người quản lý/người duyệt', 422, 'VALIDATION');
      const person = await actor(c, id);
      need(
        manages(person, { id: userId, team_id: team }),
        label + ' phải đang hoạt động và có quyền trong phạm vi phù hợp',
        422,
        'REVIEWER_SCOPE',
      );
    }
}
export async function addGrant(c: DB, a: Actor, uid: string, input: any) {
  const v = grantSchema.parse(input);
  need(
    (v.kind === 'JOB' ? jobs : access).includes(v.role),
    'Chỉ hỗ trợ ADMIN, BOSS, MARKETPLACE, HR và CONTENT',
    422,
    'RETIRED_ROLE',
  );
  need(
    v.scope === (v.kind === 'JOB' ? 'SELF' : 'ALL'),
    'Chuyên môn có phạm vi cá nhân; ADMIN/BOSS có phạm vi toàn công ty',
    422,
    'VALIDATION',
  );
  need(!v.team_id, 'Không cấp ROLE theo phạm vi nhóm', 422, 'VALIDATION');
  const start = v.valid_from || new Date().toISOString(),
    end = v.valid_to || null;
  need(
    !end || Date.parse(end) > Date.parse(start),
    'Ngày hết hạn phải sau ngày hiệu lực',
    422,
    'VALIDATION',
  );
  await actor(c, uid);
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [uid]);
  const duplicate = await one(
    c,
    `SELECT * FROM grants WHERE user_id=$1 AND kind=$2 AND role=$3 AND scope=$4 AND team_id IS NOT DISTINCT FROM $5::uuid AND revoked_at IS NULL AND valid_from<coalesce($7::timestamptz,'infinity') AND coalesce(valid_to,'infinity')>$6::timestamptz`,
    [uid, v.kind, v.role, v.scope, v.team_id, start, end],
  );
  need(!duplicate, 'Quyền đã có trong khoảng thời gian này', 409, 'GRANT_OVERLAP');
  const g = await one(
    c,
    'INSERT INTO grants(user_id,kind,role,scope,team_id,valid_from,valid_to,reason,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [uid, v.kind, v.role, v.scope, v.team_id, start, end, v.reason, a.id],
  );
  await c.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1', [uid]);
  return g;
}
const jobGrant = z.object({ role: z.string(), ...dates });
const accessGrant = grantSchema.omit({ kind: true });
export async function createUserWithAccess(c: DB, a: Actor, b: any) {
  need(isAdmin(a));
  const v = z
    .object({
      username: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z0-9_.-]{3,64}$/,
          'Tên đăng nhập cần 3–64 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang',
        ),
      email: z.email().nullable().optional(),
      name: z.string().trim().min(1).max(120),
      password: z
        .string()
        .max(1024)
        .refine((v) => Array.from(v).length >= 11, 'Mật khẩu cần ít nhất 11 ký tự'),
      team_id: z.uuid().nullable().default(null),
      manager_id: z.uuid().nullable().default(null),
      reviewer_id: z.uuid().nullable().default(null),
      employee_id: z.uuid().nullable().default(null),
      job_grants: z.array(jobGrant).min(1).max(20),
      access_grant: accessGrant.optional(),
    })
    .parse(b);
  need(
    new Set(v.job_grants.map((g) => g.role)).size === v.job_grants.length,
    'Chuyên môn bị trùng',
    422,
    'VALIDATION',
  );
  await validateReporting(c, '', v.team_id, v.manager_id, v.reviewer_id);
  let employee;
  if (v.employee_id) {
    employee = await one(c, 'SELECT * FROM employee_profiles WHERE id=$1 FOR UPDATE', [
      v.employee_id,
    ]);
    need(
      employee && !employee.user_id && !employee.archived_at,
      'Hồ sơ đã được liên kết hoặc lưu trữ',
      409,
      'EMPLOYEE_LINK_CONFLICT',
    );
  }
  const u = await one(
    c,
    'INSERT INTO users(username,email,name,password_hash,team_id,manager_id,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [
      v.username.toLowerCase(),
      v.email?.toLowerCase() || null,
      v.name,
      await passwordHash(v.password),
      v.team_id,
      v.manager_id,
      v.reviewer_id,
    ],
  );
  for (const g of v.job_grants) await addGrant(c, a, u.id, { ...g, kind: 'JOB', scope: 'SELF' });
  if (v.access_grant) await addGrant(c, a, u.id, { ...v.access_grant, kind: 'ACCESS' });
  if (employee) {
    await c.query('UPDATE employee_profiles SET user_id=$2,version=version+1 WHERE id=$1', [
      employee.id,
      u.id,
    ]);
    await employeeRevision(
      c,
      a,
      employee.id,
      'USER_LINKED',
      basicSnapshot(employee),
      basicSnapshot({ ...employee, user_id: u.id }),
    );
  }
  return { id: u.id, permissions: await actor(c, u.id) };
}
export function userAccessRoutes(api: API) {
  api('GET', '/user-access-options', async (c, a) => {
    need(isAdmin(a));
    const people = await rows(
      c,
      'SELECT id,name,username,team_id FROM users WHERE active ORDER BY name',
    );
    for (const p of people)
      p.scopes = (await actor(c, p.id)).grants
        .filter((g) => g.kind === 'ACCESS' && ['ADMIN', 'BOSS'].includes(g.role))
        .map((g) => ({ role: g.role, scope: g.scope, team_id: g.team_id }));
    return {
      people,
      employees: await rows(
        c,
        "SELECT id,name,employee_code,team_id,manager_id FROM employee_profiles WHERE user_id IS NULL AND archived_at IS NULL AND employment_state<>'CANDIDATE' ORDER BY name",
      ),
      teams: await rows(c, 'SELECT id,name FROM teams ORDER BY name'),
      jobs,
      access,
    };
  });
  api('POST', '/users/:id/grants', async (c, a, b, q, p) => {
    if (b.display_roles) return grantRoles(c, a, p.id, b);
    need(isAdmin(a));
    const u = await one(
      c,
      'SELECT permission_version AS version FROM users WHERE id=$1 FOR UPDATE',
      [p.id],
    );
    need(u, 'Không tìm thấy người dùng', 404, 'NOT_FOUND');
    version(u, b.expected_permission_version);
    const v = z
      .object({
        job_grants: z.array(jobGrant).default([]),
        access_grant: accessGrant.optional(),
        revoke_ids: z.array(z.uuid()).default([]),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(b);
    need(
      new Set(v.job_grants.map((g) => g.role)).size === v.job_grants.length,
      'Chuyên môn bị trùng',
      422,
      'VALIDATION',
    );
    for (const id of v.revoke_ids) {
      const g = await one(
        c,
        'UPDATE grants SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',
        [id, p.id],
      );
      need(g, 'Quyền không còn hiệu lực', 409, 'CONFLICT');
      await c.query('INSERT INTO grant_changes(grant_id,actor_id,reason) VALUES($1,$2,$3)', [
        id,
        a.id,
        v.reason,
      ]);
    }
    for (const g of v.job_grants)
      await addGrant(c, a, p.id, { ...g, kind: 'JOB', scope: 'SELF', reason: v.reason });
    if (v.access_grant)
      await addGrant(c, a, p.id, { ...v.access_grant, kind: 'ACCESS', reason: v.reason });
    await c.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1', [p.id]);
    return actor(c, p.id);
  });
}
