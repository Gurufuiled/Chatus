/**
 * Builds TDLib for iOS from sources using the official TDLib iOS example scripts.
 *
 * Requirements (macOS only):
 *   - Xcode selected via xcode-select
 *   - Homebrew deps from https://github.com/tdlib/td/tree/master/example/ios
 *   - git, cmake, bash in PATH
 *
 * Output:
 *   mobile/tdlib-ios/libtdjson.xcframework
 *   mobile/tdlib-ios/include/td/telegram/td_json_client.h
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const tdlibIosRoot = path.join(mobileRoot, 'tdlib-ios');
const sourceRoot = path.join(tdlibIosRoot, 'src', 'td');
const nativeBuildRoot = path.join(sourceRoot, 'native-build');
const outputFramework = path.join(tdlibIosRoot, 'libtdjson.xcframework');
const outputInclude = path.join(tdlibIosRoot, 'include');

const TDLIB_IOS_TAG = process.env.TDLIB_IOS_TAG || 'v1.8.52';
const TDLIB_REPO = process.env.TDLIB_REPO || 'https://github.com/tdlib/td.git';
const FORCE = process.argv.includes('--force');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? mobileRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from, to) {
  await fs.promises.rm(to, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.cp(from, to, { recursive: true });
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('TDLib iOS can be built only on macOS with full Xcode installed.');
  }

  const hasFramework = await pathExists(path.join(outputFramework, 'Info.plist'));
  const hasHeaders = await pathExists(path.join(outputInclude, 'td', 'telegram', 'td_json_client.h'));
  if (!FORCE && hasFramework && hasHeaders) {
    console.log(`TDLib iOS framework already exists: ${outputFramework}`);
    console.log('Use npm run tdlib:build-ios -- --force to rebuild.');
    return;
  }
  if (!FORCE && (hasFramework || hasHeaders)) {
    console.log('TDLib iOS build artifacts are incomplete; rebuilding.');
    await fs.promises.rm(outputFramework, { recursive: true, force: true });
    await fs.promises.rm(outputInclude, { recursive: true, force: true });
  }

  await fs.promises.mkdir(path.join(tdlibIosRoot, 'src'), { recursive: true });

  if (!await pathExists(path.join(sourceRoot, '.git'))) {
    run('git', ['clone', '--depth', '1', '--branch', TDLIB_IOS_TAG, TDLIB_REPO, sourceRoot]);
  } else {
    run('git', ['fetch', '--tags', '--depth', '1', 'origin', TDLIB_IOS_TAG], { cwd: sourceRoot });
    run('git', ['checkout', TDLIB_IOS_TAG], { cwd: sourceRoot });
  }

  await fs.promises.mkdir(nativeBuildRoot, { recursive: true });
  run('cmake', ['-DTD_GENERATE_SOURCE_FILES=ON', '..'], { cwd: nativeBuildRoot });
  run('cmake', ['--build', '.'], { cwd: nativeBuildRoot });

  const iosExampleRoot = path.join(sourceRoot, 'example', 'ios');
  run('bash', ['./build-openssl.sh'], { cwd: iosExampleRoot });
  run('bash', ['./build.sh'], { cwd: iosExampleRoot });

  const builtFramework = path.join(iosExampleRoot, 'tdjson', 'libtdjson.xcframework');
  const builtInclude = path.join(iosExampleRoot, 'tdjson', 'iOS', 'include');

  if (!await pathExists(path.join(builtFramework, 'Info.plist'))) {
    throw new Error(`TDLib build finished, but XCFramework was not found at ${builtFramework}`);
  }
  if (!await pathExists(path.join(builtInclude, 'td', 'telegram', 'td_json_client.h'))) {
    throw new Error(`TDLib headers were not found at ${builtInclude}`);
  }

  await copyDir(builtFramework, outputFramework);
  await copyDir(builtInclude, outputInclude);

  console.log(`TDLib iOS ${TDLIB_IOS_TAG} ready:`);
  console.log(`  ${outputFramework}`);
  console.log(`  ${outputInclude}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
