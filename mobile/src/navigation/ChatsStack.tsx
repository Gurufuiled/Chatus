import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import {
  ChannelAddAdminScreen,
  ChannelAdminPermissionsScreen,
  ChannelAdminScreen,
  ChannelCatalogScreen,
  ChannelDiscussionScreen,
  ChannelDiscussionSettingsScreen,
  ChannelMonetizationScreen,
  ChannelEditScreen,
  ChannelInviteLinksScreen,
  ChannelFeedScreen,
  ChannelLinkGateScreen,
  ChannelMembersScreen,
  ChannelProfileScreen,
  ChannelPreviewScreen,
  ChannelSettingsScreen,
  ChannelTypeScreen,
  ChatListScreen,
  ChatProfileScreen,
  ChatScreen,
  ComposeMessageScreen,
  CreateChannelScreen,
  CreateContactScreen,
  CreateGroupChatScreen,
  GroupProfileScreen,
  TelegramChatProfileScreen,
  TelegramChatScreen,
} from '../screens';
import type { ChatsStackParamList } from './types';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../presentation';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

/**
 * Telegram-style interactive back: previous screen (chat list) stays mounted and visible
 * while the chat layer is dragged (iOS native gesture + Android InteractiveChatBackShell).
 */
const CHAT_INTERACTIVE_BACK_STACK_OPTIONS = {
  presentation: 'transparentModal' as const,
  fullScreenGestureEnabled: true,
  animationMatchesGesture: true,
  fullScreenGestureShadowEnabled: true,
  contentStyle: { backgroundColor: 'transparent' },
  ...(Platform.OS === 'android'
    ? {
        animation: 'slide_from_right' as const,
        customAnimationOnSwipe: true,
        gestureEnabled: true,
        gestureDirection: 'horizontal' as const,
      }
    : {}),
} as const;

export function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

export function formatGroupSubtitle(memberCount?: number) {
  if (typeof memberCount === 'number' && memberCount > 0) {
    if (memberCount % 10 === 1 && memberCount % 100 !== 11) return `${memberCount} участник`;
    if (
      memberCount % 10 >= 2 &&
      memberCount % 10 <= 4 &&
      (memberCount % 100 < 10 || memberCount % 100 >= 20)
    ) {
      return `${memberCount} участника`;
    }
    return `${memberCount} участников`;
  }
  return 'Групповой чат';
}

function getChatPeerId(
  chat: { chat_type?: string; members?: Array<{ user_id: string }> } | null,
  currentUserId: string | null,
): string | null {
  if (!chat || !currentUserId || chat.chat_type !== 'private') return null;
  return chat.members?.find((member) => member.user_id !== currentUserId)?.user_id ?? null;
}

