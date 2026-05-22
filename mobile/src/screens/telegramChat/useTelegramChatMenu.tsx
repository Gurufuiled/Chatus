import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, View } from 'react-native';
import type { Message } from '../../stores/types';
import type { ThemeColors, ResolvedColorScheme } from '../../theme/palettes';
import {
  estimateMenuCardHeight,
  MENU_EDGE_GAP,
  MENU_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from '../chatScreen.shared';
import { TelegramChatMenuPreviewBody } from './TelegramChatMenuPreview';
import { getTelegramCopyableContent, telegramRowToInputReplyMessage } from './messageRow';
import {
  tdlibAddMessageReaction,
  tdlibDeleteMessages,
  tdlibPinChatMessage,
  tdlibUnpinChatMessage,
} from './tdlibChatActions';
import type { TelegramChatStyles } from './telegramChatStyles';
import { getTelegramRowTdMessageIds } from './telegramAlbumRows';
import type { TelegramMessageMenuState, TelegramMessageRow } from './types';
import type { ChatTheme } from '../../theme/chatThemes';

/** Совпадает с `REACTION_BAR_HEIGHT` + зазор в `ChatContextMenuOverlay`. */
const REACTION_BAR_HEIGHT = 42;
const REACTION_ABOVE_GAP = 6;
const MENU_REACTION_STACK = REACTION_BAR_HEIGHT + REACTION_ABOVE_GAP;
const TELEGRAM_MENU_ACTION_COUNT = 6;
const MENU_LAYOUT_GAP = 8;

type EdgeInsets = { top: number; bottom: number; left: number; right: number };
type TelegramMenuMode = 'actions' | 'deleteConfirm';
type TelegramMenuActionKey = 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select';
type TelegramOverlayActionKey = TelegramMenuActionKey | 'delete_confirm' | 'delete_cancel';

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
  pinnedMessageId: number | null;
  setPinnedMessageId: React.Dispatch<React.SetStateAction<number | null>>;
  ensureReady: () => Promise<void>;
  showMenuReactions?: boolean;
  onEnterSelection: (rowId: string) => void;
  onStartForward: (messageIds: number[]) => void;
  chatTheme?: ChatTheme;
  resolvedScheme?: ResolvedColorScheme;
  scrollTick?: number;
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
  pinnedMessageId,
  setPinnedMessageId,
  ensureReady,
  showMenuReactions = true,
  onEnterSelection,
  onStartForward,
  chatTheme: chatThemeProp,
  resolvedScheme: resolvedSchemeProp,
  scrollTick = 0,
}: UseTelegramChatMenuParams) {
  const [menuState, setMenuState] = useState<TelegramMessageMenuState>(null);
  const [menuMode, setMenuMode] = useState<TelegramMenuMode>('actions');
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});

  const activeMenuMessage = useMemo(() => {
    if (!menuState) return null;
    const row = messages.find((m) => m.id === menuState.messageId);
    return row ? telegramRowToInputReplyMessage(row, chatId) : null;
  }, [chatId, menuState, messages]);

  const activeMenuRow = useMemo(() => {
    if (!menuState) return null;
    return messages.find((m) => m.id === menuState.messageId) ?? null;
  }, [menuState, messages]);

  const canTdActOnMenuTarget = activeMenuRow != null && activeMenuRow.messageId > 0;
  const menuTargetIsPinned =
    canTdActOnMenuTarget &&
    pinnedMessageId != null &&
    activeMenuRow!.messageId === pinnedMessageId;
  const copyableContent = activeMenuRow ? getTelegramCopyableContent(activeMenuRow) : '';

  const telegramMenuActions = useMemo(() => {
    if (menuMode === 'deleteConfirm') {
      const isOwn = activeMenuRow?.outgoing === true;
      return [
        {
          key: 'delete_confirm',
          label: isOwn ? 'Удалить для всех' : 'Удалить у себя',
          icon: null,
          color: '#E53935',
          disabled: !canTdActOnMenuTarget,
          textOnly: true,
        },
        {
          key: 'delete_cancel',
          label: 'Отмена',
          icon: null,
          color: colors.textPrimary,
          disabled: false,
          textOnly: true,
        },
      ];
    }

    return [
      {
        key: 'reply',
        label: 'Ответить',
        icon: 'corner-left-up' as React.ComponentProps<typeof Feather>['name'],
        color: colors.textPrimary,
        disabled: !canTdActOnMenuTarget,
      },
      {
        key: 'copy',
        label: 'Скопировать',
        icon: 'copy' as React.ComponentProps<typeof Feather>['name'],
        color: copyableContent ? colors.textPrimary : colors.iconMuted,
        disabled: !copyableContent,
      },
      {
        key: 'pin',
        label: menuTargetIsPinned ? 'Открепить' : 'Закрепить',
        icon: 'bookmark' as React.ComponentProps<typeof Feather>['name'],
        color: canTdActOnMenuTarget ? colors.textPrimary : colors.iconMuted,
        disabled: !canTdActOnMenuTarget,
      },
      {
        key: 'forward',
        label: 'Переслать',
        icon: 'corner-up-right' as React.ComponentProps<typeof Feather>['name'],
        color: canTdActOnMenuTarget ? colors.textPrimary : colors.iconMuted,
        disabled: !canTdActOnMenuTarget,
      },
      {
        key: 'delete',
        label: 'Удалить',
        icon: 'trash-2' as React.ComponentProps<typeof Feather>['name'],
        color: '#E53935',
        disabled: !canTdActOnMenuTarget,
      },
      {
        key: 'select',
        label: 'Выбрать',
        icon: 'check-circle' as React.ComponentProps<typeof Feather>['name'],
        color: colors.textPrimary,
        disabled: false,
      },
    ];
  }, [
    activeMenuRow?.outgoing,
    canTdActOnMenuTarget,
    colors.iconMuted,
    colors.textPrimary,
    copyableContent,
    menuMode,
    menuTargetIsPinned,
  ]);

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
        setMenuMode('actions');
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

  const resolveMenuCardHeight = useCallback((mode: TelegramMenuMode) => {
    const actionCount = mode === 'deleteConfirm' ? 2 : TELEGRAM_MENU_ACTION_COUNT;
    return Math.max(
      estimateMenuCardHeight(actionCount),
      estimateMenuCardHeight(2),
    ) + 10;
  }, []);

  const openTelegramMessageMenu = useCallback(
    (row: TelegramMessageRow) => {
      if (row.messageId <= 0) return;
      setMenuMode('actions');
      const target = messageContentRefs.current[row.id];
      if (!target) return;
      Keyboard.dismiss();
      target.measureInWindow((pageX, pageY, width, height) => {
        const menuCardHeight = resolveMenuCardHeight('actions');
        const bottomSafety = 28;
        /** `inputBarHeight` уже включает paddingBottom дока из onLayout. */
        const effectiveBottom = SCREEN_HEIGHT - (inputBarHeight + bottomSafety);
        const previewWidth = Math.min(Math.ceil(width) + 1, SCREEN_WIDTH - MENU_EDGE_GAP * 2);
        const previewLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(pageX, SCREEN_WIDTH - previewWidth - MENU_EDGE_GAP),
        );
        const reactionReserve = showMenuReactions ? MENU_REACTION_STACK : 0;
        const minPreviewTop = Math.max(insets.top + 12, MENU_EDGE_GAP) + reactionReserve;
        const spaceForPreview =
          effectiveBottom - minPreviewTop - MENU_LAYOUT_GAP - menuCardHeight;
        const previewDisplayHeight = Math.min(height, Math.max(0, spaceForPreview));
        const columnBelowPreview = previewDisplayHeight + MENU_LAYOUT_GAP + menuCardHeight;
        const maxPreviewTopSoMenuFits = effectiveBottom - columnBelowPreview;

        let previewTop = Math.min(pageY, maxPreviewTopSoMenuFits);
        previewTop = Math.max(minPreviewTop, previewTop);

        if (previewTop + columnBelowPreview > effectiveBottom) {
          previewTop = Math.max(MENU_EDGE_GAP + reactionReserve, effectiveBottom - columnBelowPreview);
        }

        const menuTop = previewTop + previewDisplayHeight + MENU_LAYOUT_GAP;
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
          previewNaturalHeight: height,
          previewVerticalAlign: previewDisplayHeight < height - 1 ? 'top' : undefined,
          menuTop,
          menuLeft,
          placement: 'below',
        });
      });
    },
    [insets.top, inputBarHeight, resolveMenuCardHeight, showMenuReactions],
  );

  const confirmTelegramDelete = useCallback(
    async (row: TelegramMessageRow) => {
      const ids = getTelegramRowTdMessageIds(row);
      if (ids.length === 0) return;
      const revoke = row.outgoing === true;
      try {
        await ensureReady();
        await tdlibDeleteMessages(chatId, ids, revoke);
        closeMenu();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('Удаление', msg);
      }
    },
    [chatId, closeMenu, ensureReady],
  );

  const handleTelegramMenuAction = useCallback(
    async (key: TelegramMenuActionKey) => {
      if (!activeMenuMessage || !menuState) return;
      const row = messagesRef.current.find((r) => r.id === menuState.messageId);
      const tdId = row && row.messageId > 0 ? row.messageId : null;

      if (key === 'reply') {
        if (tdId != null) {
          setReplyToMessageId(tdId);
        }
        closeMenu();
        return;
      }

      if (key === 'copy') {
        const value = row ? getTelegramCopyableContent(row) : '';
        closeMenu();
        if (!value) {
          Alert.alert('Нечего копировать', 'В этом сообщении нет текста для копирования.');
          return;
        }
        try {
          await Clipboard.setStringAsync(value);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          Alert.alert('Копирование', msg);
        }
        return;
      }

      if (key === 'select') {
        onEnterSelection(menuState.messageId);
        closeMenu();
        return;
      }

      if (key === 'pin') {
        if (tdId == null) return;
        try {
          await ensureReady();
          if (menuTargetIsPinned) {
            await tdlibUnpinChatMessage(chatId, tdId);
            setPinnedMessageId(null);
          } else {
            await tdlibPinChatMessage(chatId, tdId);
            setPinnedMessageId(tdId);
          }
          closeMenu();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          Alert.alert('Закрепление', msg);
        }
        return;
      }

      if (key === 'forward') {
        if (!row) return;
        const forwardIds = getTelegramRowTdMessageIds(row);
        if (forwardIds.length === 0) return;
        closeMenu();
        setTimeout(() => {
          onStartForward(forwardIds);
        }, 150);
        return;
      }

      if (key === 'delete') {
        if (tdId == null || !row) return;
        setMenuMode('deleteConfirm');
        return;
      }
    },
    [
      activeMenuMessage,
      chatId,
      closeMenu,
      ensureReady,
      menuState,
      menuTargetIsPinned,
      messagesRef,
      onEnterSelection,
      onStartForward,
      setPinnedMessageId,
      setReplyToMessageId,
    ],
  );

  const handleTelegramDeleteConfirmAction = useCallback(
    (key: TelegramOverlayActionKey) => {
      if (!menuState) return;
      const row = messagesRef.current.find((r) => r.id === menuState.messageId);
      const tdId = row && row.messageId > 0 ? row.messageId : null;

      if (key === 'delete_cancel') {
        setMenuMode('actions');
        return;
      }

      if (key === 'delete_confirm' && row) {
        void confirmTelegramDelete(row);
      }
    },
    [confirmTelegramDelete, menuState, messagesRef],
  );

  const handleTelegramPickReaction = useCallback(
    async (emoji: string) => {
      if (!menuState) return;
      const row = messagesRef.current.find((r) => r.id === menuState.messageId);
      if (!row || row.messageId <= 0) return;
      try {
        await ensureReady();
        await tdlibAddMessageReaction(chatId, row.messageId, emoji, false);
        closeMenu();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('Реакция', msg);
      }
    },
    [chatId, closeMenu, ensureReady, menuState, messagesRef],
  );

  const renderTelegramMenuPreviewBody = useCallback(
    (message: Message, forcedWidth?: number) => {
      const numericId = Number(message.id);
      const row =
        (!Number.isNaN(numericId) ? messageById.get(numericId) : undefined) ??
        messagesRef.current.find(
          (r) => r.id === message.id || String(r.messageId) === message.id,
        );
      return (
        <TelegramChatMenuPreviewBody
          message={message}
          forcedWidth={forcedWidth}
          previewMaxHeight={menuState?.previewHeight}
          row={row}
          messageById={messageById}
          colors={colors}
          styles={styles}
          headerTitle={headerTitle}
          isGroupChat={isGroupChat}
          chatTheme={chatThemeProp}
          resolvedScheme={resolvedSchemeProp}
          scrollTick={scrollTick}
        />
      );
    },
    [
      chatThemeProp,
      colors,
      headerTitle,
      isGroupChat,
      menuState?.previewHeight,
      messageById,
      messagesRef,
      resolvedSchemeProp,
      scrollTick,
      styles,
    ],
  );

  return {
    menuState,
    menuMode,
    menuAnim,
    telegramMenuActions,
    activeMenuMessage,
    setMessageContentRef,
    closeMenu,
    openTelegramMessageMenu,
    handleTelegramMenuAction,
    handleTelegramDeleteConfirmAction,
    handleTelegramPickReaction,
    renderTelegramMenuPreviewBody,
  };
}
