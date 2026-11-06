import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cliFailure, requireDatabaseConfiguration } from '../server/cli-diagnostics.js';

test('AggregateError with an empty message exposes ECONNREFUSED and actionable guidance', () => {
  const failure = Object.assign(
    new AggregateError([Object.assign(new Error(), { code: 'ECONNREFUSED' })]),
    { code: 'ECONNREFUSED' },
  );
  assert.equal(failure.message, '');
  const result = cliFailure(failure);
  assert.equal(result.code, 'ECONNREFUSED');
  assert.match(result.hint, /PostgreSQL Windows service/);
});
test('Distinct authentication, missing database and missing schema diagnostics never leak raw details', () => {
  for (const code of ['28P01', '3D000', '42703', '42P01', '42501', 'ETIMEDOUT']) {
    const result = cliFailure({ code, message: 'postgresql://user:DO_NOT_PRINT@host/db' });
    assert.equal(result.code, code);
    assert(!JSON.stringify(result).includes('DO_NOT_PRINT'));
  }
  const unknown = cliFailure({ message: 'secret-bearing internal failure' });
  assert.equal(unknown.code, 'CLI_FAILED');
  assert(!JSON.stringify(unknown).includes('secret-bearing'));
});
test('Missing DATABASE_URL fails explicitly instead of falling back to PostgreSQL defaults', () => {
  const saved = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = '';
    assert.throws(() => requireDatabaseConfiguration('bootstrap-status'), {
      code: 'CONFIG_REQUIRED',
    });
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
});
test('Compiled bootstrap-status emits JSON and exit 1 for missing configuration', () => {
  const run = spawnSync(process.execPath, ['build/server/cli.js', 'bootstrap-status', '--json'], {
    env: { ...process.env, DATABASE_URL: '', MIGRATION_DATABASE_URL: '' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(run.status, 1, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CONFIG_REQUIRED');
  assert.equal(run.stderr, '');
});
test('Compiled bootstrap-status emits ECONNREFUSED for a real refused localhost connection', () => {
  const run = spawnSync(process.execPath, ['build/server/cli.js', 'bootstrap-status', '--json'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://probe:unused@localhost:1/probe',
      MIGRATION_DATABASE_URL: '',
    },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(run.status, 1, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.error.code, 'ECONNREFUSED');
  assert.match(result.error.hint, /host and port/);
});
