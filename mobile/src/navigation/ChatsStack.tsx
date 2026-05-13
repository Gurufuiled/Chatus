import React from 'react';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  TelegramChatProfileScreen,
  TelegramChatScreen,
} from '../screens';
import type { ChatsStackParamList } from './types';
import { resolveAvatarUrl } from '../config';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import type { Chat } from '../stores/types';
import { inboxModeStore } from '../stores/inboxModeStore';
import { uiStore } from '../stores/uiStore';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../presentation';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

/** iOS: full-screen interactive pop matching finger (Telegram-style sheet). */
const CHAT_INTERACTIVE_BACK_STACK_OPTIONS = {
  fullScreenGestureEnabled: true,
  animationMatchesGesture: true,
  fullScreenGestureShadowEnabled: true,
  /** Let the previous stack screen show through when the chat body is translated (Android shell + iOS gesture). */
  contentStyle: { backgroundColor: 'transparent' },
} as const;

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

const GROUP_HEADER_MEMBER_CHIP = 28;
const GROUP_HEADER_MEMBER_OVERLAP = 10;
const GROUP_HEADER_MEMBERS_MAX = 5;

const MEMBER_CHIP_COLORS = ['#5B8DEF', '#53B7A8', '#F2994A', '#BB6BD9', '#EB5757', '#2D9CDB'];

function memberChipColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = seed.charCodeAt(i) + ((h << 5) - h);
  }
  return MEMBER_CHIP_COLORS[Math.abs(h) % MEMBER_CHIP_COLORS.length] ?? MEMBER_CHIP_COLORS[0];
}

function getGroupMemberDisplayName(m: NonNullable<Chat['members']>[number]): string {
  return (
    m.user?.display_name?.trim() ||
    m.user?.username?.trim() ||
    m.user?.handle?.trim() ||
    m.user_id?.trim() ||
    'Участник'
  );
}

function GroupChatHeaderMembers({
  members,
  currentUserId,
  chatId,
  navigation,
  stackStyles,
  headerBorderColor,
}: {
  members: NonNullable<Chat['members']>;
  currentUserId: string | null;
  chatId: string;
  navigation: NativeStackNavigationProp<ChatsStackParamList, 'Chat'>;
  stackStyles: ReturnType<typeof createChatsStackStyles>;
  headerBorderColor: string;
}) {
  const ordered = React.useMemo(() => {
    const list = members.filter((m) => m.user_id?.trim());
    const others = list.filter((m) => m.user_id !== currentUserId);
    const me = list.find((m) => m.user_id === currentUserId);
    return [...others, ...(me ? [me] : [])];
  }, [members, currentUserId]);

  if (ordered.length === 0) return null;

  const shown = ordered.slice(0, GROUP_HEADER_MEMBERS_MAX);
  const overflow = ordered.length - shown.length;

  return (
    <View style={stackStyles.groupHeaderMembersRow} accessibilityRole="toolbar">
      {shown.map((m, index) => {
        const name = getGroupMemberDisplayName(m);
        const uri = resolveAvatarUrl(m.user?.avatar_url ?? null);
        const initial = (name.trim()[0] || '?').toUpperCase();
        return (
          <Pressable
            key={m.user_id}
            accessibilityRole="button"
            accessibilityLabel={`Профиль: ${name}`}
            hitSlop={6}
            onPress={() =>
              navigation.navigate('ChatProfile', {
                chatId,
                userId: m.user_id,
                chatTitle: name,
              })
            }
            style={[
              stackStyles.groupHeaderMemberPressable,
              index > 0 && { marginLeft: -GROUP_HEADER_MEMBER_OVERLAP },
              { zIndex: shown.length - index },
            ]}
          >
            {uri ? (
              <Image source={{ uri }} style={[stackStyles.groupHeaderMemberAvatar, { borderColor: headerBorderColor }]} />
            ) : (
              <View
                style={[
                  stackStyles.groupHeaderMemberAvatar,
                  stackStyles.groupHeaderMemberAvatarPlaceholder,
                  { borderColor: headerBorderColor, backgroundColor: memberChipColor(m.user_id) },
                ]}
              >
                <Text style={stackStyles.groupHeaderMemberInitial}>{initial}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      {overflow > 0 ? (
        <View
          style={[
            stackStyles.groupHeaderOverflow,
            { marginLeft: -GROUP_HEADER_MEMBER_OVERLAP, zIndex: 0 },
          ]}
        >
          <Text style={stackStyles.groupHeaderOverflowText}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}


export function ChatsStack() {
  const chats = chatStore((state) => state.chats);
  const activeInbox = inboxModeStore((state) => state.activeInbox);
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
          title: activeInbox === 'telegram' ? 'Telegram' : 'Чаты',
          headerRight:
            activeInbox === 'telegram'
              ? undefined
              : () => (
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
            ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS,
            title,
            headerBackTitle: 'Назад',
            headerTitleAlign: 'left',
            headerTitle: () => (
              <View style={stackStyles.chatHeaderTitleRoot}>
                <Pressable
                  onPress={isGroupChat || peerId ? openProfile : undefined}
                  disabled={!isGroupChat && !peerId}
                  style={({ pressed }) => [
                    stackStyles.headerTitlePressable,
                    stackStyles.chatHeaderTitlePressableFlex,
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
                {isGroupChat && chat?.members && chat.members.length > 0 ? (
                  <GroupChatHeaderMembers
                    members={chat.members}
                    currentUserId={currentUserId}
                    chatId={route.params.chatId}
                    navigation={navigation}
                    stackStyles={stackStyles}
                    headerBorderColor={colors.toolbar}
                  />
                ) : null}
              </View>
            ),
          };
        }}
      />

      <Stack.Screen
        name="TelegramChat"
        component={TelegramChatScreen}
        options={({ route }) => ({
          title: route.params.title ?? 'Telegram',
          headerBackTitle: 'Назад',
          headerTitleAlign: 'left',
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
        options={({ route, navigation }) => {
          const channel = chats.find((item) => item.id === route.params.channelId) ?? null;
          const title = channel?.name || 'Канал';
          const subtitle = `${channel?.subscriber_count ?? 0} подписчиков`;
          const avatarUrl = resolveAvatarUrl(channel?.avatar_url);
          return {
            ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS,
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
        options={{ title: 'Обсуждение', headerBackTitle: 'Назад', ...CHAT_INTERACTIVE_BACK_STACK_OPTIONS }}
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
  const chip = GROUP_HEADER_MEMBER_CHIP;
  const chipR = chip / 2;
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
  groupHeaderMembersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingLeft: 2,
    maxWidth: '42%',
  },
  groupHeaderMemberPressable: {},
  groupHeaderMemberAvatar: {
    width: chip,
    height: chip,
    borderRadius: chipR,
    borderWidth: 2,
  },
  groupHeaderMemberAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderMemberInitial: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  groupHeaderOverflow: {
    marginLeft: 2,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  groupHeaderOverflowText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
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
