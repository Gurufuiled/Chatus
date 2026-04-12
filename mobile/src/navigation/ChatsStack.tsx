import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ChatListScreen,
  ChatProfileScreen,
  ChatScreen,
  CreateGroupChatScreen,
  GroupProfileScreen,
} from '../screens';
import type { ChatsStackParamList } from './types';
import { resolveAvatarUrl } from '../config';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../presentation';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function formatGroupSubtitle(memberCount?: number) {
  if (typeof memberCount === 'number' && memberCount > 0) {
    if (memberCount % 10 === 1 && memberCount % 100 !== 11) {
      return `${memberCount} участник`;
    }
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

function ChatHeaderTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headerTitleWrap}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function ChatHeaderAvatar({
  avatarUrl,
  title,
}: {
  avatarUrl: string | null;
  title: string;
}) {
  const initial = (title.trim()[0] || '?').toUpperCase();

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />;
  }

  return (
    <View style={styles.headerAvatarPlaceholder}>
      <Text style={styles.headerAvatarPlaceholderText}>{initial}</Text>
    </View>
  );
}

function ChatHeaderActions({
  avatarUrl,
  title,
}: {
  avatarUrl: string | null;
  title: string;
}) {
  return (
    <View style={styles.headerActions}>
      <ChatHeaderAvatar avatarUrl={avatarUrl} title={title} />
    </View>
  );
}

export function ChatsStack() {
  const chats = chatStore((state) => state.chats);
  const presenceByUserId = uiStore((state) => state.presenceByUserId);
  const currentUserId = authStore((state) => state.user?.id ?? null);

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
        options={{ title: 'Chats' }}
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
            headerTitle: () => (
              <Pressable
                onPress={isGroupChat || peerId ? openProfile : undefined}
                disabled={!isGroupChat && !peerId}
                style={({ pressed }) => [
                  styles.headerTitlePressable,
                  pressed && (isGroupChat || peerId) && styles.headerPressablePressed,
                ]}
              >
                <ChatHeaderTitle title={title} subtitle={subtitle} />
              </Pressable>
            ),
            headerRight: () => (
              <Pressable
                onPress={isGroupChat || peerId ? openProfile : undefined}
                disabled={!isGroupChat && !peerId}
                style={({ pressed }) => [
                  styles.headerActionsPressable,
                  pressed && (isGroupChat || peerId) && styles.headerPressablePressed,
                ]}
              >
                <ChatHeaderActions avatarUrl={avatarUrl} title={title} />
              </Pressable>
            ),
          };
        }}
      />
      <Stack.Screen
        name="ChatProfile"
        component={ChatProfileScreen}
        options={{
          title: 'Профиль',
          headerBackTitle: 'Назад',
        }}
      />
      <Stack.Screen
        name="CreateGroupChat"
        component={CreateGroupChatScreen}
        options={{
          title: 'Новая группа',
          headerBackTitle: 'Назад',
        }}
      />
      <Stack.Screen
        name="GroupProfile"
        component={GroupProfileScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: chatHeaderPresentation.titleMaxWidth,
  },
  headerTitlePressable: {
    alignItems: 'center',
    justifyContent: 'center',
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
  headerActions: {
    alignItems: 'center',
  },
  headerActionsPressable: {
    borderRadius: 20,
  },
  headerPressablePressed: {
    opacity: 0.7,
  },
  headerAvatar: {
    width: CHAT_HEADER_AVATAR_SIZE,
    height: CHAT_HEADER_AVATAR_SIZE,
    borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
  },
  headerAvatarPlaceholder: {
    width: CHAT_HEADER_AVATAR_SIZE,
    height: CHAT_HEADER_AVATAR_SIZE,
    borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarPlaceholderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
