import 'dotenv/config';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, lstat, copyFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export function pgEnvironment(url) {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
}
export async function pgTool(name, args, dbUrl, output) {
  const exe = process.env.PG_BIN_DIR
    ? join(process.env.PG_BIN_DIR, name + (process.platform === 'win32' ? '.exe' : ''))
    : name;
  await new Promise((resolvePromise, reject) => {
    const p = spawn(exe, args, {
      env: pgEnvironment(dbUrl),
      stdio: ['ignore', output ? 'pipe' : 'ignore', 'pipe'],
      windowsHide: true,
    });
    let error = '';
    p.stderr.on('data', (b) => {
      error += b.toString();
    });
    const out = output ? createWriteStream(output, { mode: 0o600, flags: 'wx' }) : null;
    if (out) {
      p.stdout.pipe(out);
      out.on('error', (e) => {
        p.kill();
        reject(e);
      });
    }
    p.on('error', reject);
    p.on('close', (code) => {
      const finish = () =>
        code === 0
          ? resolvePromise()
          : reject(
              Error(
                name +
                  ' failed (exit ' +
                  code +
                  '); check PostgreSQL access and matching tool version.',
              ),
            );
      if (out && !out.writableFinished) out.on('finish', finish);
      else finish();
    });
  });
}
async function files(root) {
  const out = [];
  for (const name of await readdir(root)) {
    const p = join(root, name),
      stat = await lstat(p);
    if (stat.isSymbolicLink()) throw Error('Refusing symlink in persistent storage');
    if (stat.isDirectory()) out.push(...(await files(p)));
    else if (stat.isFile()) out.push(p);
  }
  return out;
}
export async function backup() {
  const db = process.env.DATABASE_URL;
  if (!db) throw Error('DATABASE_URL required');
  const source = resolve(process.env.DATA_DIR || 'data'),
    root = resolve(process.argv[2] || process.env.BACKUP_DIR || 'backups');
  if (root === source || root.startsWith(source + '/') || root.startsWith(source + '\\'))
    throw Error('Backup must be outside DATA_DIR');
  const destination = join(
    root,
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
  );
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const c = new pg.Client({ connectionString: db });
  await c.connect();
  try {
    await c.query('SELECT pg_advisory_lock(3002003)');
    await mkdir(join(destination, 'files'), { mode: 0o700 });
    await pgTool(
      'pg_dump',
      ['-Fc', '--no-owner', '--no-acl', '-d', new URL(db).pathname.slice(1)],
      db,
      join(destination, 'database.dump'),
    );
    const manifest = {
      schema: 1,
      created_at: new Date().toISOString(),
      files: {},
      note: 'VAULT_KEY and environment secrets must be backed up separately with restricted access.',
    };
    for (const p of await files(source)) {
      const rel = relative(source, p);
      await mkdir(resolve(destination, 'files', rel, '..'), { recursive: true });
      await copyFile(p, join(destination, 'files', rel));
      manifest.files['files/' + rel.replaceAll('\\', '/')] = sha(
        await readFile(join(destination, 'files', rel)),
      );
    }
    manifest.files['database.dump'] = sha(await readFile(join(destination, 'database.dump')));
    await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    console.log('Backup completed:', destination);
    return destination;
  } finally {
    await c.query('SELECT pg_advisory_unlock(3002003)');
    await c.end();
  }
}
if (process.argv[1]?.endsWith('backup.mjs'))
  backup().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
