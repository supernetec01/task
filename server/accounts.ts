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
    const g = await rows(
      c,
      'SELECT role FROM account_grants WHERE account_id=$1 AND user_id=$2 AND revoked_at IS NULL AND (valid_to IS NULL OR valid_to>now())',
      [id, a.id],
    );
    need(
      g.some((g) => hasJob(a, g.role)),
      'Không tìm thấy tài khoản',
      404,
      'NOT_FOUND',
    );
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
          viewers: await rows(
            c,
            `SELECT g.user_id,u.name,g.role,g.valid_to,g.revoked_at FROM account_grants g JOIN users u ON u.id=g.user_id WHERE g.account_id=$1 ORDER BY u.name,g.role`,
            [r.id],
          ),
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
  const ids = z
    .array(z.uuid())
    .max(500)
    .parse(b.viewer_ids || []);
  need(new Set(ids).size === ids.length, 'Người xem bị trùng', 422, 'VALIDATION');
  const desired: { user: string; role: string; until: string | null }[] = [];
  const old = await rows(
    c,
    'SELECT * FROM account_grants WHERE account_id=$1 AND revoked_at IS NULL',
    [id],
  );
  for (const uid of ids) {
    need(
      await one(c, 'SELECT id FROM users WHERE id=$1 AND active', [uid]),
      'Người xem phải là tài khoản đang hoạt động',
      422,
      'VIEWER_INVALID',
    );
    const u = await actor(c, uid);
    const jobs = [
      ...new Set(u.grants.filter((g) => g.kind === 'JOB').map((g) => g.role)),
    ] as string[];
    need(jobs.length, 'Người xem cần chuyên môn đang hiệu lực', 422, 'VALIDATION');
    const requested = b.viewer_roles?.[uid];
    const previous = old.filter((g) => g.user_id === uid);
    if (requested) {
      const roles = z.array(z.string()).min(1).parse(requested);
      need(
        roles.every((r) => jobs.includes(r)) && new Set(roles).size === roles.length,
        'Chuyên môn chia sẻ không hợp lệ',
        422,
        'VALIDATION',
      );
      for (const role of roles)
        desired.push({
          user: uid,
          role,
          until: previous.find((g) => g.role === role)?.valid_to || null,
        });
    } else if (previous.length) {
      for (const g of previous) desired.push({ user: uid, role: g.role, until: g.valid_to });
    } else {
      need(
        jobs.length === 1,
        'Chọn chuyên môn áp dụng cho người có nhiều vai trò',
        422,
        'SHARING_ROLE_REQUIRED',
      );
      desired.push({ user: uid, role: jobs[0], until: null });
    }
  }
  await c.query(
    "UPDATE account_grants SET revoked_at=now(),revoke_reason='Điều chỉnh danh sách người xem' WHERE account_id=$1 AND revoked_at IS NULL",
    [id],
  );
  for (const g of desired)
    await c.query(
      'INSERT INTO account_grants(account_id,user_id,role,valid_to,granted_by,granted_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(account_id,user_id,role) DO UPDATE SET revoked_at=NULL,valid_to=EXCLUDED.valid_to,granted_by=coalesce(account_grants.granted_by,EXCLUDED.granted_by),granted_at=coalesce(account_grants.granted_at,EXCLUDED.granted_at),revoke_reason=NULL',
      [id, g.user, g.role, g.until, a.id],
    );
  await c.query('UPDATE platform_accounts SET sharing_version=sharing_version+1 WHERE id=$1', [id]);
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
      'SELECT id,name,enabled,version,sort_order FROM platforms ORDER BY sort_order,name',
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
    const visible = [];
    for (const r of data)
      if (
        await accountAccess(c, a, r.id)
          .then(() => true)
          .catch(() => false)
      )
        visible.push(r);
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
    await viewers(c, a, r.id, b);
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
