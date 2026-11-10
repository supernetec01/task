import { z } from 'zod';
import { type Actor, type DB, hasJob, isAdmin, need, rows, one, version } from './base.js';
import type { API } from './app.js';

export const specialistJobs = ['MARKETPLACE', 'HR', 'CONTENT'] as const;
export const isBoss = (a: Actor) =>
  a.grants.some((g) => g.kind === 'ACCESS' && g.role === 'BOSS' && g.scope === 'ALL');
export const teamWork = (a: Actor) => isAdmin(a) || isBoss(a);
export const hrV2 = (a: Actor) => isAdmin(a) || hasJob(a, 'HR');
export function displayRoles(a: Actor) {
  return [
    ...(isAdmin(a) ? ['ADMIN'] : []),
    ...(isBoss(a) ? ['BOSS'] : []),
    ...specialistJobs.filter((j) => hasJob(a, j)),
  ];
}
export async function resourceAccess(c: DB, a: Actor, id: string, write = false) {
  const r = await one(
    c,
    `SELECT r.*,p.code AS platform,p.enabled AS platform_active,co.active AS company_active FROM business_resources r JOIN platforms p ON p.id=r.platform_id JOIN companies co ON co.id=r.company_id WHERE r.id=$1 ${write ? 'FOR SHARE OF r' : ''}`,
    [id],
  );
  need(r, 'Không tìm thấy nguồn', 404, 'NOT_FOUND');
  const role = r.kind === 'SHOP' ? 'MARKETPLACE' : 'CONTENT';
  const grant = await one(
    c,
    `SELECT id FROM resource_grants WHERE resource_id=$1 AND user_id=$2 AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now()) AND ($3=false OR permission='WRITE')`,
    [id, a.id, write],
  );
  need(
    isAdmin(a) || (hasJob(a, role) && grant),
    'Không có quyền nguồn này',
    write ? 403 : 404,
    write ? 'FORBIDDEN' : 'NOT_FOUND',
  );
  if (write)
    need(
      r.active && r.platform_active && r.company_active,
      'Nguồn đã ngừng hoạt động',
      409,
      'RESOURCE_DISABLED',
    );
  return r;
}
export function resourceRoutes(api: API) {
  api('GET', '/companies', async (c, a) => ({
    items: await rows(
      c,
      `SELECT DISTINCT co.* FROM companies co LEFT JOIN business_resources r ON r.company_id=co.id LEFT JOIN resource_grants g ON g.resource_id=r.id AND g.user_id=$1 AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now()) WHERE $2 OR (g.id IS NOT NULL AND (($3 AND r.kind='SHOP') OR ($4 AND r.kind='CHANNEL'))) ORDER BY co.name LIMIT 100`,
      [a.id, isAdmin(a), hasJob(a, 'MARKETPLACE'), hasJob(a, 'CONTENT')],
    ),
  }));
  api('POST', '/companies', async (c, a, b) => {
    need(isAdmin(a));
    const v = z
      .object({ code: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(200) })
      .strict()
      .parse(b);
    return one(c, 'INSERT INTO companies(code,name,created_by) VALUES($1,$2,$3) RETURNING *', [
      v.code,
      v.name,
      a.id,
    ]);
  });
  api('GET', '/resources', async (c, a) => {
    const items = [];
    for (const r of await rows(c, 'SELECT id FROM business_resources ORDER BY label,id')) {
      try {
        items.push(await resourceAccess(c, a, r.id));
      } catch (e: any) {
        if (e.code !== 'NOT_FOUND') throw e;
      }
    }
    return { items: items.slice(0, 100) };
  });
  api('POST', '/resources', async (c, a, b) => {
    need(isAdmin(a));
    const v = z
      .object({
        company_id: z.uuid(),
        platform_id: z.uuid(),
        kind: z.enum(['SHOP', 'CHANNEL']),
        label: z.string().trim().min(1).max(200),
        external_id: z.string().trim().min(1).max(200).nullable().default(null),
      })
      .strict()
      .parse(b);
    return one(
      c,
      'INSERT INTO business_resources(company_id,platform_id,kind,label,external_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [v.company_id, v.platform_id, v.kind, v.label, v.external_id, a.id],
    );
  });
  api('PUT', '/resources/:id/grants', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = z
      .object({
        user_ids: z.array(z.uuid()).max(100),
        permission: z.enum(['READ', 'WRITE']),
        reason: z.string().trim().min(1).max(1000),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    const r = await one(c, 'SELECT * FROM business_resources WHERE id=$1 FOR UPDATE', [p.id]);
    need(r, 'Không tìm thấy nguồn', 404, 'NOT_FOUND');
    version(r, v.expected_version);
    const old = await rows(
      c,
      'UPDATE resource_grants SET revoked_at=now() WHERE resource_id=$1 AND revoked_at IS NULL RETURNING user_id',
      [r.id],
    );
    for (const uid of [...new Set(v.user_ids)])
      await c.query(
        'INSERT INTO resource_grants(resource_id,user_id,permission,valid_from,granted_by,reason) VALUES($1,$2,$3,now(),$4,$5)',
        [r.id, uid, v.permission, a.id, v.reason],
      );
    await c.query(
      'UPDATE users SET permission_version=permission_version+1 WHERE id=ANY($1::uuid[])',
      [[...new Set([...v.user_ids, ...old.map((x) => x.user_id)])]],
    );
    return one(c, 'UPDATE business_resources SET version=version+1 WHERE id=$1 RETURNING *', [
      r.id,
    ]);
  });
  api('GET', '/role-mappings', async (c, a) => {
    need(isAdmin(a));
    return {
      items: await rows(
        c,
        `SELECT m.*,u.name,g.kind,g.role,g.scope FROM handoff_role_mappings m JOIN users u ON u.id=m.user_id JOIN grants g ON g.id=m.grant_id WHERE m.resolved_at IS NULL ORDER BY u.name LIMIT 100`,
      ),
    };
  });
}
