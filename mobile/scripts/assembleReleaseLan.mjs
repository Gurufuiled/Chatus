/**
 * Release APK для LAN-теста (API / LiveKit на ПК в Wi‑Fi).
 * MOBILE_ENV=lan → app.config.js подмешивает .env.lan.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assertGradleVersionMatchesAppJson } from './assertGradleVersionMatchesAppJson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const androidDir = path.join(mobileRoot, 'android');
const envLanPath = path.join(mobileRoot, '.env.lan');

process.env.MOBILE_ENV = 'lan';

if (!fs.existsSync(envLanPath)) {
  console.error(
    '\n  Отсутствует mobile/.env.lan\n' +
      '  cp .env.lan.example .env.lan\n' +
      '  и задай EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000/api\n',
  );
  process.exit(1);
}

function resolveLanApiUrl() {
  const require = createRequire(import.meta.url);
  const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
  const configFn = require(path.join(mobileRoot, 'app.config.js'));
  const resolved = configFn({ config: appJson.expo });
  return resolved.extra?.EXPO_PUBLIC_API_URL ?? '';
}

const apiUrl = resolveLanApiUrl();
console.log(`\n  MOBILE_ENV=lan → EXPO_PUBLIC_API_URL=${apiUrl || '(пусто)'}\n`);

if (!apiUrl) {
  console.error('  В .env.lan не задан EXPO_PUBLIC_API_URL.\n');
  process.exit(1);
}

assertGradleVersionMatchesAppJson();

const isWin = process.platform === 'win32';
const gradle = isWin ? path.join(androidDir, 'gradlew.bat') : path.join(androidDir, 'gradlew');
const gradleEnv = { ...process.env, MOBILE_ENV: 'lan' };

const rebundle = spawnSync(
  gradle,
  [':app:createBundleReleaseJsAndAssets', '--rerun-tasks'],
  { cwd: androidDir, stdio: 'inherit', env: gradleEnv, shell: isWin },
);
if ((rebundle.status ?? 1) !== 0) {
  process.exit(rebundle.status ?? 1);
}

const result = spawnSync(gradle, ['assembleRelease'], {
  cwd: androidDir,
  stdio: 'inherit',
  env: gradleEnv,
  shell: isWin,
});

const code = result.status ?? 1;
if (code === 0) {
  const outApk = path.join(androidDir, 'app/build/outputs/apk/release/chatus-release.apk');
  if (fs.existsSync(outApk)) {
    const stat = fs.statSync(outApk);
    console.log(
      `\n  → ${outApk}\n  → ${(stat.size / (1024 * 1024)).toFixed(1)} MB\n  → API: ${apiUrl}\n`,
    );
  }
}
process.exit(code);
