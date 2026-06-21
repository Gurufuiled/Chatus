import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatsStackParamList } from '../navigation/types';
import type { ApiUser } from '../services/AuthService';
import { createOrFindChat } from '../services/chatService';
import {
  listAddressBookContacts,
  type AddressBookContact,
} from '../services/contactService';
import { searchUsers } from '../services/profileService';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import {
  filterGroupMemberPickerUsers,
  getContactSortName,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '../utils/groupMemberPicker';
import { formatContactPresenceSubtitle } from '../utils/presenceFormat';
import { resolveAvatarUrl } from '../config';
import { useTheme } from '../contexts/ThemeContext';
import { createComposeMessageStyles } from './composeMessage.styles';
import { TelegramGlyph } from '../icons/telegram';
import { TELEGRAM_PROFILE_GLYPHS } from '../icons/telegram/profilePaths';

const SEARCH_DEBOUNCE_MS = 300;

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ComposeMessage'>;

type Row =
  | { kind: 'user'; user: ApiUser }
  | { kind: 'address'; contact: AddressBookContact };

function letterForRow(row: Row): string {
  if (row.kind === 'user') {
    const n = getContactSortName(row.user);
    const ch = n.charAt(0).toUpperCase();
    if (/[A-ZА-ЯЁ]/i.test(ch)) {
      return ch === 'Ё' ? 'Е' : ch;
    }
    return '#';
  }
  const name =
    [row.contact.first_name, row.contact.last_name].filter(Boolean).join(' ').trim() ||
    row.contact.phone;
  const ch = name.charAt(0).toUpperCase();
  if (/[0-9]/.test(ch)) return '#';
  if (/[A-ZА-ЯЁ]/i.test(ch)) {
    return ch === 'Ё' ? 'Е' : ch;
  }
  return '#';
}

function sortLetters(a: string, b: string): number {
  if (a === '#' && b !== '#') return 1;
  if (b === '#' && a !== '#') return -1;
  return a.localeCompare(b, 'ru', { sensitivity: 'base' });
}

function addressLinkedUserStub(contact: AddressBookContact): ApiUser {
  const now = Date.now();
  const label =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || contact.phone;
  return {
    id: contact.linked_user_id!,
    loginus_id: null,
    username: null,
    handle: null,
    display_name: label,
    last_name: null,
    bio: null,
    birthday: null,
    avatar_url: null,
    phone: contact.phone,
    is_online: false,
    last_seen: null,
    created_at: now,
    updated_at: now,
  };
}

export function ComposeMessageScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createComposeMessageStyles(colors), [colors]);

  const chats = chatStore((s) => s.chats);
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const presenceByUserId = uiStore((s) => s.presenceByUserId);

  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<ApiUser[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [addressBook, setAddressBook] = useState<AddressBookContact[]>([]);
  const [creatingIds, setCreatingIds] = useState<Set<string>>(new Set());
  const searchIdRef = useRef(0);
  const sectionListRef = useRef<SectionList<Row>>(null);

  const loadAddressBook = useCallback(async () => {
    try {
      const list = await listAddressBookContacts();
      setAddressBook(list);
    } catch {
      setAddressBook([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAddressBook();
    }, [loadAddressBook])
  );

  useEffect(() => {
    const raw = query.trim();
    const normalized = raw.replace(/^@+/, '');
    if (!normalized) {
      searchIdRef.current += 1;
      setRemoteResults([]);
      setLoadingSearch(false);
      return;
    }
    const id = ++searchIdRef.current;
    setLoadingSearch(true);
    const t = setTimeout(() => {
      void searchUsers(raw)
        .then((users) => {
          if (id !== searchIdRef.current) return;
          setRemoteResults(currentUserId ? users.filter((u) => u.id !== currentUserId) : users);
        })
        .catch(() => {
          if (id !== searchIdRef.current) return;
          setRemoteResults([]);
        })
        .finally(() => {
          if (id === searchIdRef.current) setLoadingSearch(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, currentUserId]);

  const chatContacts = useMemo(
    () => getGroupMemberPickerContacts({ chats, currentUserId }),
    [chats, currentUserId]
  );

  const mergedUsers = useMemo(() => {
    const localFiltered = filterGroupMemberPickerUsers(chatContacts, query);
    const filteredRemote =
      currentUserId != null
        ? remoteResults.filter((u) => u.id !== currentUserId)
        : remoteResults;
    if (!query.trim()) {
      return localFiltered;
    }
    return mergeGroupMemberPickerUsers(localFiltered, filteredRemote);
  }, [chatContacts, currentUserId, query, remoteResults]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const seen = new Set<string>();

    for (const u of mergedUsers) {
      seen.add(u.id);
      out.push({ kind: 'user', user: u });
    }

    for (const c of addressBook) {
      if (c.linked_user_id && seen.has(c.linked_user_id)) continue;
      if (c.linked_user_id) {
        seen.add(c.linked_user_id);
        out.push({ kind: 'user', user: addressLinkedUserStub(c) });
        continue;
      }
      out.push({ kind: 'address', contact: c });
    }

    out.sort((a, b) => {
      const na =
        a.kind === 'user'
          ? getContactSortName(a.user)
          : [a.contact.first_name, a.contact.last_name].filter(Boolean).join(' ') || a.contact.phone;
      const nb =
        b.kind === 'user'
          ? getContactSortName(b.user)
          : [b.contact.first_name, b.contact.last_name].filter(Boolean).join(' ') || b.contact.phone;
      return na.localeCompare(nb, 'ru', { sensitivity: 'base' });
    });

    return out;
  }, [mergedUsers, addressBook]);

  const sections = useMemo(() => {
    const byLetter = new Map<string, Row[]>();
    for (const row of rows) {
      const L = letterForRow(row);
      const list = byLetter.get(L) ?? [];
      list.push(row);
      byLetter.set(L, list);
    }
    const titles = Array.from(byLetter.keys()).sort(sortLetters);
    return titles.map((title) => ({ title, data: byLetter.get(title)! }));
  }, [rows]);

  const indexLetters = useMemo(() => sections.map((s) => s.title), [sections]);

  const startChat = useCallback(
    async (user: ApiUser) => {
      if (!user.id.trim()) return;
      setCreatingIds((prev) => new Set(prev).add(user.id));
      try {
        const chat = await createOrFindChat(user.id);
        chatStore.getState().addOrUpdateChat(chat);
        navigation.replace('Chat', {
          chatId: chat.id,
          chatTitle:
            chat.local_contact_name?.trim() ||
            chat.peer_display_name?.trim() ||
            chat.name ||
            user.display_name ||
            user.username ||
            'Чат',
        });
      } catch (e) {
        Alert.alert('Не удалось открыть чат', e instanceof Error ? e.message : String(e));
      } finally {
        setCreatingIds((prev) => {
          const n = new Set(prev);
          n.delete(user.id);
          return n;
        });
      }
    },
    [navigation]
  );

  const onPressRow = useCallback(
    (row: Row) => {
      if (row.kind === 'user') {
        void startChat(row.user);
        return;
      }
      Alert.alert(
        'Контакт',
        'Этот номер пока не зарегистрирован в приложении. Когда пользователь появится, вы сможете написать ему из списка чатов.',
      );
    },
    [startChat]
  );

  const searchG = TELEGRAM_PROFILE_GLYPHS.search;
  const groupG = TELEGRAM_PROFILE_GLYPHS.groupAddMember;

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'address') {
        const c = item.contact;
        const title =
          [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.phone;
        const initial = (title.trim()[0] || '?').toUpperCase();
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onPressRow(item)}
          >
            <View style={[styles.avatarPh, { backgroundColor: colors.accent }]}>
              <Text style={styles.avatarPhText}>{initial}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {c.phone}
              </Text>
            </View>
          </Pressable>
        );
      }

      const user = item.user;
      const displayName =
        user.display_name?.trim() || user.username?.trim() || user.handle || 'Контакт';
      const presence = presenceByUserId[user.id] ?? {
        is_online: user.is_online,
        last_seen: user.last_seen,
      };
      const subtitle = formatContactPresenceSubtitle(
        Boolean(presence?.is_online),
        presence?.last_seen ?? user.last_seen
      );
      const avatarUrl = resolveAvatarUrl(user.avatar_url);
      const busy = creatingIds.has(user.id);

      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onPressRow(item)}
          disabled={busy}
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={[styles.avatarPh, { backgroundColor: colors.accent }]}>
              <Text style={styles.avatarPhText}>
                {(displayName.trim()[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </Pressable>
      );
    },
    [colors.accent, creatingIds, onPressRow, presenceByUserId, styles]
  );

  const header = useMemo(
    () => (
      <View>
        <Pressable
          style={styles.quickAction}
          onPress={() => {
            navigation.navigate('CreateGroupChat');
          }}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: `${colors.accent}22` }]}>
            <TelegramGlyph d={groupG.d} fillRule={groupG.fillRule} color={colors.accent} size={22} />
          </View>
          <Text style={[styles.quickLabel, { color: colors.accent }]}>Создать группу</Text>
        </Pressable>
        <Pressable
          style={styles.quickAction}
          onPress={() => navigation.navigate('CreateContact')}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: `${colors.accent}22` }]}>
            <MaterialCommunityIcons name="account-plus-outline" size={24} color={colors.accent} />
          </View>
          <Text style={[styles.quickLabel, { color: colors.accent }]}>Создать контакт</Text>
        </Pressable>
        <Pressable
          style={styles.quickAction}
          onPress={() => navigation.navigate('CreateChannel')}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: `${colors.accent}22` }]}>
            <MaterialCommunityIcons name="bullhorn-outline" size={22} color={colors.accent} />
          </View>
          <Text style={[styles.quickLabel, { color: colors.accent }]}>Создать канал</Text>
        </Pressable>

        <View style={styles.searchWrap}>
          <View style={styles.searchIconSlot}>
            <TelegramGlyph
              d={searchG.d}
              fillRule={searchG.fillRule}
              color={colors.textSecondary}
              size={20}
            />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск"
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {loadingSearch ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>
      </View>
    ),
    [colors, groupG, navigation, query, loadingSearch, searchG, styles]
  );

  // ⚡ Bolt: Memoize ItemSeparatorComponent to prevent FlatList from remounting separators on every render,
  // which saves CPU and memory.
  const renderSeparator = useCallback(
    () => <View style={styles.separator} />,
    [styles.separator]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Закрыть"
          style={styles.closeBtn}
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Написать сообщение</Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionList
        ref={sectionListRef}
        sections={sections}
        keyExtractor={(item) =>
          item.kind === 'user' ? `u:${item.user.id}` : `a:${item.contact.id}`
        }
        renderItem={({ item }) => renderRow({ item })}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={renderSeparator}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text
            style={{
              textAlign: 'center',
              marginTop: 32,
              paddingHorizontal: 24,
              color: colors.textSecondary,
            }}
          >
            Нет контактов для отображения
          </Text>
        }
      />

      {indexLetters.length > 1 ? (
        <View style={styles.indexCol} pointerEvents="box-none">
          {indexLetters.map((letter) => (
            <Pressable
              key={letter}
              hitSlop={4}
              onPress={() => {
                const si = sections.findIndex((s) => s.title === letter);
                if (si >= 0) {
                  sectionListRef.current?.scrollToLocation({
                    sectionIndex: si,
                    itemIndex: 0,
                    animated: true,
                    viewOffset: 0,
                  });
                }
              }}
            >
              <Text style={styles.indexLetter}>{letter}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
