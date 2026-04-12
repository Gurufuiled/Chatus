import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import { colors } from '../theme/colors';

export type ProfileActionIconName = 'call' | 'sound' | 'search' | 'more';

type ProfileActionIconProps = {
  name: ProfileActionIconName;
  size?: number;
  color?: string;
  active?: boolean;
};

/**
 * Quick actions в шапке профиля: глифы из Telegram Android (`outline_profile_*`, `outline_search_1_24`).
 * `more` — см. docs/telegram-icon-divergences.md (упрощённые три точки).
 */
export function ProfileActionIcon({
  name,
  size = 20,
  color = colors.accent,
  active = false,
}: ProfileActionIconProps) {
  switch (name) {
    case 'call': {
      const g = active ? TELEGRAM_PROFILE_GLYPHS.callFilled : TELEGRAM_PROFILE_GLYPHS.callOutline;
      return <TelegramGlyph d={g.d} fillRule={g.fillRule} color={color} size={size} />;
    }
    case 'sound': {
      const g = active ? TELEGRAM_PROFILE_GLYPHS.bellMuted : TELEGRAM_PROFILE_GLYPHS.bell;
      return <TelegramGlyph d={g.d} fillRule={g.fillRule} color={color} size={size} />;
    }
    case 'search': {
      const g = TELEGRAM_PROFILE_GLYPHS.search;
      return <TelegramGlyph d={g.d} fillRule={g.fillRule} color={color} size={size} />;
    }
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 72 72">
          <Circle cx="18" cy="36" r="4.5" fill={color} />
          <Circle cx="36" cy="36" r="4.5" fill={color} />
          <Circle cx="54" cy="36" r="4.5" fill={color} />
        </Svg>
      );
    default:
      return null;
  }
}
