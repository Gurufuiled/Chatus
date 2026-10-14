/**
 * Контрактный тест: кружок в Telegram обязан обрезаться до квадрата ДО отправки в TDLib. Иначе Telegram получает
 * прямоугольный файл (камера пишет 4:3 / 16:9) и показывает его обычным видеороликом, а не кружком.
 * Экран слишком тяжёлый для юнит-рендера, поэтому проверяем порядок вызовов по исходникам.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(__dirname, '..');

function functionBody(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `не найден фрагмент: ${marker}`);
  const open = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`не найден конец: ${marker}`);
}

const cases: Array<{ file: string; marker: string; label: string }> = [
  { file: 'screens/TelegramChatScreen.tsx', marker: 'const sendVideoNote = useCallback(', label: 'Telegram-чат' },
  { file: 'hooks/useTelegramChatBridge.ts', marker: 'const sendVideoNote = async (', label: 'мост Telegram' },
];

for (const { file, marker, label } of cases) {
  const source = readFileSync(join(srcRoot, file), 'utf8');
  assert.match(source, /from '(\.\.\/)+services\/VideoNoteSquareService'/, `${label}: нет импорта обрезки`);
  const body = functionBody(source, marker);

  const square = body.indexOf('ensureSquareVideoNote(');
  const probe = body.indexOf('probeLocalVideoDimensionsWithRetry(');
  const build = body.indexOf('buildInputMessageVideoNoteContent(');
  const send = body.indexOf("'@type': 'sendMessage'");
  assert.ok(square >= 0, `${label}: sendVideoNote не вызывает ensureSquareVideoNote`);
  assert.ok(square < probe, `${label}: размер надо измерять уже у квадратного файла`);
  assert.ok(square < build, `${label}: содержимое сообщения собирается из квадратного файла`);
  assert.ok(square < send, `${label}: обрезка должна быть до отправки в TDLib`);
}

// в Telegram-чате: пузырь появляется сразу (оптимистичное сообщение), а не после обрезки
{
  const source = readFileSync(join(srcRoot, 'screens/TelegramChatScreen.tsx'), 'utf8');
  const body = functionBody(source, 'const sendVideoNote = useCallback(');
  assert.ok(
    body.indexOf('upsertMessage(prev, optimistic)') < body.indexOf('ensureSquareVideoNote('),
    'пузырь должен появиться до обрезки, иначе несколько секунд после записи ничего не происходит',
  );
  // провалы после появления пузыря помечают его неотправленным
  assert.match(body, /markFailed\(/);
}

console.log('telegramVideoNoteWiring.test.ts: ok');
