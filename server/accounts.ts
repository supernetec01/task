import { canViewAccount, effectiveViewers, viewerIds, sharingHistory } from './account-sharing.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { API } from './app.js';
import {
  type DB,
  type Actor,
  one,
  rows,
  need,
  isAdmin,
  hasJob,
  actor,
  version,
  cipher,
  decipher,
  Fault,
} from './base.js';
const unavailable = () =>
  new Fault(
    503,
    'CREDENTIAL_STORAGE_UNAVAILABLE',
    'Không thể sử dụng kho mật khẩu. Kiểm tra hoặc khôi phục khóa mã hóa cũ trên máy chủ.',
  );
function keyConfigured() {
  return /^[0-9a-f]{64}$/i.test(process.env.VAULT_KEY || '');
}
export function decryptCredential(value: string) {
  if (!keyConfigured()) throw unavailable();
  try {
    return decipher(value);
  } catch {
    throw unavailable();
  }
}
function encryptCredential(value: string) {
  if (!keyConfigured()) throw unavailable();
  try {
    return cipher(value);
  } catch {
    throw unavailable();
  }
}
export async function storageStatus(c: DB) {
  if (!keyConfigured()) return { configured: false, state: 'missing_key' };
  for (const row of await rows(c, 'SELECT ciphertext FROM credential_versions')) {
    try {
      decryptCredential(row.ciphertext);
    } catch {
      return { configured: true, state: 'decrypt_unavailable' };
    }
  }
  return { configured: true, state: 'ready' };
}
export async function accountAccess(c: DB, a: Actor, id: string, lock = false) {
  const r = await one(
    c,
    'SELECT a.*,p.name AS platform_name,p.enabled AS platform_enabled FROM platform_accounts a JOIN platforms p ON p.id=a.platform_id WHERE a.id=$1' +
      (lock ? ' FOR UPDATE OF a' : ''),
    [id],
  );
  need(r, 'Không tìm thấy tài khoản', 404, 'NOT_FOUND');
  if (!isAdmin(a)) {
    need(await canViewAccount(c, a.id, id), 'Không tìm thấy tài khoản', 404, 'NOT_FOUND');
  }
  return r;
}
async function dto(c: DB, a: Actor, r: any) {
  const admin = isAdmin(a);
  return {
    id: r.id,
    label: r.label,
    login: r.login,
    company: r.company,
    note: r.note,
    platform: { id: r.platform_id, name: r.platform_name, enabled: r.platform_enabled },
    version: r.version,
    sharing_version: r.sharing_version,
    inherit_platform_viewers: r.inherit_platform_viewers,
    updated_at: r.updated_at,
    has_password: !!r.current_credential_version_id,
    capabilities: {
      can_view: true,
      can_update_password: true,
      can_edit_metadata: admin,
      can_manage_viewers: admin,
      can_view_history: admin,
    },
    ...(admin
      ? {
          viewers: await effectiveViewers(c, r.id),
        }
      : {}),
  };
}
const metadata = z.object({
  platform_id: z.uuid(),
  label: z.string().trim().min(1).max(150),
  login: z.string().trim().min(1).max(255),
  note: z.string().max(1000).default(''),
});
const secretSchema = z
  .string()
  .min(1)
  .max(10000)
  .refine((v) => !!v.trim(), 'Mật khẩu không được chỉ có khoảng trắng');
async function viewers(c: DB, a: Actor, id: string, b: any) {
  const ids = await viewerIds(c, b.viewer_ids || []);
  const before = await effectiveViewers(c, id);
  const r = await one(c, 'SELECT platform_id FROM platform_accounts WHERE id=$1', [id]);
  const inherited = await rows(c, 'SELECT user_id FROM platform_viewers WHERE platform_id=$1', [
    r.platform_id,
  ]);
  // An explicit account selection can deny inherited viewers as well as add individuals.
  await c.query('DELETE FROM account_viewer_overrides WHERE account_id=$1', [id]);
  for (const uid of new Set([...ids, ...inherited.map((g) => g.user_id)]))
    await c.query(
      'INSERT INTO account_viewer_overrides(account_id,user_id,allowed,granted_by) VALUES($1,$2,$3,$4)',
      [id, uid, ids.includes(uid), a.id],
    );
  await c.query(
    'UPDATE platform_accounts SET sharing_version=sharing_version+1,inherit_platform_viewers=false WHERE id=$1',
    [id],
  );
  await sharingHistory(c, a, 'ACCOUNT', id, before, await effectiveViewers(c, id));
}

