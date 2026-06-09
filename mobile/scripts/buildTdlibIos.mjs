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

const TDLIB_REPO = process.env.TDLIB_REPO || 'https://github.com/tdlib/td.git';
const FORCE = process.argv.includes('--force');

/**
 * Official tdlib/td does not tag patch releases (only up to v1.8.0).
 * Patch versions are bumps in CMakeLists.txt on master — pin by commit hash.
 * @see https://github.com/tdlib/td/issues/1627
 */
const TDLIB_VERSION_COMMITS = {
  '1.8.52': 'b2cf7301b49d80efde1758407dec8b8bc294cac4',
  'v1.8.52': 'b2cf7301b49d80efde1758407dec8b8bc294cac4',
};

const TDLIB_IOS_VERSION = process.env.TDLIB_IOS_VERSION || '1.8.52';
const legacyTag = process.env.TDLIB_IOS_TAG;
const TDLIB_IOS_REF =
  process.env.TDLIB_IOS_REF ||
  (legacyTag ? TDLIB_VERSION_COMMITS[legacyTag] ?? legacyTag : undefined) ||
  TDLIB_VERSION_COMMITS[TDLIB_IOS_VERSION];

if (!TDLIB_IOS_REF) {
  throw new Error(
    `Unknown TDLib version "${TDLIB_IOS_VERSION}". Set TDLIB_IOS_REF to a git commit, branch, or tag.`,
  );
}

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

async function ensureTdlibSourceCheckedOut(ref) {
  const gitDir = path.join(sourceRoot, '.git');
  if (!await pathExists(gitDir)) {
    if (await pathExists(sourceRoot)) {
      throw new Error(
        `Incomplete TDLib checkout at ${sourceRoot}. Remove it and retry:\n` +
          `  rm -rf "${sourceRoot}"`,
      );
    }
    console.log(`Cloning ${TDLIB_REPO} (TDLib ${TDLIB_IOS_VERSION} @ ${ref})…`);
    run('git', ['clone', '--depth', '1', TDLIB_REPO, sourceRoot]);
    run('git', ['fetch', 'origin', ref, '--depth', '1'], { cwd: sourceRoot });
    run('git', ['checkout', ref], { cwd: sourceRoot });
    return;
  }

  run('git', ['fetch', 'origin', ref, '--depth', '1'], { cwd: sourceRoot });
  run('git', ['reset', '--hard'], { cwd: sourceRoot });
  run('git', ['clean', '-fd'], { cwd: sourceRoot });
  run('git', ['checkout', ref], { cwd: sourceRoot });
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

  await ensureTdlibSourceCheckedOut(TDLIB_IOS_REF);

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

  console.log(`TDLib iOS ${TDLIB_IOS_VERSION} (${TDLIB_IOS_REF}) ready:`);
  console.log(`  ${outputFramework}`);
  console.log(`  ${outputInclude}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
