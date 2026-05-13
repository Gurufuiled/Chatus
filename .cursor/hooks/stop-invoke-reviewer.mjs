#!/usr/bin/env node
/**
 * После завершённого хода агента: если был флаг правок — авто follow-up с reviewer.
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

function tryUnlinkFlagPath(flagPath) {
  try {
    fs.unlinkSync(flagPath);
    return true;
  } catch {
    return false;
  }
}

function collectCandidateRoots() {
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

function findFlagPath() {
  const rel = path.join('.cursor', 'hooks', '.pending-review');
  for (const root of collectCandidateRoots()) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

if (parsed.status !== 'completed') {
  const p = findFlagPath();
  if (p) tryUnlinkFlagPath(p);
  process.stdout.write('{}');
  process.exit(0);
}

const flagPath = findFlagPath();
if (!flagPath) {
  process.stdout.write('{}');
  process.exit(0);
}

tryUnlinkFlagPath(flagPath);

const followup_message = [
  '[Системно: после правок кода]',
  '',
  'Сразу вызови Task с `subagent_type`: `"reviewer"` по инструкциям из `@.cursor/agents/reviewer.md` (не передавай параметр `model` в Task).',
  'Проаудируй изменённые в последней итерации файлы; устрани все 🔴 Critical и 🟡 Warning или кратко зафиксируй причину отказа.',
  'После этого — короткий итог пользователю.',
].join('\n');

process.stdout.write(JSON.stringify({ followup_message }));
process.exit(0);
