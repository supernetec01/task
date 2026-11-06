import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = createHash('sha256');
function scan(path) {
  for (const entry of readdirSync(resolve(root, path), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) scan(p);
    else digest.update(p.replaceAll('\\', '/')).update(readFileSync(resolve(root, p)));
  }
}
for (const path of ['server', 'web', 'config']) scan(path);
for (const name of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'scripts/build-state.mjs',
])
  digest.update(name).update(readFileSync(resolve(root, name)));
const hash = digest.digest('hex'),
  stamp = resolve(root, 'build/source-hash');
if (process.argv.includes('--write')) writeFileSync(stamp, hash + '\n');
else if (
  !existsSync(resolve(root, 'build/server/main.js')) ||
  !existsSync(resolve(root, 'dist/index.html')) ||
  !existsSync(stamp) ||
  readFileSync(stamp, 'utf8').trim() !== hash
) {
  console.error(
    'Production build is missing or outdated. Run npm ci, then npm run build, then npm start.',
  );
  process.exitCode = 1;
}
