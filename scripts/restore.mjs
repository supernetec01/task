import 'dotenv/config';
import pg from 'pg';
import { readFile, readdir, mkdir, copyFile, lstat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pgTool } from './backup.mjs';
export async function restore() {
  const source = resolve(process.argv[2] || ''),
    db = process.env.RESTORE_DATABASE_URL,
    dest = process.env.RESTORE_DATA_DIR;
  if (!process.argv[2] || !db || !dest)
    throw Error(
      'Usage: RESTORE_DATABASE_URL + RESTORE_DATA_DIR + node scripts/restore.mjs <backup-folder>; destination must be empty',
    );
  const u = new URL(db),
    current = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (current && u.host === current.host && u.pathname === current.pathname)
    throw Error('Refusing restore into current database');
  const target = resolve(dest);
  if (target === source || target.startsWith(source + sep))
    throw Error('Destination must be separate from backup');
  try {
    if ((await readdir(target)).length) throw Error('Restore data directory must be empty');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1) throw Error('Unsupported backup version');
  for (const [name, expected] of Object.entries(manifest.files)) {
    const path = resolve(source, name);
    if (!path.startsWith(source + sep) || name.split(/[\\/]/).includes('..'))
      throw Error('Unsafe backup path');
    if ((await lstat(path)).isSymbolicLink()) throw Error('Backup symlinks are not allowed');
    if (
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex') !== expected
    )
      throw Error('Backup checksum mismatch: ' + name);
  }
  const c = new pg.Client({ connectionString: db });
  await c.connect();
  try {
    const count = await c.query(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
    );
    if (Number(count.rows[0].count))
      throw Error('Restore database must be empty; no existing data will be overwritten');
    await pgTool(
      'pg_restore',
      [
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '-d',
        decodeURIComponent(u.pathname.slice(1)),
        join(source, 'database.dump'),
      ],
      db,
    );
    await mkdir(target, { recursive: true, mode: 0o700 });
    for (const name of Object.keys(manifest.files).filter((p) => p.startsWith('files/'))) {
      const rel = name.slice(6),
        out = resolve(target, rel);
      if (!out.startsWith(target + sep)) throw Error('Unsafe target path');
      await mkdir(resolve(out, '..'), { recursive: true });
      await copyFile(join(source, name), out);
    }
    console.log(
      'Restore completed in separate database and directory. Restore VAULT_KEY securely before testing vault data.',
    );
  } finally {
    await c.end();
  }
}
if (process.argv[1]?.endsWith('restore.mjs'))
  restore().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
