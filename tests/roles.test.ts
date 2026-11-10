import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pool, actor, hasJob, management, type Actor } from '../server/base.js';
import { addGrant } from '../server/user-access.js';

const retired = [
  'MANAGER',
  'EXECUTIVE',
  'EMPLOYEE',
  'HR_SENSITIVE',
  'DESIGNER',
  'ADS',
  'ACCOUNTANT',
  'WAREHOUSE',
  'INTERN',
  'TESTER_OPTIONAL',
];
after(() => pool.end());

test('Five roles: all retired roles rejected by API validation and direct authorization helpers', async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /_test$/);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const u = (
      await c.query(
        "INSERT INTO users(username,name,password_hash) VALUES($1,'Role fixture','unused') RETURNING id",
        [randomUUID()],
      )
    ).rows[0];
    const a = { id: u.id, grants: [] } as unknown as Actor;
    for (const role of retired) {
      for (const kind of ['JOB', 'ACCESS'])
        await assert.rejects(
          () => addGrant(c, a, u.id, { kind, role, scope: kind === 'JOB' ? 'SELF' : 'ALL' }),
          { code: 'RETIRED_ROLE' },
        );
      const forged = {
        ...a,
        grants: [
          { kind: 'ACCESS', role, scope: 'ALL' },
          { kind: 'JOB', role, scope: 'SELF' },
        ],
      };
      assert.equal(hasJob(forged, role), false);
      assert.equal(management(forged), false);
    }
    for (const role of ['ADMIN', 'BOSS', 'CONTENT', 'HR', 'MARKETPLACE'])
      await addGrant(c, a, u.id, {
        kind: ['ADMIN', 'BOSS'].includes(role) ? 'ACCESS' : 'JOB',
        role,
        scope: ['ADMIN', 'BOSS'].includes(role) ? 'ALL' : 'SELF',
      });
    assert.deepEqual((await actor(c, u.id)).grants.map((g) => g.role).sort(), [
      'ADMIN',
      'BOSS',
      'CONTENT',
      'HR',
      'MARKETPLACE',
    ]);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});

test('Migration 011 revokes historical/future roles and automatic mappings, invalidates sessions, preserves history and valid grants', async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('ALTER TABLE grants DROP CONSTRAINT grants_five_roles');
    await c.query('ALTER TABLE account_grants DROP CONSTRAINT account_grants_five_roles');
    const users: { id: string; permission_version: number }[] = [];
    for (let n = 0; n < 3; n++) {
      const u = (
        await c.query(
          "INSERT INTO users(username,name,password_hash) VALUES($1,'Migration fixture','unused') RETURNING *",
          [randomUUID()],
        )
      ).rows[0];
      users.push(u);
      await c.query(
        "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,'fixture',now()+interval '1 day')",
        [randomUUID(), u.id],
      );
    }
    for (const role of retired)
      await c.query(
        "INSERT INTO grants(user_id,kind,role,scope,reason,valid_from) VALUES($1,$2,$3,'SELF','fixture',now()+interval '1 day')",
        [
          users[0].id,
          ['MANAGER', 'EMPLOYEE', 'EXECUTIVE', 'HR_SENSITIVE'].includes(role) ? 'ACCESS' : 'JOB',
          role,
        ],
      );
    await c.query(
      "INSERT INTO grants(user_id,kind,role,scope,reason) VALUES($1,'JOB','HR','SELF','explicit valid role'),($2,'JOB','CONTENT','SELF','HANDOFF D01: DESIGNER to CONTENT; legacy grant retained'),($3,'ACCESS','ADMIN','ALL','unchanged')",
      users.map((u) => u.id),
    );
    const task = (
      await c.query(
        "INSERT INTO tasks(title,owner_id,created_by,role,source,status) VALUES('Historical designer task',$1,$1,'DESIGNER','fixture','DRAFT') RETURNING *",
        [users[0].id],
      )
    ).rows[0];
    const before = (
      await c.query('SELECT id,role,reason FROM grants WHERE user_id=ANY($1) ORDER BY id', [
        users.map((u) => u.id),
      ])
    ).rows;
    await c.query(readFileSync('migrations/011.sql', 'utf8'));
    assert.deepEqual(
      (
        await c.query('SELECT id,role,reason FROM grants WHERE user_id=ANY($1) ORDER BY id', [
          users.map((u) => u.id),
        ])
      ).rows,
      before,
    );
    assert.deepEqual((await c.query('SELECT * FROM tasks WHERE id=$1', [task.id])).rows[0], task);
    assert.deepEqual(
      (await actor(c, users[0].id)).grants.map((g) => g.role),
      ['HR'],
    );
    assert.equal((await actor(c, users[1].id)).grants.length, 0);
    for (let n = 0; n < 3; n++) {
      const u = (await c.query('SELECT permission_version FROM users WHERE id=$1', [users[n].id]))
        .rows[0];
      assert.equal(u.permission_version, users[n].permission_version + (n < 2 ? 1 : 0));
      assert.equal(
        Number(
          (await c.query('SELECT count(*) FROM sessions WHERE user_id=$1', [users[n].id])).rows[0]
            .count,
        ),
        n < 2 ? 0 : 1,
      );
    }
    await c.query('SAVEPOINT invalid_grant');
    await assert.rejects(
      () =>
        c.query(
          "INSERT INTO grants(user_id,kind,role,scope,reason) VALUES($1,'ACCESS','EXECUTIVE','ALL','must fail')",
          [users[0].id],
        ),
      { code: '23514' },
    );
    await c.query('ROLLBACK TO SAVEPOINT invalid_grant');
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});
