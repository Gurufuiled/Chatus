/**
 * Release APK без установки на устройство (только Gradle assembleRelease).
 * MOBILE_ENV=production — app.config.js подмешивает .env.production поверх .env.
 * Перед assembleRelease принудительно пересобираем JS-бандл (createBundle… --rerun-tasks),
 * иначе Gradle может вшить старый бандл с dev EXPO_PUBLIC_API_URL из .env.
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
const envProductionPath = path.join(mobileRoot, '.env.production');

process.env.MOBILE_ENV = 'production';

if (!fs.existsSync(envProductionPath)) {
  // eslint-disable-next-line no-console
  console.error(
    '\n  Отсутствует mobile/.env.production\n' +
      '  cp .env.production.example .env.production\n' +
      '  и задай EXPO_PUBLIC_API_URL на прод VPS.\n',
  );
  process.exit(1);
}

function resolveProdApiUrl() {
  const require = createRequire(import.meta.url);
  const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
  const configFn = require(path.join(mobileRoot, 'app.config.js'));
  const resolved = configFn({ config: appJson.expo });
  return resolved.extra?.EXPO_PUBLIC_API_URL ?? '';
}

const apiUrl = resolveProdApiUrl();
// eslint-disable-next-line no-console
console.log(`\n  MOBILE_ENV=production → EXPO_PUBLIC_API_URL=${apiUrl || '(пусто)'}\n`);

if (!apiUrl) {
  // eslint-disable-next-line no-console
  console.error('  В .env.production не задан EXPO_PUBLIC_API_URL.\n');
  process.exit(1);
}

if (/^(https?:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.0\.0\.1|localhost)/i.test(apiUrl)) {
  // eslint-disable-next-line no-console
  console.error(
    `  Прод-сборка, но API указывает на локальную сеть: ${apiUrl}\n` +
      '  Исправь mobile/.env.production (см. .env.production.example).\n',
  );
  process.exit(1);
}

assertGradleVersionMatchesAppJson();

const tdlibFetch = spawnSync(process.execPath, [path.join(__dirname, 'fetchTdlibAndroid.mjs')], {
  cwd: mobileRoot,
  stdio: 'inherit',
  env: process.env,
});
if ((tdlibFetch.status ?? 1) !== 0) {
  process.exit(tdlibFetch.status ?? 1);
}

const isWin = process.platform === 'win32';
const gradle = isWin ? path.join(androidDir, 'gradlew.bat') : path.join(androidDir, 'gradlew');
const gradleEnv = { ...process.env, MOBILE_ENV: 'production' };

/** Пересобрать JS с app.config + .env.production (Gradle иначе может взять старый бандл). */
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
    // eslint-disable-next-line no-console
    console.log(
      `\n  → ${outApk}\n  → ${(stat.size / (1024 * 1024)).toFixed(1)} MB\n  → API: ${apiUrl}\n`,
    );
  }
}
process.exit(code);
