#!/usr/bin/env node
/**
 * Ставит флаг «нужен reviewer» после правок кода.
 * Срабатывает от:
 * - `afterFileEdit` (главный путь в Cursor — после правки файла агентом)
 * - `postToolUse` для инструментов, которые меняют файлы (запасной путь)
 */
import fs from 'node:fs';
import path from 'node:path';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf8');

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  process.stdout.write('{}');
  process.exit(0);
}

/** Инструменты, которые почти никогда не меняют файлы проекта — не ставим флаг. */
const SKIP_POST_TOOL = /^(Read|Grep|Glob|SemanticSearch|WebSearch|WebFetch|ListMcpResources|FetchMcpResource|AskQuestion|SwitchMode|TodoWrite|call_mcp_tool)$/i;

function findWorkspaceRootFromFile(filePath) {
  const norm = path.normalize(filePath);
  let dir = path.dirname(norm);
  for (let i = 0; i < 32; i += 1) {
    const git = path.join(dir, '.git');
    const hooksJson = path.join(dir, '.cursor', 'hooks.json');
    if (fs.existsSync(git) || fs.existsSync(hooksJson)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveWorkspaceRoots() {
  const roots = [];
  if (Array.isArray(parsed.workspace_roots)) {
    for (const r of parsed.workspace_roots) {
      if (typeof r === 'string' && r.trim()) roots.push(path.normalize(r.trim()));
    }
  }
  if (typeof parsed.cwd === 'string' && parsed.cwd.trim()) {
    roots.push(path.normalize(parsed.cwd.trim()));
  }
  roots.push(path.normalize(process.cwd()));
  return [...new Set(roots)];
}

function writeFlag(workspaceRoot, reason) {
  const flag = path.join(workspaceRoot, '.cursor', 'hooks', '.pending-review');
  try {
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    fs.writeFileSync(
      flag,
      JSON.stringify({ ts: Date.now(), reason, cwd: workspaceRoot }, null, 0),
      'utf8',
    );
  } catch (e) {
    console.error('[flag-pending-review]', e);
  }
}

// 1) afterFileEdit — приоритетный сценарий Cursor
if (typeof parsed.file_path === 'string' && parsed.file_path.trim()) {
  const filePath = path.normalize(parsed.file_path.trim());
  const rootFromFile = findWorkspaceRootFromFile(filePath);
  const roots = resolveWorkspaceRoots();
  const workspaceRoot = rootFromFile ?? roots[0] ?? process.cwd();
  writeFlag(workspaceRoot, 'afterFileEdit');
  process.stdout.write('{}');
  process.exit(0);
}

// 2) postToolUse — только если похоже на запись/удаление/редактирование
const tool = String(parsed.tool_name ?? '');
if (!tool) {
  process.stdout.write('{}');
  process.exit(0);
}
if (SKIP_POST_TOOL.test(tool)) {
  process.stdout.write('{}');
  process.exit(0);
}

// Разрешаем известные «файловые» имена + всё с write/patch/delete в имени (на будущее)
const ALLOW =
  /write|delete|edit|patch|notebook|strreplace|apply|save|file/i.test(tool) ||
  /^(Write|StrReplace|Delete|EditNotebook)$/i.test(tool);

if (!ALLOW) {
  process.stdout.write('{}');
  process.exit(0);
}

const roots = resolveWorkspaceRoots();
const workspaceRoot = roots[0] ?? process.cwd();
writeFlag(workspaceRoot, `postToolUse:${tool}`);

process.stdout.write('{}');
process.exit(0);
