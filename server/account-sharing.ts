import { type DB, type Actor, rows, one, need } from './base.js';
import { z } from 'zod';
export async function canViewAccount(c: DB, user: string, account: string) {
  return !!(await one(
    c,
    `SELECT 1 FROM platform_accounts a JOIN users u ON u.id=$1 AND u.active
    LEFT JOIN account_viewer_overrides o ON o.account_id=a.id AND o.user_id=u.id
    WHERE a.id=$2 AND CASE WHEN o.user_id IS NOT NULL THEN o.allowed AND (o.valid_to IS NULL OR o.valid_to>now())
      ELSE a.inherit_platform_viewers AND EXISTS(SELECT 1 FROM platform_viewers p WHERE p.platform_id=a.platform_id AND p.user_id=u.id) END`,
    [user, account],
  ));
}
export async function effectiveViewers(c: DB, account: string) {
  return rows(
    c,
    `SELECT u.id AS user_id,u.name,u.username,o.valid_to,
    CASE WHEN o.user_id IS NULL THEN 'PLATFORM' ELSE 'ACCOUNT' END AS source
    FROM platform_accounts a CROSS JOIN users u
    LEFT JOIN account_viewer_overrides o ON o.account_id=a.id AND o.user_id=u.id
    WHERE a.id=$1 AND u.active AND CASE WHEN o.user_id IS NOT NULL THEN o.allowed AND (o.valid_to IS NULL OR o.valid_to>now())
      ELSE a.inherit_platform_viewers AND EXISTS(SELECT 1 FROM platform_viewers p WHERE p.platform_id=a.platform_id AND p.user_id=u.id) END ORDER BY u.name,u.id`,
    [account],
  );
}
export async function viewerIds(c: DB, input: unknown) {
  const ids = z.array(z.uuid()).max(1000).parse(input);
  need(new Set(ids).size === ids.length, 'Người xem bị trùng', 422, 'VALIDATION');
  const active = await rows(c, 'SELECT id FROM users WHERE id=ANY($1::uuid[]) AND active', [ids]);
  need(
    active.length === ids.length,
    'Người xem phải có tài khoản đang hoạt động',
    422,
    'VIEWER_INVALID',
  );
  return ids;
}
export async function sharingHistory(
  c: DB,
  a: Actor,
  type: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  await c.query(
    'INSERT INTO account_sharing_history(actor_id,object_type,object_id,before_viewers,after_viewers) VALUES($1,$2,$3,$4,$5)',
    [a.id, type, id, JSON.stringify(before), JSON.stringify(after)],
  );
}
