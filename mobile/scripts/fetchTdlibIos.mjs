/**
 * Скачивает предсобранный libtdjson.xcframework в mobile/tdlib-ios/
 * (в git не входит). Аналог fetchTdlibAndroid.mjs.
 *
 * Источник: https://github.com/up9cloud/ios-libtdjson/releases (тег = версия TDLib)
 * ~40 MB вместо ~10 GB сборки из исходников (cmake + OpenSSL + td clone).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const tdlibIosRoot = path.join(mobileRoot, 'tdlib-ios');
const outputFramework = path.join(tdlibIosRoot, 'libtdjson.xcframework');
const outputInclude = path.join(tdlibIosRoot, 'include');
const headerDir = path.join(outputInclude, 'td', 'telegram');
const headerFile = path.join(headerDir, 'td_json_client.h');
const exportHeaderFile = path.join(headerDir, 'tdjson_export.h');

/** Пин под iOS prebuild up9cloud/ios-libtdjson v1.8.52 (тот же тег, что Android). */
const TDLIB_IOS_TAG = process.env.TDLIB_IOS_TAG;
if (!TDLIB_IOS_TAG) {
  throw new Error(
    'No prebuilt TDLib is approved for iOS production. Run "npm run tdlib:build-ios" (TDLib 1.8.66), or explicitly set TDLIB_IOS_TAG only for legacy debugging.',
  );
}
const FRAMEWORK_URL = `https://github.com/up9cloud/ios-libtdjson/releases/download/${TDLIB_IOS_TAG}/libtdjson.xcframework.tar.gz`;
/** Минимальный размер tarball (~30 MB); защита от обрезанной загрузки */
const MIN_FRAMEWORK_TGZ_BYTES = 30 * 1024 * 1024;

/** Коммит tdlib/td, на котором собран up9cloud/ios-libtdjson v1.8.52 */
const TDLIB_HEADER_COMMIT =
  process.env.TDLIB_IOS_HEADER_COMMIT || '4269f54e16b9cf564efc2db5bcd29743a2eec6ee';
const HEADER_URL = `https://raw.githubusercontent.com/tdlib/td/${TDLIB_HEADER_COMMIT}/td/telegram/td_json_client.h`;

const isWin = process.platform === 'win32';

/** Stub для компиляции bridge против уже собранного dylib (файл генерируется cmake при сборке TDLib). */
const TDJSON_EXPORT_STUB = `\
#ifndef TDJSON_EXPORT_H
#define TDJSON_EXPORT_H
#define TDJSON_EXPORT
#define TDJSON_NO_EXPORT
#endif
`;

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  // eslint-disable-next-line no-console
  console.log('Downloading', url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_FRAMEWORK_TGZ_BYTES) {
    throw new Error(
      `Download too small (${buf.length} bytes, expected >= ${MIN_FRAMEWORK_TGZ_BYTES}): ${url}`,
    );
  }
  await fs.promises.writeFile(dest, buf);
}

async function extractFramework(tgz, destDir) {
  await fs.promises.mkdir(destDir, { recursive: true });
  const tarArgs = ['-xzf', tgz, '-C', destDir];
  const r = spawnSync('tar', tarArgs, { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    throw new Error('tar extract failed (нужен tar в PATH)');
  }

  const direct = path.join(destDir, 'libtdjson.xcframework', 'Info.plist');
  if (await pathExists(direct)) {
    return path.join(destDir, 'libtdjson.xcframework');
  }

  const entries = await fs.promises.readdir(destDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.xcframework')) continue;
    const candidate = path.join(destDir, entry.name);
    if (await pathExists(path.join(candidate, 'Info.plist'))) {
      return candidate;
    }
  }

  throw new Error(`XCFramework not found after extracting ${tgz}`);
}

async function ensureHeaders() {
  await fs.promises.mkdir(headerDir, { recursive: true });

  if (!(await pathExists(headerFile))) {
    const res = await fetch(HEADER_URL);
    if (!res.ok) {
      throw new Error(`Failed to download ${HEADER_URL}: HTTP ${res.status}`);
    }
    await fs.promises.writeFile(headerFile, Buffer.from(await res.arrayBuffer()));
  }

  if (!(await pathExists(exportHeaderFile))) {
    await fs.promises.writeFile(exportHeaderFile, TDJSON_EXPORT_STUB, 'utf8');
  }
}

async function main() {
  const hasFramework = await pathExists(path.join(outputFramework, 'Info.plist'));
  const hasHeaders = await pathExists(headerFile);
  const force = process.argv.includes('--force');

  if (hasFramework && hasHeaders && !force) {
    // eslint-disable-next-line no-console
    console.log(
      `TDLib iOS prebuilt already exists:\n` +
        `  ${outputFramework}\n` +
        `  ${headerFile}\n` +
        `  (перезапись: node ./scripts/fetchTdlibIos.mjs --force)\n`,
    );
    return;
  }

  if (force) {
    await fs.promises.rm(outputFramework, { recursive: true, force: true });
    await fs.promises.rm(outputInclude, { recursive: true, force: true });
  }

  await fs.promises.mkdir(tdlibIosRoot, { recursive: true });
  const tmpDir = await fs.promises.mkdtemp(path.join(mobileRoot, '.tdlib-fetch-ios-'));
  const tgz = path.join(tmpDir, 'libtdjson.xcframework.tar.gz');
  const extractDir = path.join(tmpDir, 'extract');

  try {
    await download(FRAMEWORK_URL, tgz);
    const extracted = await extractFramework(tgz, extractDir);

    if (extracted !== outputFramework) {
      await fs.promises.rm(outputFramework, { recursive: true, force: true });
      await fs.promises.cp(extracted, outputFramework, { recursive: true });
    }

    await ensureHeaders();
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }

  // eslint-disable-next-line no-console
  console.log(`\nTDLib iOS ${TDLIB_IOS_TAG} ready:`);
  // eslint-disable-next-line no-console
  console.log(`  ${outputFramework}`);
  // eslint-disable-next-line no-console
  console.log(`  ${outputInclude}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
