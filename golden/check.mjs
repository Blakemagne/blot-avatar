// The golden check: run frames.mjs on this package's engine, hash what it writes, and compare with
// frames.sha256 (frozen on the engine before it was moved into this package). Non-zero exit on a mismatch.
//   npm run golden                     (about 75 s; it writes some 210 MB to the temp folder and deletes it)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const want = Object.fromEntries(readFileSync(join(here, 'frames.sha256'), 'utf8').trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).reverse()));
const dir = mkdtempSync(join(tmpdir(), 'avatar-golden-'));
const paths = join(dir, 'paths.json'), state = join(dir, 'state.txt');

const hash = (file) => new Promise((resolve, reject) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
});

let failed = false;
try {
  const r = spawnSync(process.execPath, ['--import', 'tsx', join(here, 'frames.mjs'), join(here, '..', 'src', 'engine', 'index.ts'), paths, state], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`frames.mjs exited ${r.status ?? r.signal}`);
  for (const [name, file] of [['paths', paths], ['state', state]]) {
    const got = await hash(file);
    const ok = got === want[name];
    if (!ok) failed = true;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${got}${ok ? '' : ` (want ${want[name]})`}`);
  }
} catch (e) {
  failed = true;
  console.error(`FAIL ${e.message}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
