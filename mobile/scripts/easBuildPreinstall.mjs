import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = (process.env.EAS_BUILD_PLATFORM || '').toLowerCase();

function run(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: mobileRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (platform === 'ios') {
  const fromSource = process.env.TDLIB_IOS_FROM_SOURCE === '1';
  run(fromSource ? './scripts/buildTdlibIos.mjs' : './scripts/fetchTdlibIos.mjs');
} else if (platform === 'android') {
  // Existing Android release workflow depends on fetching libtdjson.so before prebuild.
  run('./scripts/fetchTdlibAndroid.mjs');
} else {
  console.log(`Skipping TDLib preinstall: unsupported or empty EAS_BUILD_PLATFORM="${platform}"`);
}
