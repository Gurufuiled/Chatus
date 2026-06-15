import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { ChatPillHeaderTitle } from './ChatPillHeaderTitle';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';

interface CustomAndroidChatHeaderProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  isGroupChat: boolean;
  peerId: string | null;
  chatId: string;
  navigation: NativeStackNavigationProp<ChatsStackParamList, 'Chat'> | any;
  /** When set, title row opens this instead of Chatus GroupProfile / ChatProfile. */
  onTitlePress?: () => void;
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
  chatId,
  navigation,
  onTitlePress,
  telegramTitleOnly = false,
  titleNavDisabled = false,
}: CustomAndroidChatHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const openProfile = () => {
    if (isGroupChat) {
      navigation.navigate('GroupProfile', { chatId, chatTitle: title });
      return;
    }
    if (!peerId) return;
    navigation.navigate('ChatProfile', { chatId, userId: peerId, chatTitle: title });
  };

  const canOpenProfile = telegramTitleOnly
    ? onTitlePress != null
    : onTitlePress != null || isGroupChat || !!peerId;

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

        <View pointerEvents="box-none" style={styles.pillTitleRoot}>
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
  pillTitleRoot: {
    position: 'absolute',
    left: 56,
    right: 56,
    top: 5,
    bottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
