import { buildApp } from './app.js';
import { pool } from './base.js';
async function start() {
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('INVALID_PORT');
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL_REQUIRED');
  await pool.query('SELECT 1');
  const schema = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='username'",
  );
  if (!schema.rowCount) throw Error('MIGRATION_REQUIRED');
  const templates = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='template_snapshot'",
  );
  if (!templates.rowCount) throw Error('MIGRATION_REQUIRED');
  const app = await buildApp();
  await app.listen({ host, port });
  console.log(`Super Net is running on ${host}:${port}`);
  console.log(`Local access: http://localhost:${port} | Health: /api/health`);
  console.log('Keep this terminal open. Press Ctrl+C to stop. Request logs: DATA_DIR/logs.');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await app.close();
      await pool.end();
      process.exitCode = 0;
    });
}
start().catch(async (error) => {
  const code = String(error.code || error.message || 'STARTUP_FAILED');
  const reasons: Record<string, string> = {
    EADDRINUSE: 'Port is already used. Inspect its process; do not stop an unrelated service.',
    EACCES: 'Permission denied while binding the host/port or reading files.',
    ECONNREFUSED: 'Cannot reach PostgreSQL. Start the configured database and check DATABASE_URL.',
    '28P01': 'PostgreSQL rejected the credentials. Check the private database configuration.',
    DATABASE_URL_REQUIRED: 'Configure DATABASE_URL in the project .env before starting.',
    MIGRATION_REQUIRED: 'Database schema is outdated. Run npm run migrate, then npm start.',
    INVALID_PORT: 'PORT must be an integer from 1 to 65535.',
  };
  console.error(
    `Super Net startup failed [${reasons[code] ? code : 'STARTUP_FAILED'}]: ${reasons[code] || 'Check working directory, .env, database, build and DATA_DIR permissions.'}`,
  );
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
