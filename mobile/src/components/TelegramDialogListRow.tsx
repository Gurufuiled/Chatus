import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import type { TelegramDialogRow } from '../stores/telegramAccountStore';
import { useTheme } from '../contexts/ThemeContext';
import { createChatListRowStyles } from './chatListRow.styles';
import { DialogListPreview } from './DialogListPreview';
import { formatMessageTime } from '../utils/formatMessageTime';

const AVATAR_COLORS = [
  '#5B8DEF',
  '#53B7A8',
  '#F2994A',
  '#BB6BD9',
  '#EB5757',
  '#2D9CDB',
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatChatTime(timestamp: number | null | undefined) {
  if (!timestamp) return '';
  return formatMessageTime(timestamp);
}

type Props = {
  item: TelegramDialogRow;
  navigation: NativeStackNavigationProp<ChatsStackParamList>;
  onLongPress?: (item: TelegramDialogRow, event: any) => void;
};

export const TelegramDialogListRow = React.memo(
  function TelegramDialogListRow({
    item,
    navigation,
    onLongPress,
  }: Props) {
  const { colors } = useTheme();
  const rowStyles = useMemo(() => createChatListRowStyles(colors), [colors]);
  const isChannel = item.chatType === 'channel';
  const isGroup = item.chatType === 'group' || item.chatType === 'supergroup';
  const title = typeof item.title === 'string' ? item.title : 'Чат';
  const previewText =
    typeof item.lastMessagePreview === 'string' ? item.lastMessagePreview : '';
  const previewThumbs = Array.isArray(item.lastMessageThumbnailUris)
    ? item.lastMessageThumbnailUris.filter(
        (uri): uri is string => typeof uri === 'string' && uri.length > 0,
      )
    : [];

  const rowNavParams = {
    telegramChatId: item.chatId,
    title,
    avatarUri: item.avatarUri ?? null,
    chatType: item.chatType ?? null,
  };

  return (
    <View style={rowStyles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Профиль: ${title}`}
        accessibilityHint="Открывает экран профиля чата или канала"
        onPress={() => navigation.navigate('TelegramChatProfile', rowNavParams)}
      >
        {item.avatarUri ? (
          <Image source={{ uri: item.avatarUri }} style={rowStyles.avatar} />
        ) : (
          <View
            style={[
              rowStyles.avatarPlaceholder,
              isChannel
                ? rowStyles.channelAvatarPlaceholder
                : { backgroundColor: getAvatarColor(title) },
            ]}
          >
            <Text style={rowStyles.avatarPlaceholderText}>
              {isChannel ? '📢' : (title.trim()[0] || '?').toUpperCase()}
            </Text>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('TelegramChat', rowNavParams)}
        onLongPress={(event) => onLongPress?.(item, event)}
        delayLongPress={220}
        style={({ pressed }) => [
          rowStyles.content,
          pressed && rowStyles.rowPressed,
        ]}
      >
        <View style={rowStyles.topRow}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              minWidth: 0,
            }}
          >
            <Text style={rowStyles.title} numberOfLines={1}>
              {title}
            </Text>
            {isChannel ? (
              <Text style={{ fontSize: 11, color: colors.accent }}>канал</Text>
            ) : isGroup ? (
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                группа
              </Text>
            ) : null}
          </View>
          {item.lastMessageAt ? (
            <Text style={rowStyles.timeLabel}>
              {formatChatTime(item.lastMessageAt)}
            </Text>
          ) : null}
        </View>
        {previewText || previewThumbs.length > 0 || item.unreadCount > 0 ? (
          <View style={rowStyles.bottomRow}>
            {previewText || previewThumbs.length > 0 ? (
              <DialogListPreview
                text={previewText}
                thumbnailUris={previewThumbs}
                accentLabel={item.lastMessagePreviewAccent}
                colors={colors}
              />
            ) : (
              <View style={rowStyles.previewPlaceholder} />
            )}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              {item.isPinned ? (
                <MaterialCommunityIcons
                  name="pin"
                  size={18}
                  color={colors.iconMuted}
                  style={{ transform: [{ rotate: '45deg' }] }}
                />
              ) : null}
              {item.unreadCount > 0 ? (
                <View
                  style={[
                    rowStyles.unreadBadge,
                    item.unreadCount > 99 && rowStyles.unreadBadgeWide,
                  ]}
                >
                  <Text style={rowStyles.unreadBadgeText}>
                    {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
  },
  (prev, next) => {
    return (
      prev.item === next.item &&
      prev.navigation === next.navigation &&
      prev.onLongPress === next.onLongPress
    );
  },
);
