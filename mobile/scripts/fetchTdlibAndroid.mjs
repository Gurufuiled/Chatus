/**
 * Скачивает предсобранный libtdjson.so (все ABI) в mobile/tdlib-android/jniLibs/
 * (в git не входит). При `expo prebuild` плагин withTdlibNative копирует их в android/app/src/main/jniLibs/.
 *
 * Источник: https://github.com/up9cloud/android-libtdjson/releases (тег = версия TDLib)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const jniDest = path.join(mobileRoot, 'tdlib-android', 'jniLibs');
const destParent = path.join(mobileRoot, 'tdlib-android');

/** Пин под JsonClient / JNI из того же релиза */
const TDLIB_ANDROID_TAG = 'v1.8.52';
const DOWNLOAD_URL = `https://github.com/up9cloud/android-libtdjson/releases/download/${TDLIB_ANDROID_TAG}/jniLibs.tar.gz`;

const isWin = process.platform === 'win32';

async function syncJniLibsIntoAndroidProject() {
  const androidJni = path.join(mobileRoot, 'android', 'app', 'src', 'main', 'jniLibs');
  if (!fs.existsSync(path.join(mobileRoot, 'android', 'app', 'src', 'main'))) return;
  await fs.promises.mkdir(path.dirname(androidJni), { recursive: true });
  await fs.promises.cp(jniDest, androidJni, { recursive: true });
}

async function main() {
  const hasSo =
    fs.existsSync(path.join(jniDest, 'arm64-v8a', 'libtdjson.so')) ||
    fs.existsSync(path.join(jniDest, 'armeabi-v7a', 'libtdjson.so'));
  if (hasSo && process.argv.includes('--force')) {
    await fs.promises.rm(jniDest, { recursive: true, force: true });
  } else if (hasSo && !process.argv.includes('--force')) {
    // eslint-disable-next-line no-console
    console.log(`jniLibs уже есть: ${jniDest}\n  (перезапись: node ./scripts/fetchTdlibAndroid.mjs --force)\n`);
    await syncJniLibsIntoAndroidProject();
    return;
  }

  await fs.promises.mkdir(destParent, { recursive: true });
  const tmpDir = await fs.promises.mkdtemp(path.join(mobileRoot, '.tdlib-fetch-'));
  const tgz = path.join(tmpDir, 'jniLibs.tar.gz');

  // eslint-disable-next-line no-console
  console.log('Downloading', DOWNLOAD_URL);
  const res = await fetch(DOWNLOAD_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(tgz, buf);

  const tarArgs = ['-xzf', tgz, '-C', destParent];
  const r = spawnSync('tar', tarArgs, { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    throw new Error('tar extract failed (нужен tar в PATH, в Windows 10+ обычно есть)');
  }

  await fs.promises.rm(tmpDir, { recursive: true, force: true });

  await syncJniLibsIntoAndroidProject();

  // eslint-disable-next-line no-console
  console.log(`\n  → ${path.join(jniDest, 'arm64-v8a', 'libtdjson.so')} (и остальные ABI)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
