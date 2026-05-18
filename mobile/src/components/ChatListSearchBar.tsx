import React from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import type { ChatListStyleSet } from '../screens/chatList.styles';

type ChatListSearchBarProps = {
  listStyles: ChatListStyleSet;
  iconColor: string;
  placeholderColor: string;
  accentColor: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  isSearching?: boolean;
};

export function ChatListSearchBar({
  listStyles,
  iconColor,
  placeholderColor,
  accentColor,
  placeholder,
  value,
  onChangeText,
  isSearching = false,
}: ChatListSearchBarProps) {
  const searchG = TELEGRAM_PROFILE_GLYPHS.search;
  return (
    <View style={listStyles.searchRow}>
      <View style={listStyles.searchIconSlot} accessibilityLabel="Search">
        <TelegramGlyph
          d={searchG.d}
          fillRule={searchG.fillRule}
          color={iconColor}
          size={22}
        />
      </View>
      <TextInput
        style={listStyles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {isSearching ? (
        <ActivityIndicator size="small" color={accentColor} style={listStyles.searchLoader} />
      ) : null}
    </View>
  );
}
