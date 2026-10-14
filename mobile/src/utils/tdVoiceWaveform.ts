/**
 * Дорожка голосового в формате Telegram/TDLib: значения 0…31 по 5 бит, упакованы подряд (младшие биты первыми,
 * порядок байт little-endian), весь массив — base64. Чистая логика: покрыта тестами в `tdVoiceWaveform.test.ts`.
 *
 * Раньше приложение читало каждый байт как отдельное значение (`byte / 31`): от упакованных 5-битных данных
 * получались значения до 8 и «забитая» дорожка у голосовых из Telegram. А при отправке дорожка вообще не
 * передавалась, и у получателя рисовалась заглушка.
 */

const TD_WAVEFORM_MAX = 31;
/** Telegram хранит не больше ~100 значений. */
export const TD_WAVEFORM_MAX_SAMPLES = 100;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(value: string): Uint8Array | null {
  const clean = value.replace(/[\r\n\s]/g, '').replace(/=+$/, '');
  if (clean.length === 0) return new Uint8Array(0);
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const idx = BASE64_ALPHABET.indexOf(clean[i]);
    if (idx < 0) return null;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(bytes);
}

/** Упаковывает значения 0..1 в 5-битный формат TDLib. Пустой вход → пустая строка. */
export function encodeTdWaveform(samples: readonly number[] | null | undefined): string {
  const values = (samples ?? []).slice(0, TD_WAVEFORM_MAX_SAMPLES);
  if (values.length === 0) return '';
  // запись второго байта за границей типизированного массива молча игнорируется — для последнего значения это норма
  const bytes = new Uint8Array(Math.ceil((values.length * 5) / 8));
  values.forEach((sample, index) => {
    const value = Math.round(clamp01(sample) * TD_WAVEFORM_MAX);
    const bitIndex = index * 5;
    const byteIndex = bitIndex >> 3;
    const shift = bitIndex & 7;
    const shifted = value << shift;
    bytes[byteIndex] |= shifted & 0xff;
    bytes[byteIndex + 1] |= (shifted >> 8) & 0xff;
  });
  return bytesToBase64(bytes);
}

/** Распаковывает дорожку TDLib (base64) в значения 0..1. Некорректные данные → пустой массив. */
export function decodeTdWaveform(base64: string | null | undefined): number[] {
  if (!base64 || typeof base64 !== 'string') return [];
  const bytes = base64ToBytes(base64);
  if (!bytes || bytes.length === 0) return [];
  const count = Math.floor((bytes.length * 8) / 5);
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const bitIndex = index * 5;
    const byteIndex = bitIndex >> 3;
    const shift = bitIndex & 7;
    const low = bytes[byteIndex] ?? 0;
    const high = bytes[byteIndex + 1] ?? 0;
    const value = ((low | (high << 8)) >> shift) & 0x1f;
    out.push(value / TD_WAVEFORM_MAX);
  }
  return out;
}
