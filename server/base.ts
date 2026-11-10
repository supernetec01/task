import 'dotenv/config';
import pg from 'pg';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
  connectionString:
    process.argv[2] === 'migrate'
      ? process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
      : process.env.DATABASE_URL,
  max: 12,
  connectionTimeoutMillis: 10000,
});
export type DB = pg.PoolClient;
export type Actor = {
  id: string;
  name: string;
  username: string;
  permission_version: number;
  email: string | null;
  team_id: string | null;
  grants: any[];
  csrf: string;
};
export class Fault extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: unknown,
  ) {
    super(message);
  }
}
export function need(
  ok: unknown,
  message = 'Không có quyền thực hiện thao tác này',
  status = 403,
  code = 'FORBIDDEN',
): asserts ok {
  if (!ok) throw new Fault(status, code, message);
}
export const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
export const dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });
export const jobs = ['CONTENT', 'MARKETPLACE', 'HR'];
export const access = ['BOSS', 'ADMIN'];
export async function tx<T>(fn: (c: DB) => Promise<T>, isolation = 'READ COMMITTED'): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL ' + isolation);
    const v = await fn(c);
    await c.query('COMMIT');
    return v;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export const rows = async (c: DB, sql: string, args: unknown[] = []) =>
  (await c.query(sql, args)).rows;
export const one = async (c: DB, sql: string, args: unknown[] = []) =>
  (await rows(c, sql, args))[0];
export async function actor(c: DB, id: string): Promise<Actor> {
  const u = await one(
    c,
    'SELECT id,username,name,email,team_id,permission_version FROM users WHERE id=$1 AND active',
    [id],
  );
  need(u, 'Tài khoản đã bị vô hiệu hóa', 401, 'UNAUTHORIZED');
  u.grants = await rows(
    c,
    "SELECT * FROM grants WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp()) AND ((kind='JOB' AND role IN ('CONTENT','MARKETPLACE','HR') AND scope='SELF') OR (kind='ACCESS' AND role IN ('ADMIN','BOSS') AND scope='ALL'))",
    [id],
  );
  return u;
}
export const isAdmin = (a: Actor) =>
  a.grants.some((g) => g.kind === 'ACCESS' && g.role === 'ADMIN' && g.scope === 'ALL');
export const hasJob = (a: Actor, role: string) =>
  jobs.includes(role) &&
  a.grants.some((g) => g.kind === 'JOB' && g.role === role && g.scope === 'SELF');
export const manages = (a: Actor, _u: { id: string; team_id: string | null }) => management(a);
export const management = (a: Actor) =>
  isAdmin(a) || a.grants.some((g) => g.kind === 'ACCESS' && g.role === 'BOSS' && g.scope === 'ALL');
export const moduleRole: Record<string, string[]> = {
  content: ['CONTENT'],
  business: ['MARKETPLACE'],
  hr: ['HR'],
  resources: ['CONTENT'],
};
export function moduleAllowed(a: Actor, m: string) {
  return isAdmin(a) || (moduleRole[m] || []).some((r) => hasJob(a, r));
}
export async function scopeUser(c: DB, a: Actor, id: string) {
  const u = await one(c, 'SELECT id,team_id FROM users WHERE id=$1', [id]);
  need(u && (id === a.id || manages(a, u)));
  return u;
}
export const version = (v: any, expected: any) => {
  if (!Number.isInteger(expected) || v.version !== expected)
    throw Object.assign(
      new Fault(409, 'VERSION_CONFLICT', 'Dữ liệu vừa thay đổi. Giữ nội dung và tải lại bản mới.'),
      { current_version: v.version },
    );
};
export const setting = async (c: DB, k: string) =>
  (await one(c, 'SELECT value FROM settings WHERE key=$1', [k]))?.value || {};
export async function audit(
  c: DB,
  a: Actor | null,
  action: string,
  type: string,
  id: string,
  detail: unknown = {},
) {
  // Generic usage collection retired by the 07/11 product decision. Keep the
  // compatibility helper while callers migrate; business histories use their own tables.
  return;
}
export async function notify(
  c: DB,
  user: string,
  key: string,
  message: string,
  object: string | null = null,
) {
  await c.query(
    'INSERT INTO outbox(user_id,event_key,message,object_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [user, key, message, object],
  );
}
export async function event(c: DB, a: Actor | null, t: string, action: string, data: unknown = {}) {
  const current = await one(
    c,
    'SELECT owner_id,role,due_at,timing,completed_at FROM tasks WHERE id=$1',
    [t],
  );
  const detail = {
    event_version: 2,
    owner_at_event: current?.owner_id,
    job_at_event: current?.role,
    due_snapshot: current?.due_at,
    timing_at_event: current?.timing,
    completed_at_event: current?.completed_at,
    ...(data as object),
  };
  await c.query('INSERT INTO task_events(task_id,actor_id,action,data) VALUES($1,$2,$3,$4)', [
    t,
    a?.id || null,
    action,
    JSON.stringify(detail),
  ]);
  await audit(c, a, action, 'task', t);
}
export function cipher(text: string) {
  const key = Buffer.from(process.env.VAULT_KEY || '', 'hex');
  need(key.length === 32, 'Chưa cấu hình VAULT_KEY 32 byte ngoài DB', 503, 'CONFIG_REQUIRED');
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(text, 'utf8'), c.final(), c.getAuthTag()]).toString('base64');
}
export function decipher(text: string) {
  const key = Buffer.from(process.env.VAULT_KEY || '', 'hex');
  need(key.length === 32, 'Chưa cấu hình khóa giải mã', 503, 'CONFIG_REQUIRED');
  const b = Buffer.from(text, 'base64'),
    c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString('utf8');
}
export function localDate(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}
export function workingDate(d: string, delta: number, holidays: string[] = []) {
  let x = new Date(d + 'T12:00:00Z');
  let n = Math.abs(delta);
  while (n) {
    x.setUTCDate(x.getUTCDate() + Math.sign(delta));
    if (x.getUTCDay() !== 0 && !holidays.includes(x.toISOString().slice(0, 10))) n--;
  }
  return x.toISOString().slice(0, 10);
}
export function responseDue(start: Date, holidays: string[] = []) {
  let remaining = 8 * 3600e3,
    x = new Date(start.getTime() + 7 * 3600e3);
  while (remaining > 0) {
    const day = x.toISOString().slice(0, 10),
      base = Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
    let used = false;
    if (x.getUTCDay() !== 0 && !holidays.includes(day))
      for (const [from, to] of [
        [9, 12],
        [13, 18],
      ]) {
        const begin = base + from * 3600e3,
          end = base + to * 3600e3;
        const pos = Math.max(x.getTime(), begin);
        if (pos < end) {
          const take = Math.min(remaining, end - pos);
          x = new Date(pos + take);
          remaining -= take;
          used = true;
          if (!remaining) return new Date(x.getTime() - 7 * 3600e3);
        }
      }
    if (!used || remaining) x = new Date(base + 86400e3);
  }
  return new Date(x.getTime() - 7 * 3600e3);
}
