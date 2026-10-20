import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
let fallo = false;
for (const f of readdirSync(dir).filter((x) => /^\d\d-.*\.mjs$/.test(x)).sort()) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) fallo = true;
}
process.exit(fallo ? 1 : 0);
