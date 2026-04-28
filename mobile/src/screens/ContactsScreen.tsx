import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import type { ApiUser } from '../services/AuthService';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';
import { useTheme } from '../contexts/ThemeContext';
import { createContactsScreenStyles } from './contactsScreen.styles';

const SEARCH_DEBOUNCE_MS = 300;

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Contacts'>,
  NativeStackNavigationProp<ChatsStackParamList>
>;

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
  const filteredResults = useMemo(
    () => (currentUserId ? results.filter((u) => u.id !== currentUserId) : results),
    [results, currentUserId]
  );

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

  const renderItem = ({ item }: { item: ApiUser }) => {
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
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
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

  const searchG = TELEGRAM_PROFILE_GLYPHS.search;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchIconSlot} accessibilityLabel="Search">
          <TelegramGlyph
            d={searchG.d}
            fillRule={searchG.fillRule}
            color={themeColors.textSecondary}
            size={22}
          />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or @handle"
          placeholderTextColor={themeColors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredResults}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Search by name or @handle</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}
