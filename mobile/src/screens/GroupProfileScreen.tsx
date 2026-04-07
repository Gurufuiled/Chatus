import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Linking,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AnchoredPopoverMenu,
  type AnchoredMenuState,
  type AnchoredPopoverMenuItem,
} from '../components/AnchoredPopoverMenu';
import { GroupAddMembersModal } from '../components/group-profile/GroupAddMembersModal';
import { GroupMemberTagModal } from '../components/group-profile/GroupMemberTagModal';
import {
  DEFAULT_MEMBER_TAG_COLOR,
  isGroupMemberTagColor,
} from '../components/group-profile/groupProfile.constants';
import { GroupProfileHeaderSection } from '../components/group-profile/GroupProfileHeaderSection';
import { GroupProfileMediaContent } from '../components/group-profile/GroupProfileMediaContent';
import { GroupProfileMediaViewerModal } from '../components/group-profile/GroupProfileMediaViewerModal';
import { GroupProfileStickyTabs } from '../components/group-profile/GroupProfileStickyTabs';
import { GroupParticipantsSection } from '../components/group-profile/GroupParticipantsSection';
import type {
  GroupFileItem,
  GroupMediaItem,
  GroupMember,
  GroupMemberTagColor,
  GroupVoiceItem,
} from '../components/group-profile/groupProfile.types';
import { getDisplayNameFromMember } from '../components/group-profile/groupProfile.utils';
import { resolveAvatarUrl } from '../config';
import type { ChatsStackParamList } from '../navigation/types';
import { apiUpload } from '../services/apiClient';
import { apiUserToUserRow, type ApiUser } from '../services/AuthService';
import {
  addGroupMembers,
  createOrFindChat,
  deleteGroup,
  getChatById,
  leaveGroup,
  removeGroupMember,
  updateGroupChat,
  updateGroupMemberTag,
} from '../services/chatService';
import { searchUsers } from '../services/profileService';
import { ChatDao, ChatMemberDao, MessageDao, UserDao } from '../db';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import type { Chat, Message } from '../stores/types';
import { colors } from '../theme/colors';

