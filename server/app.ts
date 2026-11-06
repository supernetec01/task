import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import statics from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { verify, hash as passwordHash } from 'argon2';
import { z, ZodError } from 'zod';
import {
  pool,
  tx,
  one,
  rows,
  actor,
  hash,
  Fault,
  need,
  type Actor,
  type DB,
  audit,
  isAdmin,
  jobs,
  access,
  version,
  management,
  scopeUser,
  setting,
  notify,
} from './base.js';
import { taskRoutes } from './tasks.js';
import { reportRoutes } from './reports.js';
import { moduleRoutes } from './modules.js';
import { logStream } from './logging.js';
export type Handler = (
  c: DB,
  a: Actor,
  b: any,
  q: any,
  p: any,
  reply: FastifyReply,
) => Promise<any>;
export type API = (method: string, path: string, fn: Handler) => void;
export async function buildApp() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            stream: logStream('api'),
            redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'],
          },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 500, timeWindow: '1 minute' });
  await app.register(multipart, {
    limits: {
      fileSize: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
      files: 1,
      fields: 8,
    },
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.headers({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'x-frame-options': 'DENY',
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin)
        need(new URL(origin).host === req.headers.host, 'Nguồn yêu cầu không hợp lệ', 403, 'CSRF');
    }
  });
  app.setErrorHandler((e: any, req, reply) => {
    const status =
      e instanceof Fault
        ? e.status
        : e instanceof ZodError
          ? 422
          : ['23505', '40001', '40P01'].includes(e.code)
            ? 409
            : e.code === '22P02' || e.code === '23503' || e.code === '23514'
              ? 422
              : e.statusCode || 500;
    if (status >= 500)
      req.log.error({ err: { message: e.message, code: e.code } }, 'request failed');
    reply.status(status).send({
      code:
        e instanceof Fault
          ? e.code
          : e instanceof ZodError
            ? 'VALIDATION'
            : status === 409
              ? 'CONFLICT'
              : status === 429
                ? 'RATE_LIMIT'
                : status >= 500
                  ? 'INTERNAL_ERROR'
                  : 'REQUEST_ERROR',
      message:
        e instanceof Fault
          ? e.message
          : e instanceof ZodError
            ? 'Dữ liệu không hợp lệ'
            : status === 409
              ? 'Dữ liệu đã tồn tại hoặc vừa thay đổi'
              : status === 429
                ? 'Bạn đã thử quá nhiều lần. Vui lòng chờ một phút rồi thử lại.'
                : status >= 500
                  ? 'Không thể lưu. Vui lòng thử lại; nội dung chưa được xác nhận.'
                  : 'Yêu cầu không hợp lệ',
      field_errors: e instanceof ZodError ? e.issues : undefined,
      request_id: req.id,
      retryable: status >= 500 || status === 429,
    });
  });
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const b = z
        .object({
          username: z.string().trim().min(1).max(254).optional(),
          email: z.email().optional(),
          password: z.string().min(1).max(1024),
        })
        .refine((v) => !!(v.username || v.email), { message: 'Cần tên đăng nhập' })
        .parse(req.body);
      const result = await tx(async (c) => {
        const u = await one(
          c,
          'SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)',
          [b.username || b.email],
        );
        const fallback =
          '$argon2id$v=19$m=65536,t=3,p=4$NkFwQW9HczY5Q1NsVjBsaQ$krCKWWOEZmKZ4HHurTTVR68EehftTWbTI9uOVllvZz4';
        let valid = false;
        try {
          valid = await verify(u?.password_hash || fallback, b.password);
        } catch {}
        need(u?.active && valid, 'Tên đăng nhập hoặc mật khẩu không đúng', 401, 'BAD_LOGIN');
        const token = randomBytes(32).toString('hex'),
          csrf = randomBytes(24).toString('hex');
        await c.query(
          "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
          [hash(token), u.id, csrf],
        );
        await audit(c, { id: u.id } as Actor, 'LOGIN', 'user', u.id);
        return { token, csrf };
      });
      reply.setCookie('sn_session', result.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 43200,
      });
      return { csrf: result.csrf };
    },
  );
  const api: API = (method, path, fn) =>
    app.route({
      method: method as any,
      url: '/api/v1' + path,
      config: { rateLimit: { max: path.includes('reveal') ? 15 : 500, timeWindow: '1 minute' } },
      handler: async (req, reply) =>
        tx(async (c) => {
          const session = await one(
            c,
            'SELECT user_id,csrf FROM sessions WHERE token_hash=$1 AND expires_at>clock_timestamp()',
            [hash(req.cookies.sn_session || '')],
          );
          need(session, 'Vui lòng đăng nhập', 401, 'UNAUTHORIZED');
          const a = await actor(c, session.user_id);
          a.csrf = session.csrf;
          const mutation = !['GET', 'HEAD'].includes(method);
          if (mutation) {
            await c.query('SELECT pg_advisory_xact_lock_shared(3002003)');
            need(
              req.headers['x-csrf-token'] === a.csrf,
              'Phiên hoặc mã CSRF không hợp lệ',
              403,
              'CSRF',
            );
          }
          let b: any = req.body || {};
          if (req.isMultipart()) {
            const part = await req.file();
            need(part, 'Thiếu tệp', 422, 'VALIDATION');
            const buffer = await part.toBuffer();
            need(!part.file.truncated, 'Tệp vượt giới hạn dung lượng', 413, 'FILE_TOO_LARGE');
            b = {
              filename: part.filename,
              mime: part.mimetype,
              buffer,
              fields: Object.fromEntries(
                Object.entries(part.fields)
                  .filter(([, v]: any) => v.type === 'field')
                  .map(([k, v]: any) => [k, v.value]),
              ),
            };
          }
          let key = '',
            payloadHash = '';
          if (mutation) {
            key = String(req.headers['idempotency-key'] || '');
            need(
              key.length >= 8 && key.length <= 160,
              'Thiếu Idempotency-Key',
              422,
              'IDEMPOTENCY_REQUIRED',
            );
            payloadHash = hash(method + path + JSON.stringify(req.params) + JSON.stringify(b));
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [a.id + key]);
            const old = await one(c, 'SELECT * FROM idempotency WHERE user_id=$1 AND key=$2', [
              a.id,
              key,
            ]);
            if (old) {
              need(
                old.hash === payloadHash,
                'Cùng mã gửi nhưng nội dung khác',
                409,
                'IDEMPOTENCY_CONFLICT',
              );
              return old.response;
            }
          }
          const result = await fn(c, a, b, req.query, req.params, reply);
          if (mutation && !reply.sent)
            await c.query(
              'INSERT INTO idempotency(user_id,key,hash,response) VALUES($1,$2,$3,$4)',
              [a.id, key, payloadHash, JSON.stringify(result ?? { ok: true })],
            );
          return result;
        }),
    });
  api('GET', '/me', async (c, a) => ({
    ...a,
    admin: isAdmin(a),
    management: management(a),
    policies: await setting(c, 'policies'),
    demo: process.env.DEMO_MODE === 'true',
  }));
  api('POST', '/auth/logout', async (c, a, b, q, p, reply) => {
    await c.query('DELETE FROM sessions WHERE user_id=$1 AND csrf=$2', [a.id, a.csrf]);
    reply.clearCookie('sn_session', { path: '/' });
    return { ok: true };
  });
  api('POST', '/auth/password', async (c, a, b) => {
    const v = z
      .object({
        current_password: z.string(),
        new_password: z
          .string()
          .max(1024)
          .refine((v) => Array.from(v).length >= 11, { message: 'Mật khẩu cần ít nhất 11 ký tự' }),
      })
      .parse(b);
    const u = await one(c, 'SELECT password_hash FROM users WHERE id=$1', [a.id]);
    need(
      await verify(u.password_hash, v.current_password),
      'Mật khẩu hiện tại không đúng',
      422,
      'VALIDATION',
    );
    await c.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      a.id,
      await passwordHash(v.new_password),
    ]);
    await c.query('DELETE FROM sessions WHERE user_id=$1 AND csrf<>$2', [a.id, a.csrf]);
    await audit(c, a, 'PASSWORD_CHANGED', 'user', a.id);
    return { ok: true };
  });
  api('GET', '/directory/invitees', async (c, a) => {
    const users = await rows(c, 'SELECT id,name,team_id,active FROM users WHERE active');
    const policy = await setting(c, 'policies');
    const result = [];
    for (const u of users) {
      if (u.id !== a.id && !isAdmin(a) && policy.support_scope !== 'ALL' && u.team_id !== a.team_id)
        continue;
      const roles = await rows(
        c,
        "SELECT DISTINCT role FROM grants WHERE user_id=$1 AND kind='JOB' AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())",
        [u.id],
      );
      result.push({ ...u, roles: roles.map((r) => r.role) });
    }
    return { items: result };
  });
  api('GET', '/users', async (c, a) => {
    need(management(a));
    const users = await rows(
      c,
      'SELECT id,username,email,name,active,team_id,manager_id,reviewer_id,permission_version FROM users ORDER BY name',
    );
    const out = [];
    for (const u of users)
      if (
        isAdmin(a) ||
        (await scopeUser(c, a, u.id)
          .then(() => true)
          .catch(() => false))
      )
        out.push({
          ...u,
          grants: isAdmin(a)
            ? await rows(c, 'SELECT * FROM grants WHERE user_id=$1 ORDER BY valid_from DESC', [
                u.id,
              ])
            : undefined,
        });
    return { items: out, teams: await rows(c, 'SELECT * FROM teams ORDER BY name'), jobs, access };
  });
  api('POST', '/teams', async (c, a, b) => {
    need(isAdmin(a));
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(b);
    const t = await one(c, 'INSERT INTO teams(name) VALUES($1) RETURNING *', [name]);
    await audit(c, a, 'TEAM_CREATED', 'team', t.id);
    return t;
  });
  api('POST', '/users', async (c, a, b) => {
    need(isAdmin(a));
    const v = z
      .object({
        username: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_.-]{3,64}$/),
        email: z.email().nullable().optional(),
        name: z.string().trim().min(1).max(120),
        password: z
          .string()
          .max(1024)
          .refine((v) => Array.from(v).length >= 11, { message: 'Mật khẩu cần ít nhất 11 ký tự' }),
        team_id: z.uuid().nullable(),
        manager_id: z.uuid().nullable().optional(),
        reviewer_id: z.uuid().nullable().optional(),
      })
      .parse(b);
    const u = await one(
      c,
      'INSERT INTO users(username,email,name,password_hash,team_id,manager_id,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [
        v.username.toLowerCase(),
        v.email?.toLowerCase() || null,
        v.name,
        await passwordHash(v.password),
        v.team_id,
        v.manager_id || null,
        v.reviewer_id || null,
      ],
    );
    await audit(c, a, 'USER_CREATED', 'user', u.id);
    return u;
  });
  api('PATCH', '/users/:id', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = z
      .object({
        name: z.string().min(1).max(120),
        active: z.boolean(),
        team_id: z.uuid().nullable(),
        manager_id: z.uuid().nullable(),
        reviewer_id: z.uuid().nullable(),
        expected_version: z.number().int(),
      })
      .parse(b);
    const u = await one(
      c,
      'SELECT *,permission_version AS version FROM users WHERE id=$1 FOR UPDATE',
      [p.id],
    );
    need(u, 'Không tìm thấy', 404, 'NOT_FOUND');
    version(u, v.expected_version);
    need(v.active || p.id !== a.id, 'Không tự khóa tài khoản hiện tại', 422, 'VALIDATION');
    need(
      p.id !== v.manager_id && p.id !== v.reviewer_id,
      'Không tự làm người quản lý/người duyệt',
      422,
      'VALIDATION',
    );
    await c.query(
      'UPDATE users SET name=$2,active=$3,team_id=$4,manager_id=$5,reviewer_id=$6,permission_version=permission_version+1 WHERE id=$1',
      [p.id, v.name, v.active, v.team_id, v.manager_id, v.reviewer_id],
    );
    if (!v.active) await c.query('DELETE FROM sessions WHERE user_id=$1', [p.id]);
    await audit(c, a, 'USER_UPDATED', 'user', p.id);
    return { ok: true };
  });
  api('POST', '/role-grants', async (c, a, b) => {
    need(isAdmin(a));
    const v = z
      .object({
        user_id: z.uuid(),
        kind: z.enum(['JOB', 'ACCESS']),
        role: z.string(),
        scope: z.enum(['SELF', 'TEAM', 'ALL']),
        team_id: z.uuid().nullable(),
        valid_from: z.iso.datetime({ offset: true }),
        valid_to: z.iso.datetime({ offset: true }).nullable(),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(b);
    need(
      (v.kind === 'JOB' ? jobs : access).includes(v.role),
      'Vai trò không hợp lệ',
      422,
      'VALIDATION',
    );
    need(
      v.kind !== 'JOB' || v.scope === 'SELF',
      'Role chuyên môn có phạm vi cá nhân',
      422,
      'VALIDATION',
    );
    const g = await one(
      c,
      'INSERT INTO grants(user_id,kind,role,scope,team_id,valid_from,valid_to,reason,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [v.user_id, v.kind, v.role, v.scope, v.team_id, v.valid_from, v.valid_to, v.reason, a.id],
    );
    await c.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1', [
      v.user_id,
    ]);
    await audit(c, a, 'ROLE_GRANTED', 'grant', g.id, { role: v.role, user: v.user_id });
    return g;
  });
  api('POST', '/role-grants/:id/revoke', async (c, a, b, q, p) => {
    need(isAdmin(a));
    need(typeof b.reason === 'string' && b.reason.trim(), 'Cần lý do', 422, 'VALIDATION');
    const g = await one(
      c,
      'UPDATE grants SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING *',
      [p.id],
    );
    need(g, 'Quyền không còn hiệu lực', 409, 'CONFLICT');
    await c.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1', [
      g.user_id,
    ]);
    await audit(c, a, 'ROLE_REVOKED', 'grant', g.id, { reason: b.reason });
    return { ok: true };
  });
  api('GET', '/settings', async (c, a) => {
    need(isAdmin(a));
    return {
      items: await rows(c, 'SELECT * FROM settings'),
      rules: await rows(
        c,
        'SELECT r.*,u.name FROM recurring_rules r JOIN users u ON u.id=r.owner_id',
      ),
      policies: await rows(c, 'SELECT * FROM approval_policies'),
    };
  });
  api('PUT', '/settings/:key', async (c, a, b, q, p) => {
    need(isAdmin(a));
    need(['calendar', 'policies'].includes(p.key), 'Cấu hình không hợp lệ', 422, 'VALIDATION');
    const old = await one(c, 'SELECT * FROM settings WHERE key=$1 FOR UPDATE', [p.key]);
    version(old, b.expected_version);
    const v =
      p.key === 'calendar'
        ? z
            .object({
              timezone: z.literal('Asia/Ho_Chi_Minh'),
              holidays: z.array(z.iso.date()).max(1000),
              version: z.number().int().positive(),
            })
            .parse(b.value)
        : z
            .object({
              assignment_boundary_confirmed: z.boolean(),
              report_week_confirmed: z.boolean(),
              deadline_reviewer_approval: z.boolean(),
              birthday_policy_confirmed: z.boolean(),
              retention_confirmed: z.boolean(),
              support_scope: z.enum(['TEAM', 'ALL']),
              reopen_enabled: z.boolean(),
            })
            .parse(b.value);
    need(
      typeof b.reason === 'string' && b.reason.trim(),
      'Cần ghi quyết định và người chốt',
      422,
      'VALIDATION',
    );
    await c.query(
      'UPDATE settings SET value=$2,version=version+1,updated_by=$3,updated_at=now() WHERE key=$1',
      [p.key, JSON.stringify(v), a.id],
    );
    await audit(c, a, 'POLICY_DECISION', 'settings', p.key, { value: v, reason: b.reason });
    return { ok: true };
  });
  api('GET', '/notifications', async (c, a) => ({
    items: await rows(
      c,
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
      [a.id],
    ),
  }));
  api('POST', '/notifications/:id/read', async (c, a, b, q, p) => {
    await c.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [
      p.id,
      a.id,
    ]);
    return { ok: true };
  });
  api('GET', '/audit', async (c, a, b, q) => {
    need(isAdmin(a));
    return {
      items: await rows(
        c,
        'SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.id>$1 ORDER BY a.id LIMIT 200',
        [Number(q.after) || 0],
      ),
    };
  });
  taskRoutes(api);
  reportRoutes(api);
  moduleRoutes(api);
  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });
  if (existsSync(resolve('dist/index.html'))) {
    await app.register(statics, { root: resolve('dist'), prefix: '/' });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api')
        ? reply.code(404).send({ code: 'NOT_FOUND', message: 'Không tìm thấy API' })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