export function ChatHeaderTitle({
  title,
  subtitle,
  avatarUrl,
  stackStyles,
}: {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  stackStyles: ReturnType<typeof createChatsStackStyles>;
}) {
  const initial = (title.trim()[0] || '?').toUpperCase();
  return (
    <View style={stackStyles.headerRow}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={stackStyles.headerRowAvatar}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : (
        <View style={stackStyles.headerRowAvatarPlaceholder}>
          <Text style={stackStyles.headerAvatarPlaceholderText}>{initial}</Text>
        </View>
      )}
      <View style={stackStyles.headerTitleWrap}>
        <Text style={stackStyles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
        {subtitle ? (
          <Text style={stackStyles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export { GroupChatHeaderMembers } from '../components/GroupChatHeaderMembers';

export function ChatsStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      id={undefined as never}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.toolbar },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          color: colors.textPrimary,
          fontWeight: chatHeaderPresentation.titleFontWeight,
        },
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={({ navigation }) => ({
          title: 'Чаты',
          headerRight: () => (
            <Pressable
              accessibilityLabel="Написать сообщение"
              onPress={() => navigation.navigate('ComposeMessage')}
              hitSlop={12}
              style={({ pressed }) => [{ paddingHorizontal: 4, opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="edit-2" size={22} color={colors.textPrimary} />
            </Pressable>
          ),
        })}
      />

      <Stack.Screen
        name="ComposeMessage"
        component={ComposeMessageScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="CreateContact"
        component={CreateContactScreen}
        options={{ title: 'Новый контакт', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS,
          headerShown: false,
          title: route.params.chatTitle ?? 'Чат',
        })}
      />

      <Stack.Screen
        name="TelegramChat"
        component={TelegramChatScreen}
        options={({ route }) => ({
          ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS,
          headerShown: false,
          title: route.params.title ?? 'Telegram',
        })}
      />

      <Stack.Screen
        name="TelegramChatProfile"
        component={TelegramChatProfileScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="ChatProfile"
        component={ChatProfileScreen}
        options={{ title: 'Профиль', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="CreateGroupChat"
        component={CreateGroupChatScreen}
        options={{ title: 'Новая группа', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelCatalog"
        component={ChannelCatalogScreen}
        options={{ title: 'Каналы', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelLinkSlug"
        component={ChannelLinkGateScreen}
        options={{ headerShown: false, title: 'Канал' }}
      />

      <Stack.Screen
        name="ChannelLinkInvite"
        component={ChannelLinkGateScreen}
        options={{ headerShown: false, title: 'Канал' }}
      />

      <Stack.Screen
        name="ChannelPreview"
        component={ChannelPreviewScreen}
        options={{ title: 'Превью', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelFeed"
        component={ChannelFeedScreen}
        options={({ route }) => ({
          ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS,
          headerShown: false,
          title: route.params.channelId,
        })}
      />

      <Stack.Screen
        name="ChannelProfile"
        component={ChannelProfileScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="ChannelEdit"
        component={ChannelEditScreen}
        options={{ title: 'Изменить канал', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelMembers"
        component={ChannelMembersScreen}
        options={{ title: 'Участники', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelAdminPermissions"
        component={ChannelAdminPermissionsScreen}
        options={{ title: 'Права администратора', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelAddAdmin"
        component={ChannelAddAdminScreen}
        options={{ title: 'Добавить администратора', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelDiscussion"
        component={ChannelDiscussionScreen}
        options={{ title: 'Обсуждение', headerBackTitle: 'Назад', ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS, headerShown: false }}
      />

      <Stack.Screen
        name="CreateChannel"
        component={CreateChannelScreen}
        options={{ title: 'Создать канал', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelSettings"
        component={ChannelSettingsScreen}
        options={{ title: 'Настройки канала', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelType"
        component={ChannelTypeScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="ChannelInviteLinks"
        component={ChannelInviteLinksScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="ChannelDiscussionSettings"
        component={ChannelDiscussionSettingsScreen}
        options={{ title: 'Обсуждение', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelAdmin"
        component={ChannelAdminScreen}
        options={{ title: 'Управление каналом', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="ChannelMonetization"
        component={ChannelMonetizationScreen}
        options={{ title: 'Монетизация', headerBackTitle: 'Назад' }}
      />

      <Stack.Screen
        name="GroupProfile"
        component={GroupProfileScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export function createChatsStackStyles(colors: ThemeColors) {
  return StyleSheet.create({
  chatHeaderTitleRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  chatHeaderTitlePressableFlex: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRowAvatar: {
    width: CHAT_HEADER_AVATAR_SIZE,
    height: CHAT_HEADER_AVATAR_SIZE,
    borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
    marginRight: 10,
  },
  headerRowAvatarPlaceholder: {
    width: CHAT_HEADER_AVATAR_SIZE,
    height: CHAT_HEADER_AVATAR_SIZE,
    borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitleWrap: {
    flexShrink: 1,
    justifyContent: 'center',
  },
  headerTitlePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: chatHeaderPresentation.titleFontSize,
    fontWeight: chatHeaderPresentation.titleFontWeight,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: chatHeaderPresentation.subtitleFontSize,
    color: colors[chatHeaderPresentation.subtitleColorKey],
  },
  headerPressablePressed: {
    opacity: 0.7,
  },
  headerAvatarPlaceholderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
}
