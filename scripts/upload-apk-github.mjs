#!/usr/bin/env node
/**
 * После локальной сборки release APK: создаёт / обновляет GitHub Release и прикрепляет chatus-release.apk.
 *
 * Требуется токен GitHub с правом на Contents (репозиторий):
 *   set GITHUB_TOKEN=ghp_...   (Windows)
 *   export GITHUB_TOKEN=ghp_... (macOS/Linux)
 * Либо: gh auth login  — тогда скрипт прочитает токен из "gh auth token" при отсутствии GITHUB_TOKEN.
 *
 * Репозиторий: remote "corporate" или "origin" (github.com/owner/repo).
 *
 * Примеры (из корня репозитория):
 *   node scripts/upload-apk-github.mjs v1.0.2
 *   node scripts/upload-apk-github.mjs v1.0.2 --apk mobile/android/app/build/outputs/apk/release/chatus-release.apk
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function gitRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

function getGithubRepoSlug() {
  const env = process.env.GITHUB_REPOSITORY;
  if (env && /^[\w.-]+\/[\w.-]+$/.test(env)) return env;

  const names = ['corporate', 'origin', 'upstream'];
  for (const name of names) {
    try {
      const url = execSync(`git remote get-url ${name}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
      if (m) return `${m[1]}/${m[2]}`;
    } catch {
      /* next */
    }
  }
  throw new Error(
    'Не удалось определить owner/repo. Задай GITHUB_REPOSITORY=Owner/repo или добавь remote на github.com.'
  );
}

function getToken() {
  if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN?.trim()) return process.env.GH_TOKEN.trim();
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Нет GITHUB_TOKEN / GH_TOKEN и не найден gh auth token. Выполни: gh auth login');
  }
}

function ghHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let tag;
  let apk;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apk' && args[i + 1]) {
      apk = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith('-') && !tag) {
      tag = args[i];
    }
  }
  if (!tag) {
    console.error('Использование: node scripts/upload-apk-github.mjs <тег, например v1.0.2> [--apk путь/к.apk]');
    process.exit(1);
  }
  return { tag, apk };
}

function defaultApkPath(root) {
  const candidates = [
    path.join(root, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'chatus-release.apk'),
    path.join(root, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

async function main() {
  const { tag, apk: apkArg } = parseArgs();
  const root = gitRoot();
  const token = getToken();
  const repo = getGithubRepoSlug();
  const [owner, repoName] = repo.split('/');

  const apkPath = path.resolve(root, apkArg || defaultApkPath(root));
  if (!fs.existsSync(apkPath)) {
    console.error(`APK не найден: ${apkPath}`);
    console.error('Собери release, например: cd mobile && npm run android:release:prod');
    process.exit(1);
  }

  const base = `https://api.github.com/repos/${owner}/${repoName}`;
  const uploadBase = `https://uploads.github.com/repos/${owner}/${repoName}`;

  const getReleaseRes = await fetch(`${base}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: ghHeaders(token),
  });

  let releaseId;
  if (getReleaseRes.ok) {
    const r = await getReleaseRes.json();
    releaseId = r.id;
    console.log(`Release ${tag} уже есть (id ${releaseId}). Заменяю chatus-release.apk...`);
  } else if (getReleaseRes.status === 404) {
    const createRes = await fetch(`${base}/releases`, {
      method: 'POST',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        name: `Chatus ${tag}`,
        generate_release_notes: true,
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      throw new Error(`Создать release не удалось: ${createRes.status} ${t}`);
    }
    const r = await createRes.json();
    releaseId = r.id;
    console.log(`Создан release ${tag} (id ${releaseId}).`);
  } else {
    const t = await getReleaseRes.text();
    throw new Error(`GitHub API: ${getReleaseRes.status} ${t}`);
  }

  const relGet = await fetch(`${base}/releases/${releaseId}`, { headers: ghHeaders(token) });
  const rel = await relGet.json();
  const assets = rel.assets || [];
  const targetName = 'chatus-release.apk';
  for (const a of assets) {
    if (a.name === targetName) {
      const del = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/releases/assets/${a.id}`,
        { method: 'DELETE', headers: ghHeaders(token) }
      );
      if (!del.ok) {
        const t = await del.text();
        throw new Error(`Удалить старый asset не удалось: ${del.status} ${t}`);
      }
      console.log('Старый chatus-release.apk удалён.');
    }
  }

  const bytes = fs.readFileSync(apkPath);
  const up = await fetch(
    `${uploadBase}/releases/${releaseId}/assets?name=${encodeURIComponent(targetName)}`,
    {
      method: 'POST',
      headers: {
        ...ghHeaders(token),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
      },
      body: bytes,
    }
  );
  if (!up.ok) {
    const t = await up.text();
    throw new Error(`Загрузить APK не удалось: ${up.status} ${t}`);
  }

  const browserUrl = rel.html_url || `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;
  console.log(`Готово: ${targetName} загружен (${(bytes.length / 1024 / 1024).toFixed(2)} MB).`);
  console.log(browserUrl);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
