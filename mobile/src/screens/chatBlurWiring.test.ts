/**
 * Контрактный тест: оба экрана чата обязаны передавать `blurTargetRef` в композер (InputBar / ChatInputDock).
 * Без него окно записи видеокружка на Android остаётся без блюра (expo-blur отключает размытие при отсутствии
 * цели) и показывает плоскую заливку — именно это было в Telegram-чате.
 * Проверяем по исходникам, потому что сами экраны слишком тяжёлые для юнит-рендера.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function composerElement(file: string, tag: string): string {
  const source = readFileSync(join(__dirname, file), 'utf8');
  const start = source.indexOf(`<${tag}`);
  assert.ok(start >= 0, `${file}: не найден <${tag}`);
  // тело элемента: до первого "/>" на нулевом уровне вложенности скобок {}
  let depth = 0;
  for (let i = start; i < source.length - 1; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (depth === 0 && ch === '/' && source[i + 1] === '>') return source.slice(start, i + 2);
  }
  throw new Error(`${file}: не найден конец <${tag} />`);
}

// обычный чат собирает композер через ChatInputDock (он пробрасывает цель в InputBar), Telegram — через InputBar
const composers: Array<[string, string]> = [
  ['ChatScreen.tsx', 'ChatInputDock'],
  ['TelegramChatScreen.tsx', 'InputBar'],
];
for (const [file, tag] of composers) {
  const element = composerElement(file, tag);
  assert.match(element, /blurTargetRef=\{blurTargetRef\}/, `${file}: <${tag}> без blurTargetRef`);
}

// и сам экран создаёт цель размытия, которую передаёт
for (const file of ['ChatScreen.tsx', 'TelegramChatScreen.tsx']) {
  const source = readFileSync(join(__dirname, file), 'utf8');
  assert.match(source, /<BlurTargetView[^>]*ref=\{blurTargetRef\}/s, `${file}: нет BlurTargetView с blurTargetRef`);
}

console.log('chatBlurWiring.test.ts: ok');
