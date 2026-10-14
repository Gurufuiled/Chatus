/**
 * Контрактный тест верхней плашки «Голосовое / Видеосообщение» и дорожки голосового.
 *  - В Telegram-чате плашки были выключены жёстко (`activeVoiceVisible={false}`) — их нужно было подключить.
 *  - В обычных чатах плашка искала сообщение по адресу файла и теряла его, когда играл локальный кэш, —
 *    теперь пузырь передаёт ключ сообщения.
 *  - При отправке голосового в Telegram дорожка не передавалась вовсе.
 * Экраны слишком тяжёлые для юнит-рендера, поэтому проверяем исходники.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(srcRoot, rel), 'utf8');

const telegram = read('screens/TelegramChatScreen.tsx');
const chat = read('screens/ChatScreen.tsx');
const list = read('components/ChatMessageList.tsx');

// ── Telegram-чат: плашки подключены к плееру, а не выключены ──
assert.doesNotMatch(telegram, /activeVoiceVisible=\{false\}/, 'плашка голосового выключена жёстко');
assert.doesNotMatch(telegram, /activeVideoNoteVisible=\{false\}/, 'плашка кружка выключена жёстко');
assert.match(telegram, /activeVoiceVisible=\{!!activeVoiceRow\}/);
assert.match(telegram, /activeVideoNoteVisible=\{activeVideoNoteVisible\}/);
assert.match(telegram, /useVoicePlayer\(\)/);
assert.match(telegram, /useVideoNotePlayer\(\)/);
// плашка управляет плеером: пауза/продолжить, скорость, стоп
assert.match(telegram, /onToggleVoicePlayback=\{handleToggleVoiceBannerPlayback\}/);
assert.match(telegram, /onCycleVoiceRate=\{handleCycleVoiceRate\}/);
assert.match(telegram, /onStopVoice=\{handleStopVoiceBanner\}/);
assert.match(telegram, /onToggleVideoNotePlayback=\{activeVideoNote\.togglePlayback\}/);
assert.match(telegram, /onStopVideoNote=\{activeVideoNote\.stopPlayback\}/);

// все пузыри голосовых получают ключ сообщения
{
  const bubbles = telegram.match(/<VoiceBubble[\s\S]*?\/>/g) ?? [];
  assert.equal(bubbles.length, 2, 'в Telegram-чате два варианта пузыря голосового');
  for (const bubble of bubbles) assert.match(bubble, /messageKey=\{item\.id\}/);
}
assert.match(chat, /<PeerFirstVoiceBubble[\s\S]*?messageKey=\{item\.id\}/);
assert.match(list, /<PeerFirstVoiceBubble[\s\S]*?messageKey=\{bodyItem\.id\}/);

// обычный чат ищет сообщение по ключу, а не только по адресу
assert.match(chat, /findActiveVoiceMessage<Message>\(/);
assert.match(chat, /key: currentVoiceKey/);

// ── отправка голосового в Telegram несёт дорожку (5 бит, base64) ──
assert.match(telegram, /waveform: encodeTdWaveform\(result\.waveform\)/);
assert.match(telegram, /'@type': 'inputMessageVoiceNote'/);

// ── дорожка в пузыре и в профиле — общий компонент, а не свои копии ──
const bubble = read('components/VoiceBubble.tsx');
assert.match(bubble, /<VoiceWaveform/);
assert.doesNotMatch(bubble, /buildTelegramLikeBars|VOICE_BAR_COUNT/, 'старая плотная дорожка вернулась');
assert.match(read('components/ChatProfileMediaSection.tsx'), /<VoiceWaveform/);
assert.match(read('components/group-profile/GroupProfileMediaContent.tsx'), /<VoiceWaveform/);

console.log('voiceBannerWiring.test.ts: ok');
