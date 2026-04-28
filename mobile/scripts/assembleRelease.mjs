/**
 * Release APK без установки на устройство (только Gradle assembleRelease).
 * MOBILE_ENV=production — чтобы export:embed подтянул app.config + .env.production.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const androidDir = path.join(mobileRoot, 'android');

process.env.MOBILE_ENV = process.env.MOBILE_ENV || 'production';

const isWin = process.platform === 'win32';
const gradle = isWin ? path.join(androidDir, 'gradlew.bat') : path.join(androidDir, 'gradlew');

const result = spawnSync(gradle, ['assembleRelease'], {
  cwd: androidDir,
  stdio: 'inherit',
  env: { ...process.env },
  shell: isWin,
});

const code = result.status ?? 1;
if (code === 0) {
  const outApk = path.join(androidDir, 'app/build/outputs/apk/release/chatus-release.apk');
  if (fs.existsSync(outApk)) {
    const stat = fs.statSync(outApk);
    // eslint-disable-next-line no-console
    console.log(
      `\n  → ${outApk}\n  → ${(stat.size / (1024 * 1024)).toFixed(1)} MB\n`,
    );
  }
}
process.exit(code);
