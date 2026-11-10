import 'dotenv/config';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const tables = [
  'users',
  'grants',
  'tasks',
  'task_events',
  'task_updates',
  'owner_history',
  'submissions',
  'reviews',
  'report_revisions',
  'assets',
  'credential_versions',
  'employee_profiles',
  'employee_revisions',
  'metrics',
  'metric_batches',
];
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const c = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
});
try {
  await c.connect();
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const action = process.argv[2],
    path = process.argv[3];
  if (!['--write', '--compare'].includes(action) || !path)
    throw Error('Usage: node scripts/handoff-preview.mjs --write|--compare <fingerprint.json>');
  const baseline = action === '--compare' ? JSON.parse(await readFile(path, 'utf8')) : null;
  const result = { schema: 1, tables: {} };
  for (const table of tables) {
    if (!(await c.query('SELECT to_regclass($1) AS name', ['public.' + table])).rows[0].name)
      continue;
    const columns =
      baseline?.tables[table]?.columns ||
      (
        await c.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
          [table],
        )
      ).rows.map((r) => r.column_name);
    const records = (
      await c.query(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)} ORDER BY id`)
    ).rows;
    const digests = Object.fromEntries(records.map((row) => [row.id, sha(row)]));
    result.tables[table] = { columns, count: records.length, digests };
  }
  const queue = (
    await c.query(
      "SELECT kind,role,scope,count(*)::int AS count FROM grants WHERE revoked_at IS NULL AND ((kind='ACCESS' AND role IN ('MANAGER','EXECUTIVE')) OR (role='BOSS' AND scope<>'ALL') OR (kind='JOB' AND role NOT IN ('CONTENT','DESIGNER','MARKETPLACE','HR'))) GROUP BY kind,role,scope ORDER BY kind,role,scope",
    )
  ).rows;
  await c.query('COMMIT');
  if (action === '--write') {
    await writeFile(path, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(
      JSON.stringify({
        status: 'FINGERPRINT_SAVED',
        tables: Object.fromEntries(Object.entries(result.tables).map(([k, v]) => [k, v.count])),
        role_mapping_required: queue,
      }),
    );
  } else {
    const differences = [];
    for (const [t, before] of Object.entries(baseline.tables)) {
      const after = result.tables[t];
      for (const [id, h] of Object.entries(before.digests))
        if (after?.digests[id] !== h)
          differences.push({ table: t, id, kind: after?.digests[id] ? 'MODIFIED' : 'MISSING' });
      const added = Object.keys(after?.digests || {}).filter((id) => !before.digests[id]);
      if (added.length) differences.push({ table: t, kind: 'ADDED', count: added.length });
    }
    console.log(
      JSON.stringify(
        {
          status: differences.length ? 'REVIEW_DIFF' : 'UNCHANGED',
          differences,
          role_mapping_required: queue,
        },
        null,
        2,
      ),
    );
    // Added approved grants still require review; altered/deleted old rows fail.
    if (differences.some((d) => d.kind !== 'ADDED')) process.exitCode = 1;
  }
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  console.error(
    e.message.startsWith('Usage:')
      ? e.message
      : 'Fingerprint failed; check schema, destination file and private database configuration.',
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
