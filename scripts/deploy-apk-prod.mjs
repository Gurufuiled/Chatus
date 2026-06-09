#!/usr/bin/env node
/**
 * Copy a built release APK into server/public/downloads/ for self-hosted serving.
 * Optionally upload to VPS via scp (requires OpenSSH client).
 *
 * Examples (from repo root):
 *   node scripts/deploy-apk-prod.mjs
 *   node scripts/deploy-apk-prod.mjs --apk mobile/android/app/build/outputs/apk/release/chatus-release.apk
 *   node scripts/deploy-apk-prod.mjs --scp root@messenger.startapus.com:/root/chatus/server/public/downloads/
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_NAME = 'chatus-release.apk';

function gitRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let apk;
  let scpDest;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apk' && args[i + 1]) {
      apk = args[i + 1];
      i += 1;
    } else if (args[i] === '--scp' && args[i + 1]) {
      scpDest = args[i + 1];
      i += 1;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage:
  node scripts/deploy-apk-prod.mjs [--apk path/to/chatus-release.apk] [--scp user@host:/remote/dir/]

Copies APK to server/public/downloads/${TARGET_NAME} locally.
With --scp, also uploads to the remote directory (trailing slash recommended).`);
      process.exit(0);
    }
  }
  return { apk, scpDest };
}

function defaultApkPath(root) {
  const candidates = [
    path.join(root, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', TARGET_NAME),
    path.join(root, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function main() {
  const { apk: apkArg, scpDest } = parseArgs();
  const root = gitRoot();
  const apkSrc = path.resolve(root, apkArg || defaultApkPath(root));

  if (!fs.existsSync(apkSrc)) {
    console.error(`APK not found: ${apkSrc}`);
    console.error('Build release first: cd mobile && npm run android:release:prod');
    process.exit(1);
  }

  const destDir = path.join(root, 'server', 'public', 'downloads');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, TARGET_NAME);
  fs.copyFileSync(apkSrc, destPath);

  const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(2);
  console.log(`Copied to ${destPath} (${sizeMb} MB)`);
  console.log(`Local URL: http://localhost:4000/downloads/${TARGET_NAME}`);
  console.log(`Production: https://messenger.startapus.com/downloads/${TARGET_NAME}`);

  if (scpDest) {
    const remotePath = scpDest.endsWith('/') ? `${scpDest}${TARGET_NAME}` : scpDest;
    console.log(`Uploading via scp to ${remotePath} ...`);
    const result = spawnSync('scp', [destPath, remotePath], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error('scp failed. Ensure OpenSSH is installed and the remote path exists.');
      process.exit(result.status || 1);
    }
    console.log('Upload complete. If using Docker, ensure public/downloads is mounted or restart api container.');
  } else {
    console.log('\nTo upload to VPS:');
    console.log(`  node scripts/deploy-apk-prod.mjs --scp root@<VPS>:/path/to/chatus/server/public/downloads/`);
  }
}

main();
