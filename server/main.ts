import { buildApp } from './app.js';
import { pool } from './base.js';
const app = await buildApp();
await app.listen({ host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 3002) });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
