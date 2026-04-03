import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatListScreen, ChatProfileScreen, ChatScreen } from '../screens';
import type { ChatsStackParamList } from './types';
import { resolveAvatarUrl } from '../config';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

function formatPresence(isOnline?: boolean, lastSeen?: number) {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function getChatPeerId(chatId: string): string | null {
  const currentUserId = authStore.getState().user?.id;
  const chat = chatStore.getState().chats.find((item) => item.id === chatId);
  if (!chat || !currentUserId) return null;
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
  return (
    <Stack.Navigator
      id={undefined as never}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.header },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
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
          const title = route.params.chatTitle ?? 'Chat';
          const chat = chatStore.getState().chats.find((item) => item.id === route.params.chatId);
          const peerId = getChatPeerId(route.params.chatId);
          const presence = peerId ? uiStore.getState().presenceByUserId[peerId] : undefined;
          const avatarUrl = resolveAvatarUrl(chat?.avatar_url);
          const subtitle = formatPresence(presence?.is_online, presence?.last_seen);
          const openProfile = () => {
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
                onPress={peerId ? openProfile : undefined}
                disabled={!peerId}
                style={({ pressed }) => [
                  styles.headerTitlePressable,
                  pressed && peerId && styles.headerPressablePressed,
                ]}
              >
                <ChatHeaderTitle title={title} subtitle={subtitle} />
              </Pressable>
            ),
            headerRight: () => (
              <Pressable
                onPress={peerId ? openProfile : undefined}
                disabled={!peerId}
                style={({ pressed }) => [
                  styles.headerActionsPressable,
                  pressed && peerId && styles.headerPressablePressed,
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
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  headerTitlePressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textSecondary,
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
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  headerAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5B8DEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarPlaceholderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