async function addCredential(c: DB, a: Actor, r: any, secret: string, note: string) {
  const previous = r.current_credential_version_id
    ? await one(c, 'SELECT * FROM credential_versions WHERE id=$1 AND account_id=$2', [
        r.current_credential_version_id,
        r.id,
      ])
    : null;
  if (previous && decryptCredential(previous.ciphertext) === secret)
    return { changed: false, account_version: r.version };
  const n = (previous?.revision || 0) + 1;
  const v = await one(
    c,
    'INSERT INTO credential_versions(account_id,ciphertext,actor_id,note,revision,previous_version_id,metadata_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at,revision',
    [
      r.id,
      encryptCredential(secret),
      a.id,
      note,
      n,
      previous?.id || null,
      JSON.stringify({
        label: r.label,
        login: r.login,
        platform_name: r.platform_name,
        company: r.company,
      }),
    ],
  );
  await c.query(
    'UPDATE platform_accounts SET current_credential_version_id=$2,version=version+1,updated_at=now() WHERE id=$1',
    [r.id, v.id],
  );
  return { ...v, changed: true, account_version: r.version + 1 };
}
function pagination(q: any) {
  return {
    limit: Math.min(100, Math.max(1, Number(q.limit) || 30)),
    offset: Math.max(0, Number(q.cursor) || 0),
  };
}
export function accountRoutes(api: API) {
  api('GET', '/settings/credential-storage-status', async (c, a) => {
    need(isAdmin(a));
    return storageStatus(c);
  });
  api('GET', '/platforms', async (c, a) => {
    const all = await rows(
      c,
      'SELECT id,name,enabled,version,sort_order,sharing_version FROM platforms ORDER BY sort_order,name',
    );
    if (isAdmin(a)) return { items: all };
    const allowed = new Set<string>();
    for (const r of await rows(c, 'SELECT id,platform_id FROM platform_accounts'))
      if (
        await accountAccess(c, a, r.id)
          .then(() => true)
          .catch(() => false)
      )
        allowed.add(r.platform_id);
    return { items: all.filter((r) => allowed.has(r.id)) };
  });
  api('GET', '/platforms/:id/viewers', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const platform = await one(c, 'SELECT id,name,sharing_version FROM platforms WHERE id=$1', [
      p.id,
    ]);
    need(platform, 'Không tìm thấy nền tảng', 404, 'NOT_FOUND');
    return {
      ...platform,
      items: await rows(
        c,
        'SELECT u.id AS user_id,u.name,u.username FROM platform_viewers v JOIN users u ON u.id=v.user_id AND u.active WHERE v.platform_id=$1 ORDER BY u.name',
        [p.id],
      ),
    };
  });
  api('PUT', '/platforms/:id/viewers', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const platform = await one(c, 'SELECT * FROM platforms WHERE id=$1 FOR UPDATE', [p.id]);
    need(platform, 'Không tìm thấy nền tảng', 404, 'NOT_FOUND');
    version({ version: platform.sharing_version }, b.expected_sharing_version);
    const ids = await viewerIds(c, b.viewer_ids || []);
    const before = await rows(c, 'SELECT user_id FROM platform_viewers WHERE platform_id=$1', [
      p.id,
    ]);
    await c.query('DELETE FROM platform_viewers WHERE platform_id=$1', [p.id]);
    for (const uid of ids)
      await c.query(
        'INSERT INTO platform_viewers(platform_id,user_id,granted_by) VALUES($1,$2,$3)',
        [p.id, uid, a.id],
      );
    await c.query('UPDATE platforms SET sharing_version=sharing_version+1 WHERE id=$1', [p.id]);
    await c.query(
      'UPDATE platform_accounts SET sharing_version=sharing_version+1 WHERE platform_id=$1',
      [p.id],
    );
    await sharingHistory(c, a, 'PLATFORM', p.id, before, ids);
    return { ok: true };
  });
  api('GET', '/account-sharing-history', async (c, a, b, q) => {
    need(isAdmin(a));
    return {
      items: await rows(
        c,
        `SELECT h.*,u.name AS actor_name FROM account_sharing_history h JOIN users u ON u.id=h.actor_id WHERE ($1='' OR h.object_id::text=$1) ORDER BY h.id DESC LIMIT 100`,
        [q.object_id || ''],
      ),
    };
  });
  api('POST', '/platforms', async (c, a, b) => {
    need(isAdmin(a));
    const name = z.string().trim().min(1).max(80).parse(b.name);
    return one(
      c,
      'INSERT INTO platforms(code,name,normalized_name) VALUES($1,$2,$3) RETURNING id,name,version,enabled,sort_order',
      ['P_' + randomUUID().replaceAll('-', ''), name, name.toLocaleLowerCase()],
    );
  });
  api('PATCH', '/platforms/:id', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = z
      .object({
        name: z.string().trim().min(1).max(80),
        enabled: z.boolean(),
        sort_order: z.number().int().min(0).max(10000),
        expected_version: z.number().int(),
      })
      .parse(b);
    const old = await one(c, 'SELECT * FROM platforms WHERE id=$1 FOR UPDATE', [p.id]);
    need(old, 'Không tìm thấy nền tảng', 404, 'NOT_FOUND');
    version(old, v.expected_version);
    return one(
      c,
      'UPDATE platforms SET name=$2,normalized_name=$3,enabled=$4,sort_order=$5,version=version+1 WHERE id=$1 RETURNING id,name,version,enabled,sort_order',
      [p.id, v.name, v.name.toLocaleLowerCase(), v.enabled, v.sort_order],
    );
  });
  api('GET', '/platform-accounts', async (c, a, b, q) => {
    const { limit, offset } = pagination(q);
    const data = await rows(
      c,
      `SELECT a.*,p.name AS platform_name,p.enabled AS platform_enabled FROM platform_accounts a JOIN platforms p ON p.id=a.platform_id WHERE ($1='' OR a.platform_id::text=$1) AND (a.label ILIKE $2 OR a.login ILIKE $2) ORDER BY ${q.sort === 'name' ? 'a.label,a.id' : q.sort === 'platform' ? 'p.name,a.label,a.id' : 'a.updated_at DESC,a.id'}`,
      [q.platform_id || '', '%' + String(q.search || '').slice(0, 150) + '%'],
    );
    if (q.viewer_id) need(isAdmin(a));
    const filterViewer = q.viewer_id ? z.uuid().parse(q.viewer_id) : null;
    const visible = [];
    for (const r of data)
      if (
        await accountAccess(c, a, r.id)
          .then(() => true)
          .catch(() => false)
      )
        if (!filterViewer || (await canViewAccount(c, filterViewer, r.id))) visible.push(r);
    const items = [];
    for (const r of visible.slice(offset, offset + limit)) items.push(await dto(c, a, r));
    return {
      items,
      next_cursor: visible.length > offset + limit ? String(offset + limit) : null,
      total: visible.length,
    };
  });
  api('GET', '/platform-accounts/:id', async (c, a, b, q, p) =>
    dto(c, a, await accountAccess(c, a, p.id)),
  );
  api('POST', '/platform-accounts', async (c, a, b) => {
    need(isAdmin(a));
    const v = metadata
      .extend({ secret: secretSchema, company: z.string().trim().min(1).max(150) })
      .parse(b);
    const platform = await one(c, 'SELECT * FROM platforms WHERE id=$1 AND enabled FOR SHARE', [
      v.platform_id,
    ]);
    need(platform, 'Nền tảng chưa được bật', 422, 'VALIDATION');
    need(
      (await storageStatus(c)).state === 'ready',
      unavailable().message,
      503,
      'CREDENTIAL_STORAGE_UNAVAILABLE',
    );
    let r = await one(
      c,
      'INSERT INTO platform_accounts(platform,platform_id,label,login,company,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [platform.name, platform.id, v.label, v.login, v.company, v.note],
    );
    await addCredential(
      c,
      a,
      { ...r, platform_name: platform.name },
      v.secret,
      'Lưu mật khẩu lần đầu',
    );
    if (b.viewer_ids !== undefined) await viewers(c, a, r.id, b);
    return dto(c, a, await accountAccess(c, a, r.id));
  });
  api('PATCH', '/platform-accounts/:id', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const r = await accountAccess(c, a, p.id, true);
    version(r, b.expected_version);
    const v = metadata.parse(b);
    const platform = await one(c, 'SELECT * FROM platforms WHERE id=$1', [v.platform_id]);
    need(
      platform && (platform.enabled || platform.id === r.platform_id),
      'Nền tảng chưa được bật',
      422,
      'VALIDATION',
    );
    await c.query(
      'UPDATE platform_accounts SET platform_id=$2,platform=$3,label=$4,login=$5,note=$6,version=version+1,updated_at=now() WHERE id=$1',
      [r.id, v.platform_id, platform.name, v.label, v.login, v.note],
    );
    return dto(c, a, await accountAccess(c, a, r.id));
  });
  api('PUT', '/platform-accounts/:id/viewers', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const r = await accountAccess(c, a, p.id, true);
    version({ version: r.sharing_version }, b.expected_sharing_version);
    await viewers(c, a, r.id, b);
    return dto(c, a, await accountAccess(c, a, r.id));
  });
  api('DELETE', '/platform-accounts/:id/viewers', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const r = await accountAccess(c, a, p.id, true);
    version({ version: r.sharing_version }, b.expected_sharing_version);
    const before = await effectiveViewers(c, r.id);
    await c.query('DELETE FROM account_viewer_overrides WHERE account_id=$1', [r.id]);
    await c.query(
      'UPDATE platform_accounts SET sharing_version=sharing_version+1,inherit_platform_viewers=true WHERE id=$1',
      [r.id],
    );
    await sharingHistory(c, a, 'ACCOUNT_INHERIT', r.id, before, await effectiveViewers(c, r.id));
    return dto(c, a, await accountAccess(c, a, r.id));
  });
  // Compatibility single-grant endpoints keep the role binding and expiry rules.
  api('POST', '/platform-accounts/:id/grants', async (c, a, b, q, p) => {
    need(isAdmin(a));
    await accountAccess(c, a, p.id, true);
    const v = z
      .object({
        user_id: z.uuid(),
        role: z.string(),
        valid_to: z.iso.datetime({ offset: true }).nullable(),
      })
      .parse(b);
    need(
      hasJob(await actor(c, v.user_id), v.role),
      'Người nhận cần role đang hiệu lực',
      422,
      'VALIDATION',
    );
    await c.query(
      'INSERT INTO account_viewer_overrides(account_id,user_id,allowed,valid_to,granted_by) VALUES($1,$2,true,$3,$4) ON CONFLICT(account_id,user_id) DO UPDATE SET allowed=true,valid_to=EXCLUDED.valid_to,granted_by=EXCLUDED.granted_by',
      [p.id, v.user_id, v.valid_to, a.id],
    );
    const g = await one(
      c,
      'INSERT INTO account_grants(account_id,user_id,role,valid_to,granted_by,granted_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(account_id,user_id,role) DO UPDATE SET revoked_at=NULL,valid_to=EXCLUDED.valid_to RETURNING *',
      [p.id, v.user_id, v.role, v.valid_to, a.id],
    );
    await c.query('UPDATE platform_accounts SET sharing_version=sharing_version+1 WHERE id=$1', [
      p.id,
    ]);
    return g;
  });
  api('POST', '/account-grants/:id/revoke', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const g = await one(c, 'SELECT * FROM account_grants WHERE id=$1', [p.id]);
    need(g, 'Không tìm thấy quyền', 404, 'NOT_FOUND');
    await accountAccess(c, a, g.account_id, true);
    await c.query(
      'INSERT INTO account_viewer_overrides(account_id,user_id,allowed,granted_by) VALUES($1,$2,false,$3) ON CONFLICT(account_id,user_id) DO UPDATE SET allowed=false',
      [g.account_id, g.user_id, a.id],
    );
    await c.query(
      "UPDATE account_grants SET revoked_at=now(),revoke_reason='Thu hồi quyền' WHERE id=$1",
      [p.id],
    );
    await c.query('UPDATE platform_accounts SET sharing_version=sharing_version+1 WHERE id=$1', [
      g.account_id,
    ]);
    return { ok: true };
  });
  api('POST', '/platform-accounts/:id/versions', async (c, a, b, q, p) => {
    const r = await accountAccess(c, a, p.id, true);
    version(r, b.expected_version);
    const v = z.object({ secret: secretSchema, note: z.string().max(1000).default('') }).parse(b);
    return addCredential(c, a, r, v.secret, v.note);
  });
  api('POST', '/platform-accounts/:id/reveal', async (c, a, b, q, p) => {
    const r = await accountAccess(c, a, p.id);
    const cv = await one(c, 'SELECT * FROM credential_versions WHERE id=$1 AND account_id=$2', [
      r.current_credential_version_id,
      r.id,
    ]);
    need(cv, 'Chưa lưu mật khẩu', 404, 'NOT_FOUND');
    return {
      secret: decryptCredential(cv.ciphertext),
      credential_version_id: cv.id,
      account_version: r.version,
    };
  });
  api('GET', '/credential-history', async (c, a, b, q) => {
    need(isAdmin(a));
    const { limit, offset } = pagination(q);
    const date = z.iso.date().optional();
    const from = date.parse(q.from || undefined),
      to = date.parse(q.to || undefined);
    const list = await rows(
      c,
      `SELECT v.id,v.revision,v.actor_id,u.name AS actor_name,v.created_at,v.note,v.metadata_snapshot AS account_snapshot,(v.previous_version_id IS NOT NULL) AS has_previous FROM credential_versions v JOIN platform_accounts a ON a.id=v.account_id LEFT JOIN users u ON u.id=v.actor_id WHERE ($1='' OR a.platform_id::text=$1) AND ($2='' OR a.id::text=$2) AND ($3='' OR v.actor_id::text=$3) AND ($4::date IS NULL OR v.created_at>=$4::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND ($5::date IS NULL OR v.created_at<($5::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') ORDER BY v.created_at DESC,v.id DESC LIMIT $6 OFFSET $7`,
      [
        q.platform_id || '',
        q.account_id || '',
        q.actor_id || '',
        from || null,
        to || null,
        limit + 1,
        offset,
      ],
    );
    return {
      items: list.slice(0, limit),
      next_cursor: list.length > limit ? String(offset + limit) : null,
    };
  });
  api('GET', '/credential-history/:id', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const r = await one(
      c,
      'SELECT v.id,v.revision,v.metadata_snapshot AS account_snapshot,v.note,v.created_at,v.actor_id,u.name AS actor_name,(v.previous_version_id IS NOT NULL) AS has_previous FROM credential_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE v.id=$1',
      [p.id],
    );
    need(r, 'Không tìm thấy lịch sử', 404, 'NOT_FOUND');
    return r;
  });
  api('POST', '/credential-history/:id/reveal', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const which = z.enum(['before', 'after']).parse(b.which);
    const v = await one(c, 'SELECT * FROM credential_versions WHERE id=$1', [p.id]);
    need(v, 'Không tìm thấy', 404, 'NOT_FOUND');
    const target =
      which === 'after'
        ? v
        : await one(c, 'SELECT * FROM credential_versions WHERE id=$1 AND account_id=$2', [
            v.previous_version_id,
            v.account_id,
          ]);
    need(target, 'Bản lưu đầu tiên không có mật khẩu trước', 404, 'NOT_FOUND');
    return { secret: decryptCredential(target.ciphertext) };
  });
  api('GET', '/platform-accounts/:id/history', async (c, a, b, q, p) => {
    need(isAdmin(a));
    await accountAccess(c, a, p.id);
    return {
      items: await rows(
        c,
        'SELECT id,actor_id,note,created_at,revision,metadata_snapshot FROM credential_versions WHERE account_id=$1 ORDER BY revision DESC',
        [p.id],
      ),
    };
  });
  api('POST', '/credential-versions/:id/reveal', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = await one(c, 'SELECT * FROM credential_versions WHERE id=$1', [p.id]);
    need(v, 'Không tìm thấy', 404, 'NOT_FOUND');
    return { secret: decryptCredential(v.ciphertext) };
  });
}
