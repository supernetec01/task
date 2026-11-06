import { pool, tx, one, hash, jobs, access } from './base.js';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash as passwordHash } from 'argon2';
import { hiddenPrompt } from './secret-prompt.js';
import { z } from 'zod';
export async function migrate() {
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(3002001)');
    const exists = await one(c, "SELECT to_regclass('public.schema_migrations') AS name");
    const applied = exists.name
      ? (await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version)
      : [];
    for (const file of readdirSync('migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (applied.includes(file)) continue;
      await c.query(readFileSync(resolve('migrations', file), 'utf8'));
      await c.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
      console.log('Migration:', file);
    }
  });
}
export async function createUser(
  c: any,
  email: string,
  name: string,
  password: string,
  job: string,
  role: string,
  team: string,
  manager?: string,
) {
  const u = await one(
    c,
    'INSERT INTO users(username,email,name,password_hash,team_id,manager_id,reviewer_id) VALUES($1,$1,$2,$3,$4,$5,$5) RETURNING id',
    [email, name, await passwordHash(password), team, manager || null],
  );
  for (const [kind, r] of [
    ['JOB', job],
    ['ACCESS', role],
  ])
    await c.query(
      'INSERT INTO grants(user_id,kind,role,scope,team_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
      [
        u.id,
        kind,
        r,
        kind === 'JOB' || r === 'EMPLOYEE' ? 'SELF' : r === 'MANAGER' ? 'TEAM' : 'ALL',
        team,
        'INITIAL_SETUP',
      ],
    );
  return u.id;
}
export async function bootstrapAdmin(password?: string) {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(3002004)');
    const existing = await one(c, "SELECT id,active FROM users WHERE lower(username)='admin'");
    if (existing) {
      const grant = await one(
        c,
        "SELECT id FROM grants WHERE user_id=$1 AND kind='ACCESS' AND role='ADMIN' AND scope='ALL' AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())",
        [existing.id],
      );
      if (!grant || !existing.active)
        throw Error(
          'Username admin already exists but is disabled or lacks Admin access. Nothing changed; ask the current administrator to review it.',
        );
      return { created: false, id: existing.id };
    }
    if (!password || Array.from(password).length < 11 || password.length > 1024)
      throw Error('Administrator password must contain at least 11 characters (maximum 1024).');
    const team = await one(
      c,
      "INSERT INTO teams(name) VALUES('Super Net') ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    );
    const u = await one(
      c,
      'INSERT INTO users(username,name,password_hash,team_id) VALUES($1,$2,$3,$4) RETURNING id',
      ['admin', 'Quản trị viên', await passwordHash(password), team.id],
    );
    for (const [kind, role, scope] of [
      ['JOB', 'CONTENT', 'SELF'],
      ['ACCESS', 'ADMIN', 'ALL'],
    ])
      await c.query(
        'INSERT INTO grants(user_id,kind,role,scope,team_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
        [u.id, kind, role, scope, team.id, 'ADMIN_BOOTSTRAP'],
      );
    await c.query(
      "INSERT INTO audit(actor_id,action,object_type,object_id) VALUES($1,'ADMIN_BOOTSTRAPPED','user',$2)",
      [u.id, u.id],
    );
    return { created: true, id: u.id };
  });
}
async function main() {
  const cmd = process.argv[2];
  if (cmd === 'migrate') return migrate();
  if (cmd === 'bootstrap-status') {
    const existing = await tx((c) => one(c, "SELECT id FROM users WHERE lower(username)='admin'"));
    console.log(JSON.stringify({ exists: !!existing }));
    return;
  }
  if (cmd === 'bootstrap') {
    const exists = await tx((c) => one(c, "SELECT id FROM users WHERE lower(username)='admin'"));
    let password = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    if (!exists && !password) {
      password = await hiddenPrompt('Mật khẩu mới cho admin (ít nhất 11 ký tự): ');
      const confirm = await hiddenPrompt('Nhập lại mật khẩu: ');
      if (password !== confirm) throw Error('Passwords do not match; no account was created.');
    }
    const result = await bootstrapAdmin(password);
    password = undefined;
    console.log(
      result.created
        ? 'Created administrator username: admin. Password was hashed; no password was printed.'
        : 'Administrator admin already exists. Password, grants and data were preserved.',
    );
    return;
  }
  if (cmd === 'demo') {
    if (process.env.DEMO_MODE !== 'true')
      throw Error('DEMO_MODE=true required; separate demo database only');
    const password = process.env.DEMO_PASSWORD;
    if (!password || Array.from(password).length < 11)
      throw Error('Set DEMO_PASSWORD >=11 characters');
    await tx(async (c) => {
      if (await one(c, 'SELECT id FROM users LIMIT 1'))
        throw Error('Demo seed requires empty database');
      const t = await one(
        c,
        "INSERT INTO teams(name) VALUES('DEMO · Nhóm thử nghiệm') RETURNING id",
      );
      const boss = await createUser(
        c,
        'boss@demo.local',
        'DEMO · Sếp',
        password,
        'CONTENT',
        'BOSS',
        t.id,
      );
      const manager = await createUser(
        c,
        'manager@demo.local',
        'DEMO · Quản lý',
        password,
        'CONTENT',
        'MANAGER',
        t.id,
        boss,
      );
      await createUser(c, 'admin@demo.local', 'DEMO · Admin', password, 'CONTENT', 'ADMIN', t.id);
      for (const [email, name, role] of [
        ['employee@demo.local', 'DEMO · Nhân viên', 'CONTENT'],
        ['support@demo.local', 'DEMO · Thiết kế', 'DESIGNER'],
        ['hr@demo.local', 'DEMO · Nhân sự', 'HR'],
        ['ads@demo.local', 'DEMO · Quảng cáo', 'ADS'],
        ['sales@demo.local', 'DEMO · Vận hành', 'MARKETPLACE'],
      ])
        await createUser(c, email, name, password, role, 'EMPLOYEE', t.id, manager);
      await c.query(
        'UPDATE settings SET value=value||\'{"assignment_boundary_confirmed":true,"report_week_confirmed":true,"deadline_reviewer_approval":true}\'::jsonb WHERE key=\'policies\'',
      );
    });
    console.log('Demo users created. Use supplied DEMO_PASSWORD. Demo database only.');
    return;
  }
  throw Error('Usage: migrate | bootstrap | demo');
}
if (/[/\\]cli\.(ts|js)$/.test(process.argv[1] || ''))
  main()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
