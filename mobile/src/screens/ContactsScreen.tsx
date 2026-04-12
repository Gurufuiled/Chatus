import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
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
import { colors } from '../theme/colors';

const SEARCH_DEBOUNCE_MS = 300;

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Contacts'>,
  NativeStackNavigationProp<ChatsStackParamList>
>;

export function ContactsScreen() {
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
          <ActivityIndicator size="small" color={colors.accent} style={styles.rowLoader} />
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
            color={colors.textSecondary}
            size={22}
          />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or @handle"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.inputBackgroundSolid },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  searchIconSlot: {
    marginRight: 4,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  rowPressed: { backgroundColor: '#f5f5f5' },
  rowLoader: { marginLeft: 8 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  info: {
    marginLeft: 12,
    flex: 1,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  handle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.placeholder,
  },
});
