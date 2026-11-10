import { z } from 'zod';
import { hash as passwordHash } from 'argon2';
import { type API } from './app.js';
import { type DB, type Actor, need, one, rows, isAdmin, actor, version } from './base.js';
import { hrV2, specialistJobs, displayRoles } from './handoff-access.js';
import { addGrant } from './user-access.js';
import { employeeRevision, basicSnapshot } from './employee-history.js';

const roles = z
  .array(z.enum(['ADMIN', 'BOSS', ...specialistJobs]))
  .min(1)
  .max(5)
  .refine((v) => new Set(v).size === v.length);
const reason = z.string().trim().min(1).max(1000);
async function permit(c: DB, a: Actor, requested: string[], target?: string) {
  need(hrV2(a));
  if (!isAdmin(a)) {
    need(requested.every((r) => specialistJobs.includes(r as any)));
    if (target) {
      const u = await actor(c, target);
      need(!u.grants.some((g) => g.kind === 'ACCESS' && ['ADMIN', 'BOSS'].includes(g.role)));
    }
  }
}
async function bundle(c: DB, a: Actor, id: string, selected: string[], why: string) {
  for (const r of selected)
    await addGrant(c, a, id, {
      kind: ['ADMIN', 'BOSS'].includes(r) ? 'ACCESS' : 'JOB',
      role: r,
      scope: ['ADMIN', 'BOSS'].includes(r) ? 'ALL' : 'SELF',
      reason: why,
    });
  if (selected.some((r) => specialistJobs.includes(r as any))) {
    const existing = await one(
      c,
      "SELECT id FROM grants WHERE user_id=$1 AND kind='ACCESS' AND role='EMPLOYEE' AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())",
      [id],
    );
    if (!existing)
      await addGrant(c, a, id, { kind: 'ACCESS', role: 'EMPLOYEE', scope: 'SELF', reason: why });
  }
}
export async function provisionUser(c: DB, a: Actor, b: any) {
  // Check attempted privilege escalation before any insert or schema coercion.
  await permit(c, a, Array.isArray(b.display_roles) ? b.display_roles : []);
  const v = z
    .object({
      employee_id: z.uuid(),
      name: z.string().trim().min(1).max(150),
      username: z.string().regex(/^[A-Za-z0-9._-]{3,64}$/),
      initial_password: z.string().min(11).max(1024),
      display_roles: roles,
      reason,
    })
    .strict()
    .parse(b);
  const e = await one(c, 'SELECT * FROM employee_profiles WHERE id=$1 FOR UPDATE', [v.employee_id]);
  need(
    e && !e.user_id && !e.archived_at && e.employment_state !== 'LEFT',
    'Hồ sơ đã liên kết hoặc ngừng làm việc',
    409,
    'EMPLOYEE_LINK_CONFLICT',
  );
  const u = await one(
    c,
    'INSERT INTO users(username,name,password_hash,team_id) VALUES(lower($1),$2,$3,$4) RETURNING id,username,name',
    [v.username, v.name, await passwordHash(v.initial_password), e.team_id],
  );
  await bundle(c, a, u.id, v.display_roles, v.reason);
  await c.query(
    'INSERT INTO role_bundle_events(user_id,actor_id,before_roles,after_roles,reason) VALUES($1,$2,$3,$4,$5)',
    [u.id, a.id, '[]', JSON.stringify(v.display_roles), v.reason],
  );
  const after = await one(
    c,
    'UPDATE employee_profiles SET user_id=$2,version=version+1 WHERE id=$1 RETURNING *',
    [e.id, u.id],
  );
  await employeeRevision(c, a, e.id, 'USER_LINKED', basicSnapshot(e), basicSnapshot(after));
  return u;
}
export function roleBundleRoutes(api: API) {
  api('GET', '/role-users', async (c, a, b, q) => {
    need(hrV2(a));
    const input = z
      .object({ q: z.string().trim().max(255).default('') })
      .strict()
      .parse(q);
    const items = [];
    for (const u of await rows(
      c,
      `SELECT u.id,u.username,u.name,u.active,u.permission_version,e.id AS employee_id FROM users u LEFT JOIN employee_profiles e ON e.user_id=u.id WHERE ($1='' OR u.name ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR e.employee_code ILIKE '%'||$1||'%') ORDER BY u.active DESC,u.name,u.id LIMIT 100`,
      [input.q],
    )) {
      const grants = await rows(
        c,
        'SELECT * FROM grants WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())',
        [u.id],
      );
      const roles = displayRoles({ ...u, grants } as Actor);
      items.push({
        ...u,
        display_roles: roles,
        can_manage:
          isAdmin(a) ||
          !grants.some((g) => g.kind === 'ACCESS' && ['ADMIN', 'BOSS'].includes(g.role)),
      });
    }
    return { items };
  });
  api('POST', '/users/:id/disable', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = z.object({ expected_version: z.number().int(), reason }).strict().parse(b);
    need(p.id !== a.id, 'Không tự khóa tài khoản đang dùng', 422, 'VALIDATION');
    const u = await one(
      c,
      'SELECT *,permission_version AS version FROM users WHERE id=$1 FOR UPDATE',
      [p.id],
    );
    need(u, 'Không tìm thấy', 404, 'NOT_FOUND');
    version(u, v.expected_version);
    await c.query(
      'UPDATE users SET active=false,permission_version=permission_version+1 WHERE id=$1',
      [u.id],
    );
    await c.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    await c.query(
      'INSERT INTO role_bundle_events(user_id,actor_id,before_roles,after_roles,reason) VALUES($1,$2,$3,$4,$5)',
      [
        u.id,
        a.id,
        JSON.stringify({ active: u.active }),
        JSON.stringify({ active: false }),
        v.reason,
      ],
    );
    return { ok: true };
  });
  api('GET', '/staff-directory', async (c, a) => {
    need(
      hrV2(a) ||
        a.grants.some((g) => g.kind === 'JOB') ||
        a.grants.some((g) => g.kind === 'ACCESS' && g.role === 'BOSS'),
    );
    return {
      items: await rows(
        c,
        `SELECT id,name,team_id FROM users WHERE active ORDER BY name,id LIMIT 100`,
      ),
    };
  });
  api('POST', '/users/:id/reset-password', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = z
      .object({ new_password: z.string().min(11).max(1024), expected_version: z.number().int() })
      .strict()
      .parse(b);
    const u = await one(
      c,
      'SELECT id,permission_version AS version FROM users WHERE id=$1 FOR UPDATE',
      [p.id],
    );
    need(u, 'Không tìm thấy', 404, 'NOT_FOUND');
    version(u, v.expected_version);
    await c.query(
      'UPDATE users SET password_hash=$2,permission_version=permission_version+1 WHERE id=$1',
      [u.id, await passwordHash(v.new_password)],
    );
    await c.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    return { ok: true };
  });
}

