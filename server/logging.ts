import { mkdirSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { dataDir } from './base.js';
// Rotate by date/10 MiB; never auto-delete logs before the retention policy is agreed.
export function logStream(component: string) {
  const dir = join(dataDir, 'logs');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let current = '',
    size = 0,
    index = 0,
    day = '';
  return new Writable({
    write(chunk, encoding, callback) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (day !== today || size + chunk.length > 10 * 1024 * 1024) {
          day = today;
          current = join(dir, `${component}-${day}-${process.pid}-${index++}.jsonl`);
          try {
            size = statSync(current).size;
          } catch {
            size = 0;
          }
        }
        appendFileSync(current, chunk, { mode: 0o600 });
        size += chunk.length;
        callback();
      } catch (e) {
        callback(e as Error);
      }
    },
  });
}
