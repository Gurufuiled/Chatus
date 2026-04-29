import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
} from '../screens';
import type { ChatsStackParamList } from './types';
import { resolveAvatarUrl } from '../config';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../presentation';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function formatGroupSubtitle(memberCount?: number) {
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
  chat: ReturnType<typeof chatStore.getState>['chats'][number] | null,
  currentUserId: string | null,
): string | null {
  if (!chat || !currentUserId || chat.chat_type !== 'private') return null;
  return chat.members?.find((member) => member.user_id !== currentUserId)?.user_id ?? null;
}

function ChatHeaderTitle({
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
        <Image source={{ uri: avatarUrl }} style={stackStyles.headerRowAvatar} />
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


export function ChatsStack() {
  const chats = chatStore((state) => state.chats);
  const presenceByUserId = uiStore((state) => state.presenceByUserId);
  const currentUserId = authStore((state) => state.user?.id ?? null);
  const { colors } = useTheme();
  const stackStyles = React.useMemo(() => createChatsStackStyles(colors), [colors]);

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
        options={({ route, navigation }) => {
          const title = route.params.chatTitle ?? 'Чат';
          const chat = chats.find((item) => item.id === route.params.chatId) ?? null;
          const isGroupChat = chat?.chat_type === 'group';
          const peerId = getChatPeerId(chat, currentUserId);
          const peerMember = chat?.members?.find((member) => member.user_id === peerId);
          const presence = peerId
            ? presenceByUserId[peerId] ?? {
                is_online: peerMember?.user?.is_online ?? false,
                last_seen: peerMember?.user?.last_seen ?? undefined,
              }
            : undefined;
          const avatarUrl = resolveAvatarUrl(chat?.avatar_url);
          const subtitle = isGroupChat
            ? formatGroupSubtitle(chat?.members?.length)
            : formatPresence(presence?.is_online, presence?.last_seen);

          const openProfile = () => {
            if (isGroupChat) {
              navigation.navigate('GroupProfile', {
                chatId: route.params.chatId,
                chatTitle: title,
              });
              return;
            }
            if (!peerId) return;
            navigation.navigate('ChatProfile', {
              chatId: route.params.chatId,
              userId: peerId,
              chatTitle: title,
            });
          };

          return {
            title,
            headerBackTitle: 'Назад',
            headerTitleAlign: 'left',
            headerTitle: () => (
              <Pressable
                onPress={isGroupChat || peerId ? openProfile : undefined}
                disabled={!isGroupChat && !peerId}
                style={({ pressed }) => [
                  stackStyles.headerTitlePressable,
                  pressed && (isGroupChat || peerId) && stackStyles.headerPressablePressed,
                ]}
              >
                <ChatHeaderTitle
                  title={title}
                  subtitle={subtitle}
                  avatarUrl={avatarUrl}
                  stackStyles={stackStyles}
                />
              </Pressable>
            ),
          };
        }}
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
        options={({ route, navigation }) => {
          const channel = chats.find((item) => item.id === route.params.channelId) ?? null;
          const title = channel?.name || 'Канал';
          const subtitle = `${channel?.subscriber_count ?? 0} подписчиков`;
          const avatarUrl = resolveAvatarUrl(channel?.avatar_url);
          return {
            headerBackTitle: 'Назад',
            headerTitleAlign: 'left',
            headerTitle: () => (
              <Pressable
                onPress={() =>
                  navigation.navigate('ChannelProfile', { channelId: route.params.channelId })
                }
                style={({ pressed }) => [
                  stackStyles.headerTitlePressable,
                  pressed && stackStyles.headerPressablePressed,
                ]}
              >
                <ChatHeaderTitle
                  title={title}
                  subtitle={subtitle}
                  avatarUrl={avatarUrl}
                  stackStyles={stackStyles}
                />
              </Pressable>
            ),
          };
        }}
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
        options={{ title: 'Обсуждение', headerBackTitle: 'Назад' }}
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

function createChatsStackStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
