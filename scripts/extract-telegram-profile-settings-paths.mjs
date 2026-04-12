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

function esc(s) {
  return JSON.stringify(s);
}

const profile = {
  callOutline: extract('outline_profile_call_24.xml'),
  callFilled: extract('filled_profile_call_24.xml'),
  search: extract('outline_search_1_24.xml'),
  bell: extract('outline_profile_mute_24.xml'),
  bellMuted: extract('outline_profile_unmute_24.xml'),
  groupAddMember: extract('outline_profile_member_24.xml'),
};

const settings = {
  account: extract('settings_account.xml'),
  sounds: extract('settings_sounds.xml'),
  privacy: extract('settings_privacy.xml'),
  data: extract('settings_data.xml'),
  chat: extract('settings_chat.xml'),
  language: extract('settings_language.xml'),
  devices: extract('settings_devices.xml'),
  security: extract('settings_security.xml'),
  power: extract('settings_power.xml'),
};

const profileBody = `import type { TelegramGlyphFillRule } from './TelegramGlyph';

export type ProfileGlyph = { d: string; fillRule: TelegramGlyphFillRule };

/** Telegram Android profile / header action vectors. */
export const TELEGRAM_PROFILE_GLYPHS = {
  callOutline: { d: ${esc(profile.callOutline.d)}, fillRule: ${esc(profile.callOutline.fillRule)} as TelegramGlyphFillRule },
  callFilled: { d: ${esc(profile.callFilled.d)}, fillRule: ${esc(profile.callFilled.fillRule)} as TelegramGlyphFillRule },
  search: { d: ${esc(profile.search.d)}, fillRule: ${esc(profile.search.fillRule)} as TelegramGlyphFillRule },
  /** Notifications on (not muted). */
  bell: { d: ${esc(profile.bell.d)}, fillRule: ${esc(profile.bell.fillRule)} as TelegramGlyphFillRule },
  /** Notifications muted (slash). */
  bellMuted: { d: ${esc(profile.bellMuted.d)}, fillRule: ${esc(profile.bellMuted.fillRule)} as TelegramGlyphFillRule },
  groupAddMember: { d: ${esc(profile.groupAddMember.d)}, fillRule: ${esc(profile.groupAddMember.fillRule)} as TelegramGlyphFillRule },
} as const;
`;

const settingsBody = `import type { TelegramGlyphFillRule } from './TelegramGlyph';

export type SettingsGlyph = { d: string; fillRule: TelegramGlyphFillRule };

/** Telegram Android settings_row vectors (literal pathData). */
export const TELEGRAM_SETTINGS_ROW_GLYPHS = {
  account: { d: ${esc(settings.account.d)}, fillRule: ${esc(settings.account.fillRule)} as TelegramGlyphFillRule },
  sounds: { d: ${esc(settings.sounds.d)}, fillRule: ${esc(settings.sounds.fillRule)} as TelegramGlyphFillRule },
  privacy: { d: ${esc(settings.privacy.d)}, fillRule: ${esc(settings.privacy.fillRule)} as TelegramGlyphFillRule },
  data: { d: ${esc(settings.data.d)}, fillRule: ${esc(settings.data.fillRule)} as TelegramGlyphFillRule },
  chat: { d: ${esc(settings.chat.d)}, fillRule: ${esc(settings.chat.fillRule)} as TelegramGlyphFillRule },
  language: { d: ${esc(settings.language.d)}, fillRule: ${esc(settings.language.fillRule)} as TelegramGlyphFillRule },
  devices: { d: ${esc(settings.devices.d)}, fillRule: ${esc(settings.devices.fillRule)} as TelegramGlyphFillRule },
  security: { d: ${esc(settings.security.d)}, fillRule: ${esc(settings.security.fillRule)} as TelegramGlyphFillRule },
  power: { d: ${esc(settings.power.d)}, fillRule: ${esc(settings.power.fillRule)} as TelegramGlyphFillRule },
} as const;
`;

fs.writeFileSync(path.join(__dirname, '../mobile/src/icons/telegram/profilePaths.ts'), profileBody);
fs.writeFileSync(path.join(__dirname, '../mobile/src/icons/telegram/settingsPaths.ts'), settingsBody);
console.log('Wrote profilePaths.ts and settingsPaths.ts');
