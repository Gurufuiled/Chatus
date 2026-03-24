import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatDao } from '../db';
import { useCall } from '../contexts/CallContext';
import { resolveAvatarUrl } from '../config';
import { ChatProfileHero } from '../components/ChatProfileHero';
import {
  ChatProfileMediaSection,
  type FileItem,
  type LinkItem,
  type MediaTile,
  type ProfileTabKey,
  type VoiceItem,
} from '../components/ChatProfileMediaSection';
import { ChatProfileOverlayLayer } from '../components/ChatProfileOverlayLayer';
import type { ChatsStackParamList } from '../navigation/types';
import type { ApiUser } from '../services/AuthService';
import { getUserProfile } from '../services/profileService';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { uiStore } from '../stores/uiStore';
import type { Message } from '../stores/types';
import { colors } from '../theme/colors';

type ChatProfileRoute = RouteProp<ChatsStackParamList, 'ChatProfile'>;
type ChatProfileNavigation = NativeStackNavigationProp<ChatsStackParamList, 'ChatProfile'>;

type InfoRow = {
  id: string;
  label: string;
  value: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
};

type ProfileActionMenuState = {
  messageId: string;
  top: number;
  left: number;
} | null;

const AVATAR_COLORS = [
  '#5B8DEF',
  '#53B7A8',
  '#F2994A',
  '#BB6BD9',
  '#EB5757',
  '#2D9CDB',
  '#27AE60',
  '#F2C94C',
];

const PROFILE_SCREEN_WIDTH = Dimensions.get('window').width;

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'РІ СЃРµС‚Рё';
  if (lastSeen) return 'Р±С‹Р»(Р°) РЅРµРґР°РІРЅРѕ';
  return 'Р±С‹Р»(Р°) РЅРµРґР°РІРЅРѕ';
}

function buildDisplayName(profile: ApiUser | null, fallbackTitle: string) {
  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    fallbackTitle ||
    'РџСЂРѕС„РёР»СЊ'
  );
}

function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Р‘`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} РљР‘`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} РњР‘`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Р“Р‘`;
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

function extractLinks(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.match(/https?:\/\/[^\s]+/gi);
  return matches ?? [];
}

function buildFileSubtitle(message: Message) {
  const media = message.media?.[0];
  const sizePart = formatFileSize(media?.file_size ?? undefined);
  const datePart = formatMessageDate(message.created_at);
  return sizePart ? `${sizePart} вЂў ${datePart}` : datePart;
}

function buildInfoRows(profile: ApiUser | null): InfoRow[] {
  const rows: InfoRow[] = [];

  if (profile?.phone?.trim()) {
    rows.push({
      id: 'phone',
      label: 'РњРѕР±РёР»СЊРЅС‹Р№',
      value: profile.phone.trim(),
      icon: 'phone',
    });
  }

  if (profile?.handle?.trim() || profile?.username?.trim()) {
    rows.push({
      id: 'username',
      label: 'РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ',
      value: profile?.handle?.trim()
        ? `@${profile.handle.trim()}`
        : profile?.username?.trim() || 'РќРµ СѓРєР°Р·Р°РЅРѕ',
      icon: 'at-sign',
    });
  }

  return rows;
}

function getFileExtension(fileName: string) {
  const ext = fileName.split('.').pop()?.trim() ?? '';
  if (!ext || ext === fileName) return 'FILE';
  return ext.slice(0, 4).toUpperCase();
}


type ProfileInfoCardProps = {
  infoRows: InfoRow[];
};

const ProfileInfoCard = React.memo(function ProfileInfoCard({
  infoRows,
}: ProfileInfoCardProps) {
  if (infoRows.length === 0) return null;

  return (
    <View style={styles.infoCard}>
      {infoRows.map((row, index) => (
        <View key={row.id}>
          <View style={styles.infoRow}>
            <View style={styles.infoRowTextWrap}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
            {row.icon ? (
              <View style={styles.infoIconWrap}>
                <Feather name={row.icon} size={16} color={colors.accent} />
              </View>
            ) : null}
          </View>
          {index !== infoRows.length - 1 ? <View style={styles.infoDivider} /> : null}
        </View>
      ))}
    </View>
  );
});