type GroupProfileRoute = RouteProp<ChatsStackParamList, 'GroupProfile'>;
type GroupProfileNavigation = NativeStackNavigationProp<ChatsStackParamList, 'GroupProfile'>;
type GroupTabKey = 'participants' | 'media' | 'files' | 'voice';
const EMPTY_GROUP_MESSAGES: Message[] = [];
type MemberContextMenuState = {
  member: GroupMember;
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

const SEARCH_DEBOUNCE_MS = 280;
const COMPACT_HEADER_SCROLL_START = 112;
const COMPACT_HEADER_SCROLL_END = 196;
const GROUP_PROFILE_SCREEN_WIDTH = Dimensions.get('window').width;
const GROUP_TAB_ITEMS: [GroupTabKey, string][] = [
  ['participants', 'Участники'],
  ['media', 'Медиа'],
  ['files', 'Файлы'],
  ['voice', 'Голосовые'],
];


function formatMemberCount(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} участник`;
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return `${count} участника`;
  }
  return `${count} участников`;
}



function extractMediaUri(message: Message): string | null {
  const media = message.media?.[0];
  const candidates = [media?.thumbnail_url, media?.remote_url, message.content];

  for (const candidate of candidates) {
    const resolved = resolveAvatarUrl(candidate ?? null);
    if (resolved) return resolved;
  }

  return null;
}

function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function getFileExtension(fileName: string) {
  const ext = fileName.split('.').pop()?.trim() ?? '';
  if (!ext || ext === fileName) return 'FILE';
  return ext.slice(0, 4).toUpperCase();
}

type PersistableUser = {
  id: string;
  username?: string | null;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  is_online?: boolean | number;
  last_seen?: number | null;
  created_at?: number;
  updated_at?: number;
};

function buildFallbackUserRow(user: PersistableUser) {
  const now = Date.now();
  return {
    id: user.id,
    username: user.username ?? '',
    handle: user.handle ?? null,
    display_name: user.display_name ?? null,
    avatar_url: user.avatar_url ?? null,
    avatar_local_path: null,
    phone: user.phone ?? null,
    is_online: user.is_online ? 1 : 0,
    last_seen: user.last_seen ?? null,
    created_at: user.created_at ?? now,
    updated_at: user.updated_at ?? now,
  };
}

async function ensureUserStored(userDao: UserDao, user: PersistableUser | null | undefined) {
  const userId = user?.id?.trim();
  if (!userId) return;

  const existing = await userDao.getById(userId);
  if (!user) {
    if (!existing) {
      await userDao.insert(buildFallbackUserRow({ id: userId }));
    }
    return;
  }

  const nextRow =
    user.created_at !== undefined && user.updated_at !== undefined
      ? apiUserToUserRow({
          id: user.id,
          loginus_id: null,
          username: user.username ?? null,
          handle: user.handle ?? null,
          display_name: user.display_name ?? null,
          avatar_url: user.avatar_url ?? null,
          phone: user.phone ?? null,
          is_online: Boolean(user.is_online),
          last_seen: user.last_seen ?? null,
          created_at: user.created_at,
          updated_at: user.updated_at,
        })
      : buildFallbackUserRow(user);

  if (existing) {
    await userDao.update({
      id: userId,
      username: user.username ?? existing.username,
      handle: user.handle ?? existing.handle,
      display_name: user.display_name ?? existing.display_name,
      avatar_url: user.avatar_url ?? existing.avatar_url,
      avatar_local_path: existing.avatar_local_path,
      phone: user.phone ?? existing.phone,
      is_online: user.is_online !== undefined ? (user.is_online ? 1 : 0) : existing.is_online,
      last_seen: user.last_seen ?? existing.last_seen,
      created_at: user.created_at ?? existing.created_at,
      updated_at: user.updated_at ?? nextRow.updated_at,
    });
    return;
  }

  await userDao.insert(nextRow);
}

async function persistChatUsers(chat: Chat) {
  const userDao = new UserDao();
  const authUser = authStore.getState().user;

  if (authUser) {
    await ensureUserStored(userDao, authUser);
  }

  for (const member of chat.members ?? []) {
    if (member.user) {
      await ensureUserStored(userDao, {
        id: member.user.id || member.user_id,
        username: member.user.username ?? null,
        handle: member.user.handle ?? null,
        display_name: member.user.display_name ?? null,
        avatar_url: member.user.avatar_url ?? null,
        is_online: member.user.is_online,
        last_seen: member.user.last_seen ?? null,
      });
    } else {
      await ensureUserStored(userDao, { id: member.user_id });
    }
  }

  if (chat.created_by) {
    const creator =
      chat.members?.find((member) => member.user_id === chat.created_by)?.user ??
      (authUser?.id === chat.created_by ? authUser : null);

    await ensureUserStored(
      userDao,
      creator
        ? {
            id: creator.id,
            username: creator.username ?? null,
            handle: creator.handle ?? null,
            display_name: creator.display_name ?? null,
            avatar_url: creator.avatar_url ?? null,
            phone: 'phone' in creator ? creator.phone ?? null : null,
            is_online: creator.is_online,
            last_seen: creator.last_seen ?? null,
            created_at: 'created_at' in creator ? creator.created_at : undefined,
            updated_at: 'updated_at' in creator ? creator.updated_at : undefined,
          }
        : { id: chat.created_by }
    );
  }
}

async function persistChatMembers(chat: Chat) {
  const memberDao = new ChatMemberDao();
  await memberDao.deleteByChatId(chat.id);
  for (const member of chat.members ?? []) {
    await memberDao.insert({
      chat_id: chat.id,
      user_id: member.user_id,
      role: member.role ?? 'member',
      tag: member.tag ?? null,
      tag_color: member.tag_color ?? null,
      joined_at: member.joined_at ?? chat.updated_at ?? Date.now(),
    });
  }
}

async function persistChatLocally(chat: Chat) {
  chatStore.getState().addOrUpdateChat(chat);
  const dao = new ChatDao();
  const messageDao = new MessageDao();

  await persistChatUsers(chat);

  const existing = await dao.getById(chat.id);
  const pinnedMessageId = chat.pinned_message_id
    ? (await messageDao.getById(chat.pinned_message_id))?.id ?? null
    : null;
  const payload = {
    id: chat.id,
    chat_type: chat.chat_type,
    name: chat.name,
    description: chat.description ?? null,
    avatar_url: chat.avatar_url,
    created_by: chat.created_by,
    last_message_id: chat.last_message_id,
    pinned_message_id: pinnedMessageId,
    last_message_at: chat.last_message_at,
    last_message_preview: chat.last_message_preview,
    unread_count: chat.unread_count,
    is_muted: chat.is_muted,
    is_pinned: chat.is_pinned,
    is_archived: chat.is_archived,
    draft: chat.draft,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
  };

  if (existing) {
    await dao.update(payload);
  } else {
    await dao.insert(payload);
  }

  await persistChatMembers(chat);
}

export function GroupProfileScreen() {
  const route = useRoute<GroupProfileRoute>();
  const navigation = useNavigation<GroupProfileNavigation>();
  const insets = useSafeAreaInsets();
  const { chatId, chatTitle } = route.params;
  const currentUserId = authStore((state) => state.user?.id ?? null);

  const chat = chatStore(
    useCallback(
      (state) => state.chats.find((item) => item.id === chatId) ?? null,
      [chatId]
    )
  );
  const chatMessages = messageStore(
    useCallback((state) => state.messagesByChatId[chatId] ?? EMPTY_GROUP_MESSAGES, [chatId])
  );

  const [activeTab, setActiveTab] = useState<GroupTabKey>('participants');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moreMenu, setMoreMenu] = useState<AnchoredMenuState>(null);
  const [memberMenu, setMemberMenu] = useState<MemberContextMenuState>(null);
  const [tagEditorMember, setTagEditorMember] = useState<GroupMember | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [tagColorDraft, setTagColorDraft] =
    useState<GroupMemberTagColor>(DEFAULT_MEMBER_TAG_COLOR);
  const [tagSaving, setTagSaving] = useState(false);
  const [isAddMembersVisible, setIsAddMembersVisible] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchResults, setMemberSearchResults] = useState<ApiUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<ApiUser[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const memberSearchIdRef = useRef(0);
  const moreButtonRef = useRef<View | null>(null);
  const moreMenuAnimation = useRef(new Animated.Value(0)).current;
  const moreWaveAnimation = useRef(new Animated.Value(0)).current;
  const moreIconScale = useRef(new Animated.Value(1)).current;
  const memberMenuAnimation = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const members = useMemo(() => chat?.members ?? [], [chat]);
  const currentMembership = useMemo(
    () => members.find((member) => member.user_id === currentUserId) ?? null,
    [currentUserId, members]
  );
  const isOwner = currentMembership?.role === 'owner' || chat?.created_by === currentUserId;
  const avatarUrl = resolveAvatarUrl(
    (isEditMode ? avatarDraftUrl : chat?.avatar_url) ?? null
  );
  const displayName = isEditMode
    ? nameDraft
    : chat?.name?.trim() || chatTitle?.trim() || 'Группа';
  const description = isEditMode ? descriptionDraft : chat?.description?.trim() || '';
  const isMuted = (chat?.is_muted ?? 0) === 1;
  const expandedHeroWidth = GROUP_PROFILE_SCREEN_WIDTH - 28;
  const expandedHeroHeight = Math.min(Math.max(expandedHeroWidth * 1.02, 300), 420);
  const selectedUserIds = useMemo(
    () => new Set(selectedUsers.map((user) => user.id)),
    [selectedUsers]
  );
  const moreWaveStyle = useMemo(
    () => ({
      opacity: moreWaveAnimation.interpolate({
        inputRange: [0, 0.18, 1],
        outputRange: [0, 0.2, 0],
      }),
      transform: [
        {
          scale: moreWaveAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.32, 1.42],
          }),
        },
      ],
    }),
    [moreWaveAnimation]
  ) as any;
  const compactHeaderProgress = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [COMPACT_HEADER_SCROLL_START, COMPACT_HEADER_SCROLL_END],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );
  const compactHeaderStyle = useMemo(
    () => ({
      height: compactHeaderProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 74],
      }),
      opacity: compactHeaderProgress,
      marginBottom: compactHeaderProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 8],
      }),
      transform: [
        {
          translateY: compactHeaderProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-10, 0],
          }),
        },
      ],
    }),
    [compactHeaderProgress]
  ) as any;

  const mediaItems = useMemo<GroupMediaItem[]>(
    () =>
      chatMessages
        .filter(
          (message) =>
            !message.is_deleted &&
            (message.msg_type === 'image' || message.msg_type === 'video_note')
        )
        .map((message): GroupMediaItem | null => {
          const uri = extractMediaUri(message);
          if (!uri) return null;
          return {
            id: message.id,
            uri,
            durationMs:
              message.msg_type === 'video_note'
                ? message.media?.[0]?.duration_ms ?? 0
                : undefined,
          };
        })
        .filter((item): item is GroupMediaItem => item != null),
    [chatMessages]
  );

  const fileItems = useMemo<GroupFileItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'file')
        .map((message) => ({
          id: message.id,
          title: message.media?.[0]?.file_name || message.content || 'Файл',
          extension: getFileExtension(message.media?.[0]?.file_name || 'FILE'),
          size: formatFileSize(message.media?.[0]?.file_size ?? undefined),
          date: formatMessageDate(message.created_at),
          uri: extractMediaUri(message),
        })),
    [chatMessages]
  );

  const voiceItems = useMemo<GroupVoiceItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'voice')
        .map((message) => ({
          id: message.id,
          uri: extractMediaUri(message),
          duration: formatDuration(message.media?.[0]?.duration_ms ?? 0),
          date: formatMessageDate(message.created_at),
          durationMs: message.media?.[0]?.duration_ms ?? 0,
          waveform: message.media?.[0]?.waveform ?? [],
          dateLabel: formatMessageDate(message.created_at),
        })),
    [chatMessages]
  );


  const filteredSearchResults = useMemo(() => {
    const existingIds = new Set(members.map((member) => member.user_id));
    return memberSearchResults.filter(
      (user) => user.id !== currentUserId && !existingIds.has(user.id)
    );
  }, [currentUserId, memberSearchResults, members]);

  const hydrateDraftsFromChat = useCallback((nextChat: Chat | null) => {
    setNameDraft(nextChat?.name ?? '');
    setDescriptionDraft(nextChat?.description ?? '');
    setAvatarDraftUrl(nextChat?.avatar_url ?? null);
  }, []);

  const refreshChat = useCallback(
    async (showLoader = false) => {
      if (showLoader) setLoading(true);
      else setRefreshing(true);

      try {
        const updatedChat = await getChatById(chatId);
        await persistChatLocally(updatedChat);
        hydrateDraftsFromChat(updatedChat);
      } catch (error) {
        Alert.alert(
          'Не удалось загрузить группу',
          error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
        );
      } finally {
        if (showLoader) setLoading(false);
        else setRefreshing(false);
      }
    },
    [chatId, hydrateDraftsFromChat]
  );

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      if (value > 24 && isHeroExpanded) {
        setIsHeroExpanded(false);
      }
    });

    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [isHeroExpanded, scrollY]);

  useEffect(() => {
    void refreshChat(true);
  }, [refreshChat]);

  useEffect(() => {
    if (!chat) return;
    if (!isEditMode) {
      hydrateDraftsFromChat(chat);
    }
  }, [chat, hydrateDraftsFromChat, isEditMode]);


  useEffect(() => {
    if (!isAddMembersVisible) return;

    const normalized = addMemberQuery.trim().replace(/^@+/, '');
    if (!normalized) {
      setMemberSearchResults([]);
      setMemberSearchLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      const requestId = ++memberSearchIdRef.current;
      setMemberSearchLoading(true);
      void searchUsers(addMemberQuery)
        .then((users) => {
          if (requestId === memberSearchIdRef.current) {
            setMemberSearchResults(users);
          }
        })
        .catch(() => {
          if (requestId === memberSearchIdRef.current) {
            setMemberSearchResults([]);
          }
        })
        .finally(() => {
          if (requestId === memberSearchIdRef.current) {
            setMemberSearchLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [addMemberQuery, isAddMembersVisible]);

  useEffect(() => {
    if (!moreMenu) return;

    Animated.spring(moreMenuAnimation, {
      toValue: 1,
      damping: 17,
      stiffness: 230,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [moreMenu, moreMenuAnimation]);

  useEffect(() => {
    if (!memberMenu) return;

    Animated.spring(memberMenuAnimation, {
      toValue: 1,
      damping: 17,
      stiffness: 230,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [memberMenu, memberMenuAnimation]);

  const closeMoreMenu = useCallback(
    (onClosed?: unknown) => {
      const callback = typeof onClosed === 'function' ? onClosed : undefined;
      if (!moreMenu) {
        callback?.();
        return;
      }

      Animated.timing(moreMenuAnimation, {
        toValue: 0,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setMoreMenu(null);
        callback?.();
      });
    },
    [moreMenu, moreMenuAnimation]
  );

  const openMoreMenu = useCallback(() => {
    moreWaveAnimation.stopAnimation();
    moreIconScale.stopAnimation();
    moreWaveAnimation.setValue(0);
    moreIconScale.setValue(1);

    Animated.parallel([
      Animated.timing(moreWaveAnimation, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(moreIconScale, {
          toValue: 0.92,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(moreIconScale, {
          toValue: 1,
          damping: 12,
          stiffness: 240,
          mass: 0.75,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const target = moreButtonRef.current;
    if (!target) return;

    target.measureInWindow((left, top, width, height) => {
      moreMenuAnimation.setValue(0);
      setMoreMenu({ left, top, width, height });
    });
  }, [moreIconScale, moreMenuAnimation, moreWaveAnimation]);

  const closeMemberMenu = useCallback(
    (onClosed?: unknown) => {
      const callback = typeof onClosed === 'function' ? onClosed : undefined;
      if (!memberMenu) {
        callback?.();
        return;
      }

      Animated.timing(memberMenuAnimation, {
        toValue: 0,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setMemberMenu(null);
        callback?.();
      });
    },
    [memberMenu, memberMenuAnimation]
  );

  const openMemberMenu = useCallback(
    (member: GroupMember, left: number, top: number) => {
      memberMenuAnimation.setValue(0);
      setMemberMenu({
        member,
        left,
        top,
        width: 48,
        height: 22,
      });
    },
    [memberMenuAnimation]
  );

  const handleToggleMute = useCallback(() => {
    if (!chat) return;
    const nextChat: Chat = {
      ...chat,
      is_muted: isMuted ? 0 : 1,
      updated_at: Date.now(),
    };
    chatStore.getState().updateChat(nextChat);
    void new ChatDao().update({
      id: nextChat.id,
      is_muted: nextChat.is_muted,
      updated_at: nextChat.updated_at,
    });
  }, [chat, isMuted]);

  const handleSearchPress = useCallback(() => {
    navigation.navigate('Chat', {
      chatId,
      chatTitle: chat?.name ?? chatTitle,
      startSearch: true,
    });
  }, [chat?.name, chatId, chatTitle, navigation]);

  const handleShowMessageInChat = useCallback(
    (messageId: string) => {
      setSelectedMediaIndex(null);
      navigation.navigate('Chat', {
        chatId,
        chatTitle: chat?.name ?? chatTitle,
        focusMessageId: messageId,
      });
    },
    [chat?.name, chatId, chatTitle, navigation]
  );

  const handleOpenFile = useCallback(
    async (item: GroupFileItem) => {
      const uri = item.uri?.trim();
      if (!uri) {
        handleShowMessageInChat(item.id);
        return;
      }

      try {
        await Linking.openURL(uri);
      } catch {
        Alert.alert('Не удалось открыть файл', 'Покажу это сообщение прямо в чате.');
        handleShowMessageInChat(item.id);
      }
    },
    [handleShowMessageInChat]
  );

  const handleEnterEditMode = useCallback(() => {
    if (!isOwner || !chat) return;
    hydrateDraftsFromChat(chat);
    setIsHeroExpanded(false);
    setIsEditMode(true);
  }, [chat, hydrateDraftsFromChat, isOwner]);

  const handleCancelEdit = useCallback(() => {
    hydrateDraftsFromChat(chat);
    setIsHeroExpanded(false);
    setIsEditMode(false);
  }, [chat, hydrateDraftsFromChat]);

  const handlePickAvatar = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нужен доступ', 'Разреши доступ к фото, чтобы изменить аватар группы.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });

    if (result.canceled || !result.assets[0]) return;

    setAvatarUploading(true);
    try {
      const asset = result.assets[0];
      const uploadResult = await apiUpload({
        uri: asset.uri,
        name: asset.fileName ?? 'group-avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      setAvatarDraftUrl(uploadResult.url);
    } catch (error) {
      Alert.alert(
        'Не удалось загрузить фото',
        error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
      );
    } finally {
      setAvatarUploading(false);
    }
  }, []);

  const handleSaveGroup = useCallback(async () => {
    if (!chat) return;

    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      Alert.alert('Нужно название', 'Введите название группы.');
      return;
    }

    setSaving(true);
    try {
      const updatedChat = await updateGroupChat(chat.id, {
        name: trimmedName,
        description: descriptionDraft.trim(),
        avatar_url: avatarDraftUrl ?? '',
      });
      await persistChatLocally(updatedChat);
      hydrateDraftsFromChat(updatedChat);
      setIsHeroExpanded(false);
      setIsEditMode(false);
    } catch (error) {
      Alert.alert(
        'Не удалось сохранить группу',
        error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
      );
    } finally {
      setSaving(false);
    }
  }, [avatarDraftUrl, chat, descriptionDraft, hydrateDraftsFromChat, nameDraft]);

  const toggleSearchUser = useCallback((user: ApiUser) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((item) => item.id === user.id);
      if (exists) {
        return prev.filter((item) => item.id !== user.id);
      }
      return [...prev, user];
    });
  }, []);

  const closeAddMembers = useCallback(() => {
    setIsAddMembersVisible(false);
    setAddMemberQuery('');
    setMemberSearchResults([]);
    setSelectedUsers([]);
  }, []);

  const handleAddMembers = useCallback(async () => {
    if (!chat || selectedUsers.length === 0) {
      Alert.alert('Нет участников', 'Выбери хотя бы одного человека для добавления.');
      return;
    }

    setAddingMembers(true);
    try {
      const updatedChat = await addGroupMembers(
        chat.id,
        selectedUsers.map((user) => user.id)
      );
      await persistChatLocally(updatedChat);
      closeAddMembers();
    } catch (error) {
      Alert.alert(
        'Не удалось добавить участников',
        error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
      );
    } finally {
      setAddingMembers(false);
    }
  }, [chat, closeAddMembers, selectedUsers]);

  const handleLeaveGroup = useCallback(() => {
    if (!chat) return;
    closeMoreMenu();
    Alert.alert('Покинуть группу?', 'Ты выйдешь из этой группы и чат исчезнет из списка.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Покинуть',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await leaveGroup(chat.id);
              await new ChatDao().delete(chat.id);
              messageStore.getState().clearMessages(chat.id);
              chatStore.getState().removeChat(chat.id);
              navigation.navigate('ChatList');
            } catch (error) {
              Alert.alert(
                'Не удалось выйти из группы',
                error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
              );
            }
          })();
        },
      },
    ]);
  }, [chat, closeMoreMenu, navigation]);

  const handleDeleteGroup = useCallback(() => {
    if (!chat) return;
    closeMoreMenu();
    Alert.alert('Удалить группу?', 'Группа будет удалена для всех участников.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteGroup(chat.id);
              await new ChatDao().delete(chat.id);
              messageStore.getState().clearMessages(chat.id);
              chatStore.getState().removeChat(chat.id);
              navigation.navigate('ChatList');
            } catch (error) {
              Alert.alert(
                'Не удалось удалить группу',
                error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
              );
            }
          })();
        },
      },
    ]);
  }, [chat, closeMoreMenu, navigation]);

  const moreMenuItems = useMemo<AnchoredPopoverMenuItem[]>(
    () =>
      isOwner
        ? [
            {
              key: 'delete-group',
              label: 'Удалить группу',
              icon: 'trash-2',
              color: '#D04857',
            },
          ]
        : [
            {
              key: 'leave-group',
              label: 'Покинуть группу',
              icon: 'log-out',
              color: '#D04857',
            },
          ],
    [isOwner]
  );

  const handleMoreMenuAction = useCallback(
    (key: string) => {
      if (key === 'leave-group') {
        handleLeaveGroup();
        return;
      }

      if (key === 'delete-group') {
        handleDeleteGroup();
      }
    },
    [handleDeleteGroup, handleLeaveGroup]
  );

  const selectedMemberForMenu = memberMenu?.member ?? null;

  const memberMenuItems = useMemo<AnchoredPopoverMenuItem[]>(() => {
    if (!selectedMemberForMenu || selectedMemberForMenu.user_id === currentUserId) {
      return [];
    }

    const items: AnchoredPopoverMenuItem[] = [
      {
        key: 'write',
        label: 'Написать',
        icon: 'message-circle',
        color: '#111827',
      },
    ];

    if (isOwner) {
      items.push({
        key: 'tag',
        label: 'Добавить тег участника',
        icon: 'tag',
        color: '#111827',
      });

      if (selectedMemberForMenu.role !== 'owner') {
        items.push({
          key: 'remove',
          label: 'Исключить',
          icon: 'trash-2',
          color: '#D04857',
        });
      }
    }

    return items;
  }, [currentUserId, isOwner, selectedMemberForMenu]);

  const resolvedMemberMenuItems = useMemo(
    () =>
      memberMenuItems.map((item) =>
        item.key === 'tag'
          ? {
              ...item,
              label: selectedMemberForMenu?.tag?.trim()
                ? 'Изменить тег участника'
                : 'Добавить тег участника',
            }
          : item
      ),
    [memberMenuItems, selectedMemberForMenu]
  );

  const handleWriteMember = useCallback(async () => {
    if (!selectedMemberForMenu || selectedMemberForMenu.user_id === currentUserId) return;

    try {
      const directChat = await createOrFindChat(selectedMemberForMenu.user_id);
      await persistChatLocally(directChat);
      navigation.navigate('Chat', {
        chatId: directChat.id,
        chatTitle:
          directChat.peer_display_name ??
          getDisplayNameFromMember(selectedMemberForMenu),
      });
    } catch (error) {
      Alert.alert(
        'Не удалось открыть чат',
        error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
      );
    }
  }, [currentUserId, navigation, selectedMemberForMenu]);

  const handleOpenTagEditor = useCallback(() => {
    if (!selectedMemberForMenu) return;
    setTagDraft(selectedMemberForMenu.tag?.trim() ?? '');
    setTagColorDraft(
      isGroupMemberTagColor(selectedMemberForMenu.tag_color)
        ? selectedMemberForMenu.tag_color
        : DEFAULT_MEMBER_TAG_COLOR
    );
    setTagEditorMember(selectedMemberForMenu);
  }, [selectedMemberForMenu]);

  const handleSaveMemberTag = useCallback(async () => {
    if (!chat || !tagEditorMember) return;

    setTagSaving(true);
    try {
      const updatedChat = await updateGroupMemberTag(chat.id, tagEditorMember.user_id, {
        tag: tagDraft,
        tag_color: tagDraft.trim() ? tagColorDraft : undefined,
      });
      await persistChatLocally(updatedChat);
      setTagEditorMember(null);
      setTagDraft('');
      setTagColorDraft(DEFAULT_MEMBER_TAG_COLOR);
    } catch (error) {
      Alert.alert(
        'Не удалось сохранить тег',
        error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
      );
    } finally {
      setTagSaving(false);
    }
  }, [chat, tagColorDraft, tagDraft, tagEditorMember]);

  const handleRemoveMember = useCallback(() => {
    if (!chat || !selectedMemberForMenu) return;

    Alert.alert(
      'Исключить участника?',
      `${getDisplayNameFromMember(selectedMemberForMenu)} будет удалён из группы.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Исключить',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const updatedChat = await removeGroupMember(chat.id, selectedMemberForMenu.user_id);
                await persistChatLocally(updatedChat);
              } catch (error) {
                Alert.alert(
                  'Не удалось исключить участника',
                  error instanceof Error ? error.message : 'Попробуй ещё раз чуть позже.'
                );
              }
            })();
          },
        },
      ]
    );
  }, [chat, selectedMemberForMenu]);

  const handleMemberMenuAction = useCallback(
    (key: string) => {
      closeMemberMenu(() => {
        if (key === 'write') {
          void handleWriteMember();
          return;
        }

        if (key === 'tag') {
          handleOpenTagEditor();
          return;
        }

        if (key === 'remove') {
          handleRemoveMember();
        }
      });
    },
    [closeMemberMenu, handleOpenTagEditor, handleRemoveMember, handleWriteMember]
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'participants':
        return (
          <GroupParticipantsSection
            isOwner={isOwner}
            currentUserId={currentUserId}
            members={members}
            onAddMembers={() => setIsAddMembersVisible(true)}
            onOpenMemberMenu={openMemberMenu}
          />
        );
      case 'media':
      case 'files':
      case 'voice':
        return (
          <GroupProfileMediaContent
            activeTab={activeTab}
            mediaItems={mediaItems}
            fileItems={fileItems}
            voiceItems={voiceItems}
            onOpenMedia={setSelectedMediaIndex}
            onOpenFile={handleOpenFile}
            onShowInChat={handleShowMessageInChat}
          />
        );
      default:
        return (
          <GroupParticipantsSection
            isOwner={isOwner}
            currentUserId={currentUserId}
            members={members}
            onAddMembers={() => setIsAddMembersVisible(true)}
            onOpenMemberMenu={openMemberMenu}
          />
        );
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />


      <Animated.ScrollView
        stickyHeaderIndices={isEditMode ? undefined : [1]}
        bounces
        overScrollMode="always"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <GroupProfileHeaderSection
          isOwner={isOwner}
          isEditMode={isEditMode}
          saving={saving}
          avatarUploading={avatarUploading}
          avatarUrl={avatarUrl}
          displayName={displayName}
          memberCountLabel={refreshing ? '??????????' : formatMemberCount(members.length)}
          description={description}
          nameDraft={nameDraft}
          descriptionDraft={descriptionDraft}
          isMuted={isMuted}
          isExpanded={isHeroExpanded && !isEditMode}
          expandedHeroWidth={expandedHeroWidth}
          expandedHeroHeight={expandedHeroHeight}
          moreButtonRef={moreButtonRef}
          moreWaveStyle={moreWaveStyle}
          moreIconScale={moreIconScale}
          onBackOrCancel={() => {
            if (isEditMode) {
              handleCancelEdit();
              return;
            }
            navigation.goBack();
          }}
          onPrimaryPress={isEditMode ? () => void handleSaveGroup() : handleEnterEditMode}
          onPickAvatar={() => void handlePickAvatar()}
          onToggleHeroExpanded={() => setIsHeroExpanded((current) => !current)}
          onChangeName={setNameDraft}
          onChangeDescription={setDescriptionDraft}
          onToggleMute={handleToggleMute}
          onSearch={handleSearchPress}
          onOpenMoreMenu={openMoreMenu}
        />

        {!isEditMode ? (
          <GroupProfileStickyTabs
            displayName={displayName}
            memberCountLabel={formatMemberCount(members.length)}
            activeTab={activeTab}
            tabs={GROUP_TAB_ITEMS}
            compactHeaderStyle={compactHeaderStyle}
            onBack={() => navigation.goBack()}
            onSearch={handleSearchPress}
            onSelectTab={(tab) => setActiveTab(tab as GroupTabKey)}
          />
        ) : null}

        {!isEditMode ? renderTabContent() : null}
      </Animated.ScrollView>

      <AnchoredPopoverMenu
        menu={moreMenu}
        animation={moreMenuAnimation}
        items={moreMenuItems}
        onClose={closeMoreMenu}
        onSelect={handleMoreMenuAction}
        horizontalAlign="end"
        offsetY={8}
      />

      <AnchoredPopoverMenu
        menu={
          memberMenu
            ? {
                left: memberMenu.left,
                top: memberMenu.top,
                width: memberMenu.width,
                height: memberMenu.height,
              }
            : null
        }
        animation={memberMenuAnimation}
        items={resolvedMemberMenuItems}
        onClose={closeMemberMenu}
        onSelect={handleMemberMenuAction}
        width={248}
        horizontalAlign="start"
        offsetY={6}
        verticalAlign="auto"
      />

      <GroupProfileMediaViewerModal
        visible={selectedMediaIndex != null}
        mediaItems={mediaItems}
        selectedIndex={selectedMediaIndex}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onClose={() => setSelectedMediaIndex(null)}
        onChangeIndex={setSelectedMediaIndex}
        onShowInChat={handleShowMessageInChat}
      />


      <GroupMemberTagModal
        visible={tagEditorMember != null}
        member={tagEditorMember}
        tagDraft={tagDraft}
        tagColorDraft={tagColorDraft}
        tagSaving={tagSaving}
        onChangeTag={setTagDraft}
        onChangeColor={setTagColorDraft}
        onClose={() => {
          setTagEditorMember(null);
          setTagDraft('');
          setTagColorDraft(DEFAULT_MEMBER_TAG_COLOR);
        }}
        onSave={() => void handleSaveMemberTag()}
      />

      <GroupAddMembersModal
        visible={isAddMembersVisible}
        bottomInset={insets.bottom}
        query={addMemberQuery}
        selectedUsers={selectedUsers}
        filteredSearchResults={filteredSearchResults}
        selectedUserIds={selectedUserIds}
        memberSearchLoading={memberSearchLoading}
        addingMembers={addingMembers}
        onChangeQuery={setAddMemberQuery}
        onToggleUser={toggleSearchUser}
        onClose={closeAddMembers}
        onSubmit={() => void handleAddMembers()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EEF1F7',
  },
  scrollContent: {
    paddingHorizontal: 14,
  },
});
