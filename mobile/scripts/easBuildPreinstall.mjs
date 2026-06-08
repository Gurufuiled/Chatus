import { spawnSync } from 'node:child_process';
import process from 'node:process';

const platform = (process.env.EAS_BUILD_PLATFORM || '').toLowerCase();

function run(script) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (platform === 'ios') {
  run('./scripts/buildTdlibIos.mjs');
} else if (platform === 'android') {
  // Existing Android release workflow depends on fetching libtdjson.so before prebuild.
  run('./scripts/fetchTdlibAndroid.mjs');
} else {
  console.log(`Skipping TDLib preinstall: unsupported or empty EAS_BUILD_PLATFORM="${platform}"`);
}
