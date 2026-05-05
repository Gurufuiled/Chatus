import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, View } from 'react-native';
import type { Message } from '../../stores/types';
import type { ThemeColors } from '../../theme/palettes';
import {
  estimateMenuCardHeight,
  getCopyableContent,
  MENU_EDGE_GAP,
  MENU_HEIGHT,
  MENU_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from '../chatScreen.shared';
import { TelegramChatMenuPreviewBody } from './TelegramChatMenuPreview';
import { telegramRowToInputReplyMessage } from './messageRow';
import type { TelegramChatStyles } from './telegramChatStyles';
import type { TelegramMessageMenuState, TelegramMessageRow } from './types';

type EdgeInsets = { top: number; bottom: number; left: number; right: number };

type UseTelegramChatMenuParams = {
  chatId: number;
  messages: TelegramMessageRow[];
  messagesRef: React.MutableRefObject<TelegramMessageRow[]>;
  messageById: Map<number, TelegramMessageRow>;
  colors: ThemeColors;
  styles: TelegramChatStyles;
  headerTitle: string;
  isGroupChat: boolean;
  inputBarHeight: number;
  insets: EdgeInsets;
  setReplyToMessageId: React.Dispatch<React.SetStateAction<number | null>>;
};

export function useTelegramChatMenu({
  chatId,
  messages,
  messagesRef,
  messageById,
  colors,
  styles,
  headerTitle,
  isGroupChat,
  inputBarHeight,
  insets,
  setReplyToMessageId,
}: UseTelegramChatMenuParams) {
  const [menuState, setMenuState] = useState<TelegramMessageMenuState>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});

  const activeMenuMessage = useMemo(() => {
    if (!menuState) return null;
    const row = messages.find((m) => m.id === menuState.messageId);
    return row ? telegramRowToInputReplyMessage(row, chatId) : null;
  }, [chatId, menuState, messages]);

  const telegramMenuActions = useMemo(
    () => [
      {
        key: 'reply',
        label: 'Ответить',
        icon: 'corner-left-up' as React.ComponentProps<typeof Feather>['name'],
        color: colors.textPrimary,
        disabled: false,
      },
      {
        key: 'copy',
        label: 'Скопировать',
        icon: 'copy' as React.ComponentProps<typeof Feather>['name'],
        color: colors.textPrimary,
        disabled: false,
      },
      {
        key: 'pin',
        label: 'Закрепить',
        icon: 'bookmark' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
      {
        key: 'forward',
        label: 'Переслать',
        icon: 'corner-up-right' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
      {
        key: 'delete',
        label: 'Удалить',
        icon: 'trash-2' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
      {
        key: 'select',
        label: 'Выбрать',
        icon: 'check-circle' as React.ComponentProps<typeof Feather>['name'],
        color: colors.iconMuted,
        disabled: true,
      },
    ],
    [colors.iconMuted, colors.textPrimary],
  );

  const setMessageContentRef = useCallback((messageId: string, node: View | null) => {
    if (node) {
      messageContentRefs.current[messageId] = node;
    } else {
      delete messageContentRefs.current[messageId];
    }
  }, []);

  const closeMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMenuState(null);
      }
    });
  }, [menuAnim]);

  useEffect(() => {
    if (!menuState) {
      menuAnim.setValue(0);
      return;
    }
    Animated.spring(menuAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [menuAnim, menuState]);

  const openTelegramMessageMenu = useCallback(
    (row: TelegramMessageRow) => {
      if (row.messageId <= 0) return;
      const target = messageContentRefs.current[row.id];
      if (!target) return;
      Keyboard.dismiss();
      target.measureInWindow((pageX, pageY, width, height) => {
        const menuGap = 4;
        const menuCardHeight = Math.max(MENU_HEIGHT, estimateMenuCardHeight(2)) + 10;
        const bottomSafety = 28;
        const composerOffset = inputBarHeight + Math.max(insets.bottom, 12);
        const effectiveBottom = SCREEN_HEIGHT - (composerOffset + bottomSafety);
        const previewWidth = Math.min(Math.ceil(width) + 1, SCREEN_WIDTH - MENU_EDGE_GAP * 2);
        const previewLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(pageX, SCREEN_WIDTH - previewWidth - MENU_EDGE_GAP),
        );
        const minPreviewTop = Math.max(insets.top + 12, MENU_EDGE_GAP);
        const spaceForPreview = effectiveBottom - minPreviewTop - menuGap - menuCardHeight;
        const previewDisplayHeight = Math.min(height, Math.max(0, spaceForPreview));
        const columnBelowPreview = previewDisplayHeight + menuGap + menuCardHeight;
        let previewTop = Math.min(pageY, effectiveBottom - columnBelowPreview);
        previewTop = Math.max(minPreviewTop, previewTop);
        if (previewTop + columnBelowPreview > effectiveBottom) {
          previewTop = Math.max(MENU_EDGE_GAP, effectiveBottom - columnBelowPreview);
        }
        const menuTop = previewTop + previewDisplayHeight + menuGap;
        const menuLeftBase = row.outgoing
          ? previewLeft + previewWidth - MENU_WIDTH
          : previewLeft;
        const menuLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(menuLeftBase, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP),
        );
        setMenuState({
          messageId: row.id,
          isMe: row.outgoing,
          previewTop,
          previewLeft,
          previewWidth,
          previewHeight: previewDisplayHeight,
          menuTop,
          menuLeft,
          placement: 'below',
        });
      });
    },
    [insets.bottom, insets.top, inputBarHeight],
  );

  const handleTelegramMenuAction = useCallback(
    async (key: string) => {
      if (!activeMenuMessage) return;
      switch (key) {
        case 'reply': {
          const id = Number.parseInt(activeMenuMessage.id, 10);
          if (Number.isFinite(id) && id > 0) {
            setReplyToMessageId(id);
          }
          closeMenu();
          return;
        }
        case 'copy': {
          const value = getCopyableContent(activeMenuMessage);
          closeMenu();
          if (!value) {
            Alert.alert('Нечего копировать', 'В этом сообщении нет текста для копирования.');
            return;
          }
          await Clipboard.setStringAsync(value);
          return;
        }
        default:
          return;
      }
    },
    [activeMenuMessage, closeMenu, setReplyToMessageId],
  );

  const renderTelegramMenuPreviewBody = useCallback(
    (message: Message, forcedWidth?: number) => {
      const row = messagesRef.current.find((r) => r.id === message.id);
      return (
        <TelegramChatMenuPreviewBody
          message={message}
          forcedWidth={forcedWidth}
          row={row}
          messageById={messageById}
          colors={colors}
          styles={styles}
          headerTitle={headerTitle}
          isGroupChat={isGroupChat}
        />
      );
    },
    [colors, headerTitle, isGroupChat, messageById, messagesRef, styles],
  );

  return {
    menuState,
    menuAnim,
    telegramMenuActions,
    activeMenuMessage,
    setMessageContentRef,
    closeMenu,
    openTelegramMessageMenu,
    handleTelegramMenuAction,
    renderTelegramMenuPreviewBody,
  };
}
