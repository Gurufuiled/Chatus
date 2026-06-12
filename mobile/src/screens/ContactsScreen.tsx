import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { ChatsStackParamList } from '../navigation/types';
import { resolveAvatarUrl } from '../config';
import { searchUsers } from '../services/profileService';
import { createOrFindChat } from '../services/chatService';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import type { ApiUser } from '../services/AuthService';
import type { Chat } from '../stores/types';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import { useTheme } from '../contexts/ThemeContext';
import { createContactsScreenStyles } from './contactsScreen.styles';
import { formatContactPresenceSubtitle } from '../utils/presenceFormat';
import { contactsStore, type PhoneBookContact } from '../stores/contactsStore';

const SEARCH_DEBOUNCE_MS = 300;

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Contacts'>,
  NativeStackNavigationProp<ChatsStackParamList>
>;

type ContactFromChatRow = {
  chat: Chat;
  peerId: string;
  title: string;
  avatarUrl: string | null | undefined;
  sortTime: number;
};

function buildContactsFromChats(chats: Chat[], currentUserId: string | null): ContactFromChatRow[] {
  if (!currentUserId) return [];
  const rows: ContactFromChatRow[] = [];
  for (const chat of chats) {
    if (chat.chat_type !== 'private') continue;
    const peerMember = chat.members?.find((m) => m.user_id !== currentUserId);
    const peerId = peerMember?.user_id;
    if (!peerId) continue;
    const user = peerMember?.user;
    const sortTime = chat.last_message_at ?? chat.updated_at ?? 0;
    const title =
      chat.local_contact_name?.trim() ||
      chat.peer_display_name?.trim() ||
      user?.display_name?.trim() ||
      (user?.handle ? `@${user.handle}` : null) ||
      user?.username?.trim() ||
      'Контакт';
    const avatarUrl = user?.avatar_url ?? chat.avatar_url;
    rows.push({ chat, peerId, title, avatarUrl, sortTime });
  }
  rows.sort((a, b) => b.sortTime - a.sortTime);
  return rows;
}