export async function grantRoles(c: DB, a: Actor, id: string, b: any) {
  await permit(c, a, Array.isArray(b.display_roles) ? b.display_roles : [], id);
  const v = z
    .object({ display_roles: roles, reason, expected_version: z.number().int().positive() })
    .strict()
    .parse(b);
  const u = await one(
    c,
    'SELECT *,permission_version AS version FROM users WHERE id=$1 FOR UPDATE',
    [id],
  );
  need(u, 'Không tìm thấy', 404, 'NOT_FOUND');
  version(u, v.expected_version);
  need(
    await one(c, 'SELECT id FROM employee_profiles WHERE user_id=$1', [u.id]),
    'Cần liên kết hồ sơ nhân viên',
    422,
    'EMPLOYEE_REQUIRED',
  );
  const before = displayRoles(await actor(c, u.id));
  for (const removed of before.filter((r) => !v.display_roles.includes(r as any)))
    await c.query(
      'UPDATE grants SET revoked_at=now() WHERE user_id=$1 AND role=$2 AND revoked_at IS NULL',
      [u.id, removed],
    );
  for (const r of v.display_roles) {
    const existing = await one(
      c,
      "SELECT id FROM grants WHERE user_id=$1 AND role=$2 AND scope=CASE WHEN $2 IN ('ADMIN','BOSS') THEN 'ALL' ELSE 'SELF' END AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())",
      [u.id, r],
    );
    if (!existing) await bundle(c, a, u.id, [r], v.reason);
  }
  await c.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1', [u.id]);
  await c.query(
    'INSERT INTO role_bundle_events(user_id,actor_id,before_roles,after_roles,reason) VALUES($1,$2,$3,$4,$5)',
    [u.id, a.id, JSON.stringify(before), JSON.stringify(v.display_roles), v.reason],
  );
  return { ok: true };
}
