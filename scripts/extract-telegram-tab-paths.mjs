import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(
  __dirname,
  '../Improvements/telegram-android-ref/TMessagesProj/src/main/res/drawable',
);

function extract(file) {
  const x = fs.readFileSync(path.join(base, file), 'utf8');
  const ft = (x.match(/fillType="([^"]+)"/) ?? [])[1] ?? 'nonZero';
  const m = x.match(/android:pathData="([^"]+)"/);
  if (!m) throw new Error(`No pathData in ${file}`);
  const d = m[1].replace(/\s+/g, ' ').trim();
  const fillRule = ft.toLowerCase() === 'evenodd' ? 'evenodd' : 'nonzero';
  return { d, fillRule };
}

const map = {
  contacts: { inactive: extract('tabs_contacts_24.xml'), active: extract('tabs_contact_active_24.xml') },
  chats: { inactive: extract('tabs_chats_24.xml'), active: extract('tabs_chats_active_24.xml') },
  settings: {
    inactive: extract('outline_profile_settings.xml'),
    active: extract('filled_profile_settings.xml'),
  },
};

function esc(s) {
  return JSON.stringify(s);
}

const body = `import type { TelegramGlyphFillRule } from './TelegramGlyph';

export type TabGlyph = { d: string; fillRule: TelegramGlyphFillRule };

/** Paths from Telegram Android tabs_* and profile settings vectors. */
export const TELEGRAM_TAB_GLYPHS = {
  contacts: {
    inactive: { d: ${esc(map.contacts.inactive.d)}, fillRule: ${esc(map.contacts.inactive.fillRule)} as TelegramGlyphFillRule },
    active: { d: ${esc(map.contacts.active.d)}, fillRule: ${esc(map.contacts.active.fillRule)} as TelegramGlyphFillRule },
  },
  chats: {
    inactive: { d: ${esc(map.chats.inactive.d)}, fillRule: ${esc(map.chats.inactive.fillRule)} as TelegramGlyphFillRule },
    active: { d: ${esc(map.chats.active.d)}, fillRule: ${esc(map.chats.active.fillRule)} as TelegramGlyphFillRule },
  },
  settings: {
    inactive: { d: ${esc(map.settings.inactive.d)}, fillRule: ${esc(map.settings.inactive.fillRule)} as TelegramGlyphFillRule },
    active: { d: ${esc(map.settings.active.d)}, fillRule: ${esc(map.settings.active.fillRule)} as TelegramGlyphFillRule },
  },
} as const;
`;

fs.writeFileSync(path.join(__dirname, '../mobile/src/icons/telegram/tabPaths.ts'), body);
console.log('Wrote mobile/src/icons/telegram/tabPaths.ts');