export function ContactsScreen() {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createContactsScreenStyles(themeColors), [themeColors]);
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingChatUserIds, setCreatingChatUserIds] = useState<Set<string>>(new Set());
  const searchIdRef = useRef(0);

  const currentUserId = authStore((s) => s.user?.id ?? null);
  const chats = chatStore((s) => s.chats);
  const presenceByUserId = uiStore((s) => s.presenceByUserId);

  const permissionStatus = contactsStore((s) => s.permissionStatus);
  const phoneBookContacts = contactsStore((s) => s.phoneBookContacts);
  const isSyncingContacts = contactsStore((s) => s.isSyncing);

  // Check permission on mount and sync contacts on focus
  useEffect(() => {
    void contactsStore.getState().checkPermission();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (contactsStore.getState().permissionStatus === 'granted') {
        void contactsStore.getState().syncContacts();
      }
    }, [])
  );

  const chatusPhoneContacts = useMemo(
    () => phoneBookContacts.filter((c) => c.hasChatus),
    [phoneBookContacts]
  );

  const handleRequestPermission = useCallback(async () => {
    await contactsStore.getState().requestPermission();
  }, []);

  const contactsFromChats = useMemo(
    () => buildContactsFromChats(chats, currentUserId),
    [chats, currentUserId]
  );

  const filteredResults = useMemo(
    () => (currentUserId ? results.filter((u) => u.id !== currentUserId) : results),
    [results, currentUserId]
  );

  const isSearchMode = query.trim().length > 0;

  const performSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    const normalized = trimmed.replace(/^@+/, '');
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++searchIdRef.current;
    setLoading(true);
    try {
      const users = await searchUsers(trimmed);
      if (id === searchIdRef.current) {
        setResults(users);
      }
    } catch {
      if (id === searchIdRef.current) {
        setResults([]);
      }
    } finally {
      if (id === searchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const normalized = trimmed.replace(/^@+/, '');
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => performSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const openChat = useCallback(
    (chatId: string, chatTitle: string) => {
      navigation.navigate('Chats', {
        screen: 'Chat',
        params: { chatId, chatTitle },
      });
    },
    [navigation]
  );

  const handleStartChat = useCallback(
    async (user: ApiUser) => {
      if (!user?.id?.trim()) return;
      setCreatingChatUserIds((prev) => new Set(prev).add(user.id));
      try {
        const chat = await createOrFindChat(user.id);
        chatStore.getState().addOrUpdateChat(chat);
        navigation.navigate('Chats', {
          screen: 'Chat',
          params: {
            chatId: chat.id,
            chatTitle: chat.peer_display_name || chat.name || 'Chat',
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('Error', msg);
      } finally {
        setCreatingChatUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    },
    [navigation]
  );

  const renderSearchItem = ({ item }: { item: ApiUser }) => {
    const avatarUrl = resolveAvatarUrl(item.avatar_url);
    const displayName = item.display_name || item.username || 'Unknown';
    const handle = item.handle ? `@${item.handle}` : '';
    const isCreating = creatingChatUserIds.has(item.id);

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => handleStartChat(item)}
        disabled={isCreating}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {(displayName || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          {handle ? (
            <Text style={styles.handle} numberOfLines={1}>
              {handle}
            </Text>
          ) : null}
        </View>
        {isCreating && (
          <ActivityIndicator size="small" color={themeColors.accent} style={styles.rowLoader} />
        )}
      </Pressable>
    );
  };

  const renderContactFromChat = ({ item }: { item: ContactFromChatRow }) => {
    const { chat, peerId, title, avatarUrl: rawAvatar } = item;
    const peerMember = chat.members?.find((m) => m.user_id === peerId);
    const presence = presenceByUserId[peerId] ?? {
      is_online: peerMember?.user?.is_online ?? false,
      last_seen: peerMember?.user?.last_seen ?? undefined,
    };
    const subtitle = formatContactPresenceSubtitle(
      Boolean(presence.is_online),
      presence.last_seen ?? peerMember?.user?.last_seen ?? null
    );
    const resolvedAvatar = resolveAvatarUrl(rawAvatar ?? null);

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => openChat(chat.id, title)}
      >
        {resolvedAvatar ? (
          <Image
            source={{ uri: resolvedAvatar }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>{(title || '?')[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.displayName} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.presenceSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderPhoneBookContact = useCallback(
    ({ item }: { item: PhoneBookContact }) => {
      const avatarUrl = resolveAvatarUrl(item.chatusAvatarUrl ?? null);
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            if (item.chatusUserId) {
              void handleStartChat({ id: item.chatusUserId, display_name: item.deviceName, handle: item.chatusHandle ?? null } as ApiUser);
            }
          }}
          disabled={!item.chatusUserId}
        >
          {avatarUrl ? (
            <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="disk"
          />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {(item.deviceName || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.displayName} numberOfLines={1}>
              {item.deviceName}
            </Text>
            <Text style={styles.handle} numberOfLines={1}>
              {item.chatusHandle ? `@${item.chatusHandle}` : item.phoneNumber}
            </Text>
          </View>
        </Pressable>
      );
    },
    [handleStartChat, styles]
  );

  const searchG = TELEGRAM_PROFILE_GLYPHS.search;

  const listEmpty = isSearchMode ? (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>Пользователи не найдены</Text>
    </View>
  ) : (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>Нет личных чатов. Найдите человека по имени или @нику.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchIconSlot} accessibilityLabel="Поиск">
          <TelegramGlyph
            d={searchG.d}
            fillRule={searchG.fillRule}
            color={themeColors.textSecondary}
            size={22}
          />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по имени или @нику"
          placeholderTextColor={themeColors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {isSearchMode && loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : isSearchMode ? (
        <FlatList<ApiUser>
          data={filteredResults}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchItem}
          ListEmptyComponent={listEmpty}
        />
      ) : (
        <FlatList
          data={[
            ...contactsFromChats.map((item) => ({ type: 'chat' as const, key: item.chat.id, data: item })),
            ...(chatusPhoneContacts.length > 0
              ? [
                  { type: 'sectionHeader' as const, key: 'header:phonebook', data: null },
                  ...chatusPhoneContacts.map((item) => ({ type: 'phonebook' as const, key: `pb:${item.phoneNumber}`, data: item })),
                ]
              : []),
          ]}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            if (item.type === 'sectionHeader') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>В телефонной книге</Text>
                </View>
              );
            }
            if (item.type === 'phonebook') {
              return renderPhoneBookContact({ item: item.data as PhoneBookContact });
            }
            return renderContactFromChat({ item: item.data as ContactFromChatRow });
          }}
          ListHeaderComponent={
            permissionStatus !== 'granted' ? (
              <Pressable
                style={({ pressed }) => [styles.permissionBanner, pressed && { opacity: 0.85 }]}
                onPress={() => void handleRequestPermission()}
              >
                <Text style={styles.permissionBannerText}>
                  Разрешите доступ к контактам, чтобы найти друзей в Chatus
                </Text>
                <Text style={styles.permissionBannerButton}>Разрешить</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            permissionStatus !== 'granted' ? null : listEmpty
          }
        />
      )}
    </View>
  );
}
