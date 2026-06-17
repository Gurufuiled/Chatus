import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';

export type ProfileActionIconName = 'call' | 'video' | 'sound' | 'search' | 'more';

type ProfileActionIconProps = {
  name: ProfileActionIconName;
  size?: number;
  color?: string;
  active?: boolean;
};

/**
 * Quick actions в шапке профиля: солидные (filled) иконки в стиле Telegram.
 */
export function ProfileActionIcon({
  name,
  size = 20,
  color = colors.accent,
  active = false,
}: ProfileActionIconProps) {
  switch (name) {
    case 'call':
      return <MaterialCommunityIcons name="phone" size={size} color={color} />;
    case 'video':
      return <MaterialCommunityIcons name="video" size={size} color={color} />;
    case 'sound':
      return <MaterialCommunityIcons name={active ? "bell-off" : "bell"} size={size} color={color} />;
    case 'search':
      return <MaterialCommunityIcons name="magnify" size={size} color={color} />;
    case 'more':
      return <MaterialCommunityIcons name="dots-horizontal" size={size} color={color} />;
    default:
      return null;
  }
}
