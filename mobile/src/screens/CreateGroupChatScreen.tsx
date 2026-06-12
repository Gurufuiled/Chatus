import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveAvatarUrl } from '../config';
import type { ChatsStackParamList } from '../navigation/types';
import { searchUsers } from '../services/profileService';
import { createGroupChat } from '../services/chatService';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import type { ApiUser } from '../services/AuthService';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import {
  filterGroupMemberPickerUsers,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '../utils/groupMemberPicker';

const SEARCH_DEBOUNCE_MS = 300;

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'CreateGroupChat'>;

function getDisplayName(user: ApiUser) {
  return user.display_name || user.username || user.handle || 'Неизвестный пользователь';
}

function createCreateGroupChatStyles(c: ThemeColors) {
  const chipBg = withAlpha(c.accent, 0.14);
  const rowSelectedBg = withAlpha(c.accent, 0.1);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.chatBackground,
    },
    formCard: {
      marginHorizontal: 16,
      marginTop: 16,
      padding: 16,
      borderRadius: 24,
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 8,
    },
    input: {
      height: 48,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.composerBorder,
      backgroundColor: c.inputBackground,
      paddingHorizontal: 16,
      fontSize: 16,
      color: c.textPrimary,
      marginBottom: 14,
    },
    selectedScroll: {
      marginBottom: 14,
    },
    selectedScrollContent: {
      gap: 10,
      paddingRight: 8,
    },
    memberChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: chipBg,
    },
    memberChipPressed: {
      opacity: 0.82,
    },
    memberChipText: {
      maxWidth: 160,
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
    },
    memberChipRemove: {
      fontSize: 18,
      lineHeight: 18,
      color: c.accent,
      fontWeight: '700',
    },
    resultsCard: {
      flex: 1,
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    resultsEmptyContent: {
      flexGrow: 1,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    emptySubtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    resultRowPressed: {
      backgroundColor: c.rowPressed,
    },
    resultRowSelected: {
      backgroundColor: rowSelectedBg,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
    },
    avatarPlaceholder: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    avatarPlaceholderText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    resultInfo: {
      flex: 1,
      marginLeft: 12,
    },
    resultTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textPrimary,
    },
    resultSubtitle: {
      marginTop: 2,
      fontSize: 14,
      color: c.textSecondary,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.composerBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBackgroundSolid,
    },
    checkboxSelected: {
      borderColor: c.accent,
      backgroundColor: chipBg,
    },
    checkboxInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.accent,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      backgroundColor: c.chatBackground,
    },
    createButton: {
      height: 56,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      shadowColor: c.accent,
      shadowOpacity: 0.22,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    createButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.995 }],
    },
    createButtonDisabled: {
      opacity: 0.7,
    },
    createButtonText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });
}

export function CreateGroupChatScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createCreateGroupChatStyles(c), [c]);

  const chats = chatStore((state) => state.chats);
  const currentUserId = authStore((state) => state.user?.id ?? null);
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<ApiUser[]>([]);
  const searchIdRef = useRef(0);

  const selectedUserIds = useMemo(
    () => new Set(selectedUsers.map((user) => user.id)),
    [selectedUsers]
  );

  const filteredResults = useMemo(
    () => (currentUserId ? results.filter((user) => user.id !== currentUserId) : results),
    [results, currentUserId]
  );
  const chatContacts = useMemo(
    () => getGroupMemberPickerContacts({ chats, currentUserId }),
    [chats, currentUserId]
  );
  const visibleResults = useMemo(() => {
    const localMatches = filterGroupMemberPickerUsers(chatContacts, query);
    if (!query.trim()) {
      return localMatches;
    }

    return mergeGroupMemberPickerUsers(localMatches, filteredResults);
  }, [chatContacts, filteredResults, query]);

  const performSearch = useCallback(async (nextQuery: string) => {
    const normalized = nextQuery.trim().replace(/^@+/, '');
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }

    const requestId = ++searchIdRef.current;
    setLoading(true);

    try {
      const users = await searchUsers(nextQuery);
      if (requestId === searchIdRef.current) {
        setResults(users);
      }
    } catch {
      if (requestId === searchIdRef.current) {
        setResults([]);
      }
    } finally {
      if (requestId === searchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const normalized = query.trim().replace(/^@+/, '');
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      void performSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [performSearch, query]);

  const toggleUser = useCallback((user: ApiUser) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((item) => item.id === user.id);
      if (exists) {
        return prev.filter((item) => item.id !== user.id);
      }
      return [...prev, user];
    });
  }, []);

  const handleCreateGroup = useCallback(async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      Alert.alert('Нужно название группы', 'Введите название группы перед созданием чата.');
      return;
    }

    if (selectedUsers.length === 0) {
      Alert.alert('Добавьте участников', 'Выберите хотя бы одного участника для группы.');
      return;
    }

    setSubmitting(true);
    try {
      const chat = await createGroupChat(
        trimmedName,
        selectedUsers.map((user) => user.id)
      );
      chatStore.getState().addOrUpdateChat(chat);
      navigation.replace('Chat', {
        chatId: chat.id,
        chatTitle: chat.name || trimmedName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать группу';
      Alert.alert('Не удалось создать группу', message);
    } finally {
      setSubmitting(false);
    }
  }, [groupName, navigation, selectedUsers]);

  const renderResult = useCallback(
    ({ item }: { item: ApiUser }) => {
      const displayName = getDisplayName(item);
      const avatarUrl = resolveAvatarUrl(item.avatar_url);
      const isSelected = selectedUserIds.has(item.id);

      return (
        <Pressable
          onPress={() => toggleUser(item)}
          style={({ pressed }) => [
            styles.resultRow,
            pressed && styles.resultRowPressed,
            isSelected && styles.resultRowSelected,
          ]}
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
                {(displayName.trim()[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {item.handle ? `@${item.handle}` : item.username || 'Пользователь'}
            </Text>
          </View>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected ? <View style={styles.checkboxInner} /> : null}
          </View>
        </Pressable>
      );
    },
    [selectedUserIds, styles, toggleUser]
  );

  return (
    <View style={styles.container}>
      <View style={styles.formCard}>
        <Text style={styles.label}>Название группы</Text>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Введите название"
          placeholderTextColor={c.placeholder}
          style={styles.input}
          maxLength={80}
        />

        {selectedUsers.length > 0 ? (
          <>
            <Text style={styles.label}>Выбранные участники</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedScrollContent}
              style={styles.selectedScroll}
            >
              {selectedUsers.map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => toggleUser(user)}
                  style={({ pressed }) => [
                    styles.memberChip,
                    pressed && styles.memberChipPressed,
                  ]}
                >
                  <Text style={styles.memberChipText} numberOfLines={1}>
                    {getDisplayName(user)}
                  </Text>
                  <Text style={styles.memberChipRemove}>×</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.label}>Добавить участников</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по имени или @handle"
          placeholderTextColor={c.placeholder}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.resultsCard}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={c.accent} />
          </View>
        ) : (
          <FlatList
            data={visibleResults}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              visibleResults.length === 0 ? styles.resultsEmptyContent : undefined
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {query.trim() ? 'Никого не нашли' : 'Найдите людей для группы'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {query.trim()
                    ? 'Попробуйте другое имя или handle.'
                    : 'Начните вводить имя, чтобы выбрать участников группового чата.'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable
          onPress={() => void handleCreateGroup()}
          disabled={submitting}
          style={({ pressed }) => [
            styles.createButton,
            pressed && !submitting && styles.createButtonPressed,
            submitting && styles.createButtonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Создать групповой чат</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
