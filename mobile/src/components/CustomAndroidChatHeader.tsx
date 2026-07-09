import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { ChatPillHeaderTitle } from './ChatPillHeaderTitle';
import { PILL_TITLE_SIDE_INSET } from '../utils/chatHeaderRightActions';
import type { ThemeColors } from '../theme/palettes';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';

export const ANDROID_CHAT_HEADER_TOOLBAR_HEIGHT = 56;

interface CustomAndroidChatHeaderProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  isGroupChat: boolean;
  peerId: string | null;
  chatId: string;
  navigation: NativeStackNavigationProp<ChatsStackParamList, 'Chat'> | { navigate: (...args: unknown[]) => void };
  /** When set, title row opens this instead of Chatus GroupProfile / ChatProfile. */
  onTitlePress?: () => void;
  /** Telegram chat: never fall back to Chatus profile routes when `onTitlePress` is unset. */
  telegramTitleOnly?: boolean;
  titleNavDisabled?: boolean;
  floating?: boolean;
}

export function CustomAndroidChatHeader({
  title,
  subtitle,
  avatarUrl,
  isGroupChat,
  peerId,
  chatId,
  navigation,
  onTitlePress,
  telegramTitleOnly = false,
  titleNavDisabled = false,
  floating = false,
}: CustomAndroidChatHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const openProfile = () => {
    if (isGroupChat) {
      (navigation as NativeStackNavigationProp<ChatsStackParamList, 'Chat'>).navigate('GroupProfile', {
        chatId,
        chatTitle: title,
      });
      return;
    }
    if (!peerId) return;
    (navigation as NativeStackNavigationProp<ChatsStackParamList, 'Chat'>).navigate('ChatProfile', {
      chatId,
      userId: peerId,
      chatTitle: title,
    });
  };

  const canOpenProfile = telegramTitleOnly
    ? onTitlePress != null
    : onTitlePress != null || isGroupChat || !!peerId;

  return (
    <View
      style={[
        styles.root,
        floating ? styles.rootFloating : { backgroundColor: colors.toolbar },
        { paddingTop: insets.top },
      ]}
    >
      <View style={styles.toolbar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={() =>
            (navigation as NativeStackNavigationProp<ChatsStackParamList, 'Chat'>).canGoBack() &&
            (navigation as NativeStackNavigationProp<ChatsStackParamList, 'Chat'>).goBack()
          }
          hitSlop={12}
        >
          <View style={styles.backButtonPill}>
            <Feather name="arrow-left" size={24} color={colors.textPrimary} />
          </View>
        </Pressable>

        <View
          pointerEvents="box-none"
          style={[
            styles.pillTitleRoot,
            { left: PILL_TITLE_SIDE_INSET, right: PILL_TITLE_SIDE_INSET },
          ]}
        >
          <ChatPillHeaderTitle
            title={title}
            subtitle={subtitle}
            avatarUrl={avatarUrl}
            onPress={
              telegramTitleOnly
                ? onTitlePress
                : onTitlePress ?? (isGroupChat || peerId ? openProfile : undefined)
            }
            disabled={titleNavDisabled || !canOpenProfile}
            accessibilityHint="Открывает профиль"
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      width: '100%',
      zIndex: 10,
      elevation: 0,
    },
    rootFloating: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      elevation: 10,
      backgroundColor: 'transparent',
    },
    toolbar: {
      height: ANDROID_CHAT_HEADER_TOOLBAR_HEIGHT,
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
    backButtonPill: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    backButtonPressed: {
      opacity: 0.65,
    },
    pillTitleRoot: {
      position: 'absolute',
      top: 5,
      bottom: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