export function ChatProfileScreen() {
  const navigation = useNavigation<ChatProfileNavigation>();
  const route = useRoute<ChatProfileRoute>();
  const { chatId, userId, chatTitle } = route.params;
  const { startCall } = useCall();
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('media');
  const [selectedMediaUri, setSelectedMediaUri] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<ProfileActionMenuState>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [isMoreMenuVisible, setIsMoreMenuVisible] = useState(false);
  const actionMenuAnimation = useRef(new Animated.Value(0)).current;
  const heroAnimation = useRef(new Animated.Value(0)).current;

  const chat = chatStore(
    useCallback(
      (state) => state.chats.find((item) => item.id === chatId) ?? null,
      [chatId]
    )
  );
  const chatMessages = messageStore(
    useCallback(
      (state) => state.messagesByChatId[chatId] ?? [],
      [chatId]
    )
  );
  const livePresence = uiStore((s) => s.presenceByUserId[userId]);
  const isBlocked = uiStore((s) => Boolean(s.blockedUserIds[userId]));

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getUserProfile(userId);
        if (!isMounted) return;
        setProfile(data);
      } catch (e) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РїСЂРѕС„РёР»СЊ');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    void uiStore.getState().hydrateBlockedUsers();
  }, []);

  useEffect(() => {
    heroAnimation.stopAnimation();
    Animated.timing(heroAnimation, {
      toValue: isHeroExpanded ? 1 : 0,
      duration: isHeroExpanded ? 320 : 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
      isInteraction: false,
    }).start();
  }, [heroAnimation, isHeroExpanded]);

  const displayName = buildDisplayName(
    profile,
    chatTitle ?? chat?.peer_display_name ?? chat?.name ?? ''
  );
  const handleLabel = profile?.handle?.trim() ? `@${profile.handle.trim()}` : null;
  const avatarUrl = resolveAvatarUrl(profile?.avatar_url ?? chat?.avatar_url);
  const statusLabel = formatPresence(
    livePresence?.is_online ?? profile?.is_online,
    livePresence?.last_seen ?? profile?.last_seen
  );
  const avatarColor = useMemo(() => getAvatarColor(displayName), [displayName]);
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const isMuted = (chat?.is_muted ?? 0) === 1;
  const infoRows = useMemo(() => buildInfoRows(profile), [profile]);
  const expandedHeroWidth = PROFILE_SCREEN_WIDTH;
  const expandedHeroHeight = Math.min(Math.max(PROFILE_SCREEN_WIDTH * 0.92, 280), 360);

  const mediaItems = useMemo<MediaTile[]>(
    () =>
      chatMessages
        .filter(
          (message) =>
            !message.is_deleted &&
            (message.msg_type === 'image' || message.msg_type === 'video_note')
        )
        .map((message) => ({
          id: message.id,
          uri: extractMediaUri(message) ?? '',
          durationMs:
            message.msg_type === 'video_note'
              ? message.media?.[0]?.duration_ms ?? 0
              : undefined,
        }))
        .filter((item) => item.uri.length > 0),
    [chatMessages]
  );

  const fileItems = useMemo<FileItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'file')
        .map((message) => ({
          id: message.id,
          title: message.media?.[0]?.file_name || 'Р¤Р°Р№Р»',
          subtitle: buildFileSubtitle(message),
          uri: extractMediaUri(message),
          extension: getFileExtension(message.media?.[0]?.file_name || 'FILE'),
        })),
    [chatMessages]
  );

  const voiceItems = useMemo<VoiceItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'voice')
        .map((message) => ({
          id: message.id,
          uri: extractMediaUri(message),
          durationMs: message.media?.[0]?.duration_ms ?? 0,
          waveform: message.media?.[0]?.waveform ?? [],
          dateLabel: formatMessageDate(message.created_at),
        })),
    [chatMessages]
  );

  const linkItems = useMemo<LinkItem[]>(
    () =>
      chatMessages.flatMap((message) =>
        extractLinks(message.content).map((link, index) => ({
          id: `${message.id}-${index}`,
          title: link.replace(/^https?:\/\//, ''),
          subtitle: formatMessageDate(message.created_at),
          uri: link,
        }))
      ),
    [chatMessages]
  );


  const handleMutePress = useCallback(() => {
    if (!chat) return;
    chatStore.getState().updateChat({
      ...chat,
      is_muted: isMuted ? 0 : 1,
    });
  }, [chat, isMuted]);

  const handleSearchPress = useCallback(() => {
    navigation.navigate('Chat', {
      chatId,
      chatTitle,
      startSearch: true,
    });
  }, [chatId, chatTitle, navigation]);

  const handleStartCallPress = useCallback(async () => {
    try {
      await startCall({
        userId,
        displayName,
        avatarUrl,
        chatId,
      });
    } catch (error) {
      Alert.alert(
        'Не удалось начать звонок',
        error instanceof Error ? error.message : 'Попробуй еще раз чуть позже.'
      );
    }
  }, [avatarUrl, chatId, displayName, startCall, userId]);

  const handleMorePress = useCallback(() => {
    setIsMoreMenuVisible(true);
  }, []);

  const closeMoreMenu = useCallback(() => {
    setIsMoreMenuVisible(false);
  }, []);

  const handleToggleBlocked = () => {
    closeMoreMenu();
    const nextBlocked = !isBlocked;
    uiStore.getState().setUserBlocked(userId, nextBlocked);
    Alert.alert(
      nextBlocked ? 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ' : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ',
      nextBlocked
        ? `Р›РѕРєР°Р»СЊРЅРѕ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°Р»Рё ${displayName}. Р­С‚Рѕ СЃРѕСЃС‚РѕСЏРЅРёРµ РїРѕРєР° СЂР°Р±РѕС‚Р°РµС‚ С‚РѕР»СЊРєРѕ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ.`
        : `${displayName} СЃРЅРѕРІР° РґРѕСЃС‚СѓРїРµРЅ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ.`
    );
  };

  const deleteChatLocally = useCallback(async () => {
    try {
      await new ChatDao().delete(chatId);
      messageStore.getState().clearMessages(chatId);
      chatStore.getState().removeChat(chatId);
      navigation.navigate('ChatList');
    } catch {
      Alert.alert('РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С‡Р°С‚', 'РџРѕРїСЂРѕР±СѓР№ РµС‰Рµ СЂР°Р· С‡СѓС‚СЊ РїРѕР·Р¶Рµ.');
    }
  }, [chatId, navigation]);

  const handleDeleteChatPress = () => {
    closeMoreMenu();
    Alert.alert('РЈРґР°Р»РёС‚СЊ С‡Р°С‚?', 'Р’С‹Р±РµСЂРё, РєР°Рє СѓРґР°Р»РёС‚СЊ СЌС‚РѕС‚ РґРёР°Р»РѕРі.', [
      { text: 'РћС‚РјРµРЅР°', style: 'cancel' },
      {
        text: `РЈРґР°Р»РёС‚СЊ Сѓ РјРµРЅСЏ Рё Сѓ ${displayName}`,
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'РџРѕРєР° РЅРµРґРѕСЃС‚СѓРїРЅРѕ',
            'Р­С‚РѕС‚ РІР°СЂРёР°РЅС‚ РїРѕС‚СЂРµР±СѓРµС‚ РѕС‚РґРµР»СЊРЅРѕРіРѕ СЃРµСЂРІРµСЂРЅРѕРіРѕ СѓРґР°Р»РµРЅРёСЏ С‡Р°С‚Р° РґР»СЏ РѕР±РѕРёС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ. РЎРµР№С‡Р°СЃ РјРѕР¶РЅРѕ СѓРґР°Р»РёС‚СЊ С‡Р°С‚ С‚РѕР»СЊРєРѕ Р»РѕРєР°Р»СЊРЅРѕ Сѓ СЃРµР±СЏ.'
          );
        },
      },
      {
        text: 'РЈРґР°Р»РёС‚СЊ Сѓ РјРµРЅСЏ',
        style: 'destructive',
        onPress: () => {
          Alert.alert('РЈРґР°Р»РёС‚СЊ С‚РѕР»СЊРєРѕ Сѓ С‚РµР±СЏ?', 'Р§Р°С‚ РёСЃС‡РµР·РЅРµС‚ С‚РѕР»СЊРєРѕ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ.', [
            { text: 'РћС‚РјРµРЅР°', style: 'cancel' },
            {
              text: 'РЈРґР°Р»РёС‚СЊ',
              style: 'destructive',
              onPress: () => {
                void deleteChatLocally();
              },
            },
          ]);
        },
      },
    ]);
  };

  const toggleHeroExpanded = useCallback(() => {
    if (!avatarUrl) return;
    setIsHeroExpanded((current) => !current);
  }, [avatarUrl]);

  const closeActionMenu = useCallback(
    (onClosed?: () => void) => {
      if (!actionMenu) {
        onClosed?.();
        return;
      }

      Animated.timing(actionMenuAnimation, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setActionMenu(null);
        onClosed?.();
      });
    },
    [actionMenu, actionMenuAnimation]
  );

  const handleShowInChat = (messageId: string) => {
    closeActionMenu(() => {
      navigation.navigate('Chat', {
        chatId,
        chatTitle,
        focusMessageId: messageId,
      });
    });
  };

  const openActionMenu = useCallback((messageId: string, event: GestureResponderEvent) => {
    const menuWidth = 176;
    const estimatedHeight = 44;
    const sideGap = 12;
    const left = Math.max(
      sideGap,
      Math.min(
        event.nativeEvent.pageX - menuWidth / 2,
        PROFILE_SCREEN_WIDTH - menuWidth - sideGap
      )
    );
    const top = Math.max(92, event.nativeEvent.pageY - estimatedHeight - 14);
    actionMenuAnimation.setValue(0);
    setActionMenu({
      messageId,
      top,
      left,
    });
  }, [actionMenuAnimation]);

  useEffect(() => {
    if (!actionMenu) return;

    Animated.spring(actionMenuAnimation, {
      toValue: 1,
      damping: 18,
      mass: 0.8,
      stiffness: 240,
      useNativeDriver: true,
    }).start();
  }, [actionMenu, actionMenuAnimation]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ChatProfileHero
          avatarUrl={avatarUrl}
          avatarColor={avatarColor}
          initial={initial}
          displayName={displayName}
          statusLabel={statusLabel}
          handleLabel={handleLabel}
          loading={loading}
          error={error}
          isMuted={isMuted}
          heroAnimation={heroAnimation}
          expandedHeroWidth={expandedHeroWidth}
          expandedHeroHeight={expandedHeroHeight}
          onToggleHeroExpanded={toggleHeroExpanded}
          onStartCallPress={handleStartCallPress}
          onMutePress={handleMutePress}
          onSearchPress={handleSearchPress}
          onMorePress={handleMorePress}
        />

        <ProfileInfoCard infoRows={infoRows} />

        <ChatProfileMediaSection
          activeTab={activeTab}
          mediaItems={mediaItems}
          fileItems={fileItems}
          voiceItems={voiceItems}
          linkItems={linkItems}
          onChangeTab={setActiveTab}
          onOpenMedia={setSelectedMediaUri}
          onOpenActionMenu={openActionMenu}
        />
      </ScrollView>
      <ChatProfileOverlayLayer
        isMoreMenuVisible={isMoreMenuVisible}
        isBlocked={isBlocked}
        onCloseMoreMenu={closeMoreMenu}
        onToggleBlocked={handleToggleBlocked}
        onDeleteChatPress={handleDeleteChatPress}
        selectedMediaUri={selectedMediaUri}
        onCloseMedia={() => setSelectedMediaUri(null)}
        actionMenu={actionMenu}
        actionMenuAnimation={actionMenuAnimation}
        onCloseActionMenu={() => closeActionMenu()}
        onShowInChat={handleShowInChat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },
  scrollContent: {
    paddingBottom: 28,
  },
  infoCard: {
    marginTop: 10,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  infoRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoRowTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.1)',
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E1E6EF',
  },
});


