import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  ChatHeaderTitle,
  GroupChatHeaderMembers,
  createChatsStackStyles,
} from '../navigation/ChatsStack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';

interface CustomAndroidChatHeaderProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  isGroupChat: boolean;
  peerId: string | null;
  currentUserId: string | null;
  chatId: string;
  members: any[] | null;
  navigation: NativeStackNavigationProp<ChatsStackParamList, 'Chat'> | any;
  /** When set, title row opens this instead of Chatus GroupProfile / ChatProfile. */
  onTitlePress?: () => void;
  onSearchPress?: () => void;
  /** Telegram chat: never fall back to Chatus profile routes when `onTitlePress` is unset. */
  telegramTitleOnly?: boolean;
  titleNavDisabled?: boolean;
}

export function CustomAndroidChatHeader({
  title,
  subtitle,
  avatarUrl,
  isGroupChat,
  peerId,
  currentUserId,
  chatId,
  members,
  navigation,
  onTitlePress,
  onSearchPress,
  telegramTitleOnly = false,
  titleNavDisabled = false,
}: CustomAndroidChatHeaderProps) {
  const { colors } = useTheme();
  const stackStyles = useMemo(() => createChatsStackStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const openProfile = () => {
    if (isGroupChat) {
      navigation.navigate('GroupProfile', { chatId, chatTitle: title });
      return;
    }
    if (!peerId) return;
    navigation.navigate('ChatProfile', { chatId, userId: peerId, chatTitle: title });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.toolbar, paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>

        <View style={stackStyles.chatHeaderTitleRoot}>
          <Pressable
            onPress={
              telegramTitleOnly
                ? onTitlePress
                : onTitlePress ?? (isGroupChat || peerId ? openProfile : undefined)
            }
            disabled={
              titleNavDisabled ||
              (telegramTitleOnly ? !onTitlePress : onTitlePress == null && !isGroupChat && !peerId)
            }
            style={({ pressed }) => [
              stackStyles.headerTitlePressable,
              stackStyles.chatHeaderTitlePressableFlex,
              pressed &&
                !titleNavDisabled &&
                (telegramTitleOnly
                  ? onTitlePress != null
                  : onTitlePress != null || isGroupChat || peerId) &&
                stackStyles.headerPressablePressed,
            ]}
          >
            <ChatHeaderTitle
              title={title}
              subtitle={subtitle}
              avatarUrl={avatarUrl}
              stackStyles={stackStyles}
            />
          </Pressable>
          {isGroupChat && members && members.length > 0 ? (
            <GroupChatHeaderMembers
              members={members as any}
              currentUserId={currentUserId}
              chatId={chatId}
              navigation={navigation as any}
              stackStyles={stackStyles}
              headerBorderColor={colors.toolbar}
            />
          ) : null}
        </View>

        {onSearchPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Поиск в чате"
            onPress={onSearchPress}
            hitSlop={10}
            style={({ pressed }) => [styles.searchButton, pressed && styles.backButtonPressed]}
          >
            <Feather name="search" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    zIndex: 10,
    elevation: 0,
  },
  toolbar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  backButton: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonPressed: {
    opacity: 0.5,
  },
  searchButton: {
    width: 44,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
