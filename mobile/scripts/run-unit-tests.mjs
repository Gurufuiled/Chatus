/**
 * Последовательный прогон всех тестовых файлов `*.test.ts` под каталогом `src/` через `tsx`.
 * Из каталога mobile: `npm run test` или `npm run test:unit`.
 */

import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const mobileRoot = join(__dirname, '..');

/** Не self-run: только экспорт `runDbTest` (ручной / интеграционный сценарий). */
const SKIP_RELATIVE = new Set(['src/db/db.test.ts']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, acc);
    } else if (name.endsWith('.test.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(join(mobileRoot, 'src'))
  .filter((abs) => {
    const rel = relative(mobileRoot, abs).replace(/\\/g, '/');
    return !SKIP_RELATIVE.has(rel);
  })
  .sort((a, b) =>
    relative(mobileRoot, a).localeCompare(relative(mobileRoot, b), 'en'),
  );

if (files.length === 0) {
  console.error('No *.test.ts files found under src/');
  process.exit(1);
}

for (const abs of files) {
  const label = relative(mobileRoot, abs).replace(/\\/g, '/');
  console.log(`\n━━━ ${label} ━━━\n`);
  execSync(`npx tsx "${abs}"`, {
    stdio: 'inherit',
    cwd: mobileRoot,
    env: process.env,
    shell: true,
  });
}

console.log(`\nOK — ${files.length} test file(s) passed.\n`);
