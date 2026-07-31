import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  AppState,
  Easing,
  InteractionManager,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextLayoutEvent,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';
import Reanimated, {
  Easing as ReaEasing,
  FadeInDown,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';
import { composerPresentation } from '../presentation';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { typography, MIN_TAP_TARGET } from '../theme/colors';
import { DocumentPickerService } from '../services/DocumentPickerService';
import { VoiceRecorderService, type VoiceRecordingResult } from '../services/VoiceRecorderService';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import type { Message } from '../stores/types';
import { ensureVideoThumbnailUri } from '../utils/videoThumbnail';
import {
  InputAttachmentSheet,
  type GalleryItem,
} from './InputAttachmentSheet';
import {
  clearAttachmentGalleryDiskCache,
  readAttachmentGalleryDiskCache,
  writeAttachmentGalleryDiskCache,
} from '../services/attachmentGalleryDiskCache';
import { InputVoiceRecordingStage } from './InputVoiceRecordingStage';
import { buildReplyPreviewText, getReplyPreviewThumbnailUri } from './ReplyPreview';
import { usePeerFirstResolvedUri } from './peerFirstMedia';
import { VideoNoteRecorder } from './VideoNoteRecorder';
import { StickerPackSheet } from './StickerPackSheet';
import type { SendChannelAnchorRect } from './SendChannelSelector';
import { PlatformSourceIcon } from './PlatformSourceIcon';
import type { ChatusStickerRef } from '../stickers/chatusStickerCatalog';
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  COMPOSER_INPUT_MIN_HEIGHT,
  composerInputHeightForLineCount,
  shouldScrollComposerInput,
} from './composerSizing';
import {
  friendStickerIdToEmoji,
  getFriendStickerIdForEmoji,
  encodeStickerPayload,
} from '../stickers/chatusStickerCatalog';
import {
  hapticStickerSheetDismiss,
  hapticStickerSheetOpen,
} from '../stickers/chatusStickerPanelHaptics';
import type { StickerPanelTopTab } from '../stickers/stickerPanelPreferences';

/** Ниже — кнопка стикеров уезжает к скрепке (фаза 3.2 журнала), чтобы не сжимать поле и микрофон. */
const COMPOSER_NARROW_BREAKPOINT = 380;

/** Smooth height rise only — no spring bounce on the composer dock. */
const REPLY_LAYOUT_MS = 180;
const REPLY_STRIP_ENTERING = FadeInDown.duration(REPLY_LAYOUT_MS).easing(
  ReaEasing.out(ReaEasing.cubic),
);
const REPLY_STRIP_EXITING = FadeOutUp.duration(140).easing(ReaEasing.in(ReaEasing.cubic));
const COMPOSER_DOCK_LAYOUT = LinearTransition.duration(REPLY_LAYOUT_MS).easing(
  ReaEasing.out(ReaEasing.cubic),
);
export interface MediaPickResult {
  kind: 'image' | 'video';
  uri: string;
  previewUri?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fileName?: string;
  mimeType?: string;
  caption?: string;
}

export interface MediaAlbumPickResult {
  items: MediaPickResult[];
  caption?: string;
}

export interface FilePickResult {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

export interface InputBarProps {
  onSendText: (text: string, sendOptions?: { chatusStickerSoloSend?: boolean }) => void;
  onSendVoice: (result: VoiceRecordingResult) => void | Promise<void>;
  onSendVideoNote?: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onSendMedia?: (result: MediaPickResult) => void | Promise<void>;
  onSendMediaAlbum?: (result: MediaAlbumPickResult) => void | Promise<void>;
  onSendFile?: (result: FilePickResult) => void | Promise<void>;
  blurTargetRef?: React.RefObject<View | null>;
  placeholder?: string;
  onInputChange?: (text: string) => void;
  replyToMessage?: Message | null;
  replyAuthorName?: string | null;
  onCancelReply?: () => void;
  isScreenFocused?: boolean;
  onVoiceActiveChange?: (isActive: boolean) => void;
  /** When set, disables message composition and explains why the group is read-only. */
  textRestriction?: string | null;
  /**
   * Если задано — голосовые/видео-кружки отключены, а при попытке записи
   * показывается telegram-style всплывающая подсказка с этим текстом.
   */
  voiceRestriction?: string | null;
  /**
   * Если задано — скрепка/галерея/файлы отключены, при нажатии показывается
   * такая же подсказка с этим текстом.
   */
  mediaRestriction?: string | null;
  /** Момент времени (ms), когда истечёт антифлуд; плашка с таймером до этого момента */
  commentCooldownEndsAt?: number | null;
  /** Вызывается, когда таймер дошёл до нуля (скрыть состояние в родителе) */
  onCommentCooldownClear?: () => void;
  /** LineSync line id (chat id) — peer-first превью ответа в композере. */
  replyPeerFirstLineId?: string | null;
  /** Chatus: кнопка стикеров + шторка; стикеры friend-пака вставляются в поле как эмодзи, solo-отправка — JSON `encodeStickerPayload` в `onSendText`. */
  chatusStickersComposer?: boolean;
  /** Если true, заменяет микрофон на колокольчик (админ канала). */
  isChannelAdmin?: boolean;
  /** Текущий статус беззвучного режима (админ канала). */
  channelSilentMode?: boolean;
  /** Коллбек при нажатии на колокольчик. */
  onToggleChannelSilentMode?: () => void;
  sendChannel?: import('../stores/types').MessageSource;
  onSendChannelChange?: (channel: import('../stores/types').MessageSource) => void;
  telegramAvailable?: boolean;
  /** Открыть меню выбора канала (рендер оверлея — на уровне экрана, без Modal). */
  onSendChannelMenuOpen?: (anchor: SendChannelAnchorRect) => void;
  /** Закрыть меню (например при blur экрана). */
  onSendChannelMenuDismiss?: () => void;
  /** Ref для возврата фокуса в TextInput после закрытия меню. */
  composerFocusRef?: React.MutableRefObject<(() => void) | null>;
}

type AttachmentAction = {
  key: string;
  title: string;
  tone: 'file' | 'video';
  onPress: () => Promise<void>;
};

/** Переживает размонтирование InputBar — без повторного MediaLibrary + N×getAssetInfoAsync при возврате в чат. */
let sharedAttachmentGalleryCache: GalleryItem[] | null = null;
let sharedAttachmentGalleryCachedAtMs = 0;

const ATTACHMENT_GALLERY_CACHE_TTL_MS = 5 * 60 * 1000;
const ATTACHMENT_GALLERY_PAGE_SIZE = 60;

type VoiceRecordMode = 'idle' | 'holding' | 'locked';
type RecordingEntryMode = 'voice' | 'video';

const VOICE_LOCK_THRESHOLD = 88;
const VOICE_CANCEL_THRESHOLD = 56;
const VOICE_CANCEL_TRIGGER_PROGRESS = 0.84;
const VOICE_MAX_UP_DRAG = 108;
const VOICE_MAX_LEFT_DRAG = 92;
const VOICE_HOLD_TO_RECORD_MS = 170;
const ENTRY_MODE_TAP_SLOP = 10;
const VIDEO_NOTE_SWIPE_TRIGGER = 34;
const VOICE_START_WATCHDOG_MS = 5000;

function PaperclipIcon() {
  const { colors } = useTheme();
  return <Feather name="paperclip" size={20} color={colors.iconMuted} />;
}

function MicIcon() {
  const { colors } = useTheme();
  return <Feather name="mic" size={19} color={colors.iconMuted} />;
}

function VideoNoteIcon() {
  const { colors } = useTheme();
  return <Feather name="video" size={17} color={colors.iconMuted} />;
}

function SendIcon() {
  const { colors } = useTheme();
  return <Feather name="send" size={18} color={colors.accent} />;
}

function inferMimeTypeFromFileName(
  fileName: string | undefined,
  kind: MediaPickResult['kind']
): string | undefined {
  const normalized = fileName?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (kind === 'video') {
    if (normalized.endsWith('.mov')) return 'video/quicktime';
    if (normalized.endsWith('.webm')) return 'video/webm';
    if (normalized.endsWith('.mkv')) return 'video/x-matroska';
    if (normalized.endsWith('.avi')) return 'video/x-msvideo';
    return 'video/mp4';
  }
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.heic')) return 'image/heic';
  if (normalized.endsWith('.heif')) return 'image/heif';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function resolveGalleryItemKind(
  mediaType: MediaLibrary.MediaTypeValue | undefined
): GalleryItem['kind'] {
  if (mediaType === MediaLibrary.MediaType.video) {
    return 'video';
  }
  return 'image';
}

export function InputBar({
  onSendText,
  onSendVoice,
  onSendVideoNote,
  onSendMedia,
  onSendMediaAlbum,
  onSendFile,
  blurTargetRef,
  placeholder = 'Сообщение',
  onInputChange,
  replyToMessage = null,
  replyAuthorName = null,
  onCancelReply,
  isScreenFocused = true,
  onVoiceActiveChange,
  textRestriction = null,
  voiceRestriction = null,
  mediaRestriction = null,
  commentCooldownEndsAt = null,
  onCommentCooldownClear,
  replyPeerFirstLineId = null,
  chatusStickersComposer = false,
  isChannelAdmin,
  channelSilentMode,
  onToggleChannelSilentMode,
  sendChannel = 'chatus',
  onSendChannelChange,
  telegramAvailable = false,
  onSendChannelMenuOpen,
  onSendChannelMenuDismiss,
  composerFocusRef,
}: InputBarProps) {
  const { width: windowWidth } = useWindowDimensions();
  const narrowComposer = windowWidth < COMPOSER_NARROW_BREAKPOINT;
  const stickerInLeadingCluster = narrowComposer && chatusStickersComposer;

  const { colors: themeColors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createInputBarStyles(themeColors, isDark), [themeColors, isDark]);
  const inputRef = useRef<TextInput>(null);
  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [stickerSheetBootTab, setStickerSheetBootTab] = useState<StickerPanelTopTab | null>(null);
  const sendAnchorRef = useRef<View>(null);
  const [inputText, setInputText] = useState('');
  const [composerInputHeight, setComposerInputHeight] = useState(COMPOSER_INPUT_MIN_HEIGHT);
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryLoadingMore, setGalleryLoadingMore] = useState(false);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaPickResult | null>(null);
  const [selectedGalleryItems, setSelectedGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryCaption, setGalleryCaption] = useState('');
  const [voiceRecordModeState, setVoiceRecordModeState] = useState<VoiceRecordMode>('idle');
  const [recordingEntryModeState, setRecordingEntryModeState] =
    useState<RecordingEntryMode>('voice');
  const [voiceTouchTracking, setVoiceTouchTracking] = useState(false);
  const [voiceRecordingStartedAtMs, setVoiceRecordingStartedAtMs] = useState(0);

  const galleryEndCursorRef = useRef<string | undefined>(undefined);
  const galleryHasNextPageRef = useRef(false);
  const galleryLoadingMoreRef = useRef(false);
  const voiceRecordModeRef = useRef<VoiceRecordMode>('idle');
  const recordingEntryModeRef = useRef<RecordingEntryMode>('voice');
  const voiceStartPendingRef = useRef(false);
  const voiceFinalizePendingRef = useRef(false);
  const voiceRecordingReadyRef = useRef(false);
  const pendingVoiceOutcomeRef = useRef<'send' | 'cancel' | null>(null);
  const voiceCancelProgressRef = useRef(0);
  const voiceLockedSnapshotRef = useRef(false);
  const voiceGestureActiveRef = useRef(false);
  const entryModeTapEligibleRef = useRef(false);
  const videoSwipeTriggeredRef = useRef(false);
  const voiceHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceHoldActivatedRef = useRef(false);
  const voiceDragXAnimated = useRef(new RNAnimated.Value(0)).current;
  const voiceDragYAnimated = useRef(new RNAnimated.Value(0)).current;
  const voiceCancelProgressAnimated = useRef(new RNAnimated.Value(0)).current;
  const voiceLockProgressAnimated = useRef(new RNAnimated.Value(0)).current;
  const entryModeProgressAnimated = useRef(new RNAnimated.Value(0)).current;

  const hasText = inputText.trim().length > 0;
  const hasPendingMedia = pendingMedia != null;
  const canSend = !textRestriction && (hasText || hasPendingMedia);
  const isVoiceRecording = voiceRecordModeState !== 'idle';
  const isVoiceLocked = voiceRecordModeState === 'locked';
  const canUseVideoNotes = onSendVideoNote != null;

  React.useEffect(() => {
    onVoiceActiveChange?.(isVoiceRecording);
  }, [isVoiceRecording, onVoiceActiveChange]);
  const isVideoEntryMode = canUseVideoNotes && recordingEntryModeState === 'video';
  const replyPreviewText = buildReplyPreviewText(replyToMessage);
  const replyPreviewThumbnailUri = getReplyPreviewThumbnailUri(replyToMessage);
  const resolvedReplyThumbnailUri = usePeerFirstResolvedUri(
    replyPeerFirstLineId,
    replyPreviewThumbnailUri
  );

  const setVoiceRecordMode = useCallback((mode: VoiceRecordMode) => {
    voiceRecordModeRef.current = mode;
    setVoiceRecordModeState(mode);
  }, []);

  const setRecordingEntryMode = useCallback((mode: RecordingEntryMode) => {
    recordingEntryModeRef.current = mode;
    setRecordingEntryModeState(mode);
  }, []);

  const updateVoiceGestureState = useCallback(
    (dragX: number, dragY: number, cancelProgress: number, lockProgress: number) => {
      voiceDragXAnimated.setValue(dragX);
      voiceDragYAnimated.setValue(dragY);
      voiceCancelProgressAnimated.setValue(cancelProgress);
      voiceLockProgressAnimated.setValue(lockProgress);
      voiceCancelProgressRef.current = cancelProgress;
      voiceLockedSnapshotRef.current = voiceRecordModeRef.current === 'locked' || lockProgress >= 1;
    },
    [voiceCancelProgressAnimated, voiceDragXAnimated, voiceDragYAnimated, voiceLockProgressAnimated]
  );

  const animateVoiceGestureState = useCallback(
    (dragX: number, dragY: number, cancelProgress: number, lockProgress: number) => {
      voiceCancelProgressRef.current = cancelProgress;
      voiceLockedSnapshotRef.current = voiceRecordModeRef.current === 'locked' || lockProgress >= 1;

      RNAnimated.parallel([
        RNAnimated.timing(voiceDragXAnimated, {
          toValue: dragX,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        RNAnimated.timing(voiceDragYAnimated, {
          toValue: dragY,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        RNAnimated.timing(voiceCancelProgressAnimated, {
          toValue: cancelProgress,
          duration: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        RNAnimated.timing(voiceLockProgressAnimated, {
          toValue: lockProgress,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    },
    [
      voiceCancelProgressAnimated,
      voiceDragXAnimated,
      voiceDragYAnimated,
      voiceLockProgressAnimated,
    ]
  );

  const resetVoiceGestureVisuals = useCallback(
    (animate = true) => {
      const nextLockProgress = voiceRecordModeRef.current === 'locked' ? 1 : 0;
      if (animate) {
        animateVoiceGestureState(0, 0, 0, nextLockProgress);
        return;
      }

      updateVoiceGestureState(0, 0, 0, nextLockProgress);
      voiceLockedSnapshotRef.current = voiceRecordModeRef.current === 'locked';
    },
    [animateVoiceGestureState, updateVoiceGestureState]
  );

  const clearVoiceStartWatchdog = useCallback(() => {
    if (!voiceStartWatchdogRef.current) return;
    clearTimeout(voiceStartWatchdogRef.current);
    voiceStartWatchdogRef.current = null;
  }, []);

  const forceResetVoiceState = useCallback(() => {
    if (__DEV__) {
      console.log('[VoiceInput] forceResetVoiceState', {
        mode: voiceRecordModeRef.current,
        holdActivated: voiceHoldActivatedRef.current,
        gestureActive: voiceGestureActiveRef.current,
        recordingReady: voiceRecordingReadyRef.current,
        startPending: voiceStartPendingRef.current,
        isRecordingSvc: VoiceRecorderService.isRecording(),
        stack: new Error().stack?.split('\n').slice(1, 6).join(' | '),
      });
    }
    clearVoiceStartWatchdog();
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }
    voiceHoldActivatedRef.current = false;
    voiceGestureActiveRef.current = false;
    voiceRecordingReadyRef.current = false;
    voiceStartPendingRef.current = false;
    voiceFinalizePendingRef.current = false;
    pendingVoiceOutcomeRef.current = null;
    setVoiceTouchTracking(false);
    setVoiceRecordingStartedAtMs(0);
    setVoiceRecordMode('idle');
    resetVoiceGestureVisuals(false);
    if (VoiceRecorderService.isRecording()) {
      VoiceRecorderService.stopRecording().catch(() => {});
    }
  }, [clearVoiceStartWatchdog, resetVoiceGestureVisuals, setVoiceRecordMode]);

  const handleSend = useCallback(() => {
    const content = inputText.trim();
    const selectedMedia = pendingMedia;

    if (!content && !selectedMedia) return;

    if (selectedMedia) {
      setInputText('');
      setComposerInputHeight(COMPOSER_INPUT_MIN_HEIGHT);
      setPendingMedia(null);
      onCancelReply?.();

      void onSendMedia?.({
        ...selectedMedia,
        caption: content || undefined,
      });
      onInputChange?.('');
      return;
    }

    setInputText('');
    setComposerInputHeight(COMPOSER_INPUT_MIN_HEIGHT);
    onCancelReply?.();
    onInputChange?.('');

    const stickerId = getFriendStickerIdForEmoji(content);
    if (stickerId) {
      onSendText(encodeStickerPayload({ packId: 'friend', stickerId }), {
        chatusStickerSoloSend: true,
      });
      return;
    }

    onSendText(content);
  }, [
    inputText,
    onCancelReply,
    onInputChange,
    onSendMedia,
    onSendText,
    pendingMedia,
  ]);

  const handleInputChange = useCallback(
    (text: string) => {
      setInputText(text);
      if (text.length === 0) {
        setComposerInputHeight(COMPOSER_INPUT_MIN_HEIGHT);
      }
      onInputChange?.(text);
    },
    [onInputChange]
  );

  const handleComposerTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      const nextHeight = composerInputHeightForLineCount(
        event.nativeEvent.lines.length,
        typography.messageTextLineHeight,
      );
      setComposerInputHeight((currentHeight) =>
        Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight,
      );
    },
    [],
  );

  const openStickerPanel = useCallback(
    (bootTab: StickerPanelTopTab | null) => {
      if (stickerSheetVisible) {
        setStickerSheetVisible(false);
        setStickerSheetBootTab(null);
        hapticStickerSheetDismiss();
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
        return;
      }
      setStickerSheetBootTab(bootTab);
      Keyboard.dismiss();
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          hapticStickerSheetOpen();
          setStickerSheetVisible(true);
        });
      });
    },
    [stickerSheetVisible],
  );

  const toggleStickerPanel = useCallback(() => {
    openStickerPanel(null);
  }, [openStickerPanel]);

  const handleEmojiPick = useCallback(
    (emoji: string) => {
      setInputText((prev) => {
        const next = prev + emoji;
        onInputChange?.(next);
        return next;
      });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [onInputChange],
  );

  const handleStickerPick = useCallback((ref: ChatusStickerRef) => {
    if (ref.packId === 'friend') {
      const emojiChar = friendStickerIdToEmoji(ref.stickerId);
      handleEmojiPick(emojiChar);
    }
  }, [handleEmojiPick]);

  const handleStickerBootTabConsumed = useCallback(() => {
    setStickerSheetBootTab(null);
  }, []);

  const handleVideoNoteComplete = useCallback(
    async (result: VideoNoteRecordingResult) => {
      videoSwipeTriggeredRef.current = false;
      entryModeTapEligibleRef.current = false;
      voiceGestureActiveRef.current = false;
      setVoiceTouchTracking(false);
      setShowVideoNoteRecorder(false);
      await onSendVideoNote?.(result);
    },
    [onSendVideoNote]
  );

  const handleVideoNoteCancel = useCallback(() => {
    videoSwipeTriggeredRef.current = false;
    entryModeTapEligibleRef.current = false;
    voiceGestureActiveRef.current = false;
    setVoiceTouchTracking(false);
    setShowVideoNoteRecorder(false);
  }, []);

  useEffect(() => {
    if (!canUseVideoNotes && recordingEntryModeRef.current !== 'voice') {
      setRecordingEntryMode('voice');
    }
  }, [canUseVideoNotes, setRecordingEntryMode]);

  useEffect(() => {
    RNAnimated.timing(entryModeProgressAnimated, {
      toValue: isVideoEntryMode ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [entryModeProgressAnimated, isVideoEntryMode]);

  useEffect(() => {
    return () => {
      clearVoiceStartWatchdog();
      if (voiceHoldTimerRef.current) {
        clearTimeout(voiceHoldTimerRef.current);
        voiceHoldTimerRef.current = null;
      }
      if (VoiceRecorderService.isRecording()) {
        VoiceRecorderService.stopRecording().catch(() => {});
      }
    };
  }, [clearVoiceStartWatchdog]);

  useEffect(() => {
    let pendingBackgroundTimer: ReturnType<typeof setTimeout> | null = null;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        if (pendingBackgroundTimer) clearTimeout(pendingBackgroundTimer);
        pendingBackgroundTimer = setTimeout(() => {
          pendingBackgroundTimer = null;
          if (AppState.currentState === 'background') {
            forceResetVoiceState();
          }
        }, 600);
      } else if (pendingBackgroundTimer) {
        clearTimeout(pendingBackgroundTimer);
        pendingBackgroundTimer = null;
      }
    });
    return () => {
      if (pendingBackgroundTimer) clearTimeout(pendingBackgroundTimer);
      subscription.remove();
    };
  }, [forceResetVoiceState]);

  useEffect(() => {
    if (!isScreenFocused) {
      setShowAttachmentSheet(false);
      setShowVideoNoteRecorder(false);
      setStickerSheetVisible(false);
      onSendChannelMenuDismiss?.();
      Keyboard.dismiss();
    }
  }, [isScreenFocused, onSendChannelMenuDismiss]);

  const beginVoiceRecording = useCallback(async () => {
    if (__DEV__) {
      console.log('[VoiceInput] beginVoiceRecording called', {
        canSend,
        startPending: voiceStartPendingRef.current,
        finalizePending: voiceFinalizePendingRef.current,
        mode: voiceRecordModeRef.current,
        isRecordingSvc: VoiceRecorderService.isRecording(),
      });
    }
    if (canSend || voiceStartPendingRef.current || voiceFinalizePendingRef.current) return;
    if (voiceRecordModeRef.current !== 'idle' || VoiceRecorderService.isRecording()) return;

    voiceHoldActivatedRef.current = true;
    pendingVoiceOutcomeRef.current = null;
    voiceStartPendingRef.current = true;
    voiceRecordingReadyRef.current = false;
    Keyboard.dismiss();
    setVoiceRecordMode('holding');
    resetVoiceGestureVisuals(false);
    clearVoiceStartWatchdog();
    voiceStartWatchdogRef.current = setTimeout(() => {
      if (!voiceStartPendingRef.current || voiceRecordingReadyRef.current) return;
      forceResetVoiceState();
    }, VOICE_START_WATCHDOG_MS);

    try {
      await VoiceRecorderService.startRecording();
      clearVoiceStartWatchdog();
      setVoiceRecordingStartedAtMs(Date.now());
      voiceRecordingReadyRef.current = true;
      if (__DEV__) console.log('[VoiceInput] startRecording resolved, ready=true');

      const pendingOutcome = pendingVoiceOutcomeRef.current;
      pendingVoiceOutcomeRef.current = null;

      if (pendingOutcome === 'cancel') {
        VoiceRecorderService.stopRecording().catch(() => {});
        voiceRecordingReadyRef.current = false;
        setVoiceTouchTracking(false);
        setVoiceRecordingStartedAtMs(0);
        setVoiceRecordMode('idle');
        resetVoiceGestureVisuals();
      } else if (pendingOutcome === 'send') {
        voiceFinalizePendingRef.current = true;
        try {
          const result = await VoiceRecorderService.stopRecording();
          voiceRecordingReadyRef.current = false;
          setVoiceTouchTracking(false);
          setVoiceRecordingStartedAtMs(0);
          setVoiceRecordMode('idle');
          resetVoiceGestureVisuals();
          await onSendVoice(result);
        } catch (err) {
          voiceRecordingReadyRef.current = false;
          setVoiceTouchTracking(false);
          setVoiceRecordingStartedAtMs(0);
          setVoiceRecordMode('idle');
          resetVoiceGestureVisuals();
          if (__DEV__) console.warn('[InputBar] stop voice recording error:', err);
          Alert.alert('Ошибка', 'Не удалось сохранить голосовое сообщение.');
        } finally {
          voiceFinalizePendingRef.current = false;
        }
      }
    } catch (err) {
      clearVoiceStartWatchdog();
      voiceRecordingReadyRef.current = false;
      setVoiceTouchTracking(false);
      setVoiceRecordingStartedAtMs(0);
      setVoiceRecordMode('idle');
      resetVoiceGestureVisuals();
      if (__DEV__) console.warn('[InputBar] start voice recording error:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись. Проверь доступ к микрофону.');
    } finally {
      clearVoiceStartWatchdog();
      voiceStartPendingRef.current = false;
    }
  }, [canSend, clearVoiceStartWatchdog, forceResetVoiceState, onSendVoice, resetVoiceGestureVisuals, setVoiceRecordMode]);

  const cancelVoiceRecording = useCallback(async () => {
    if (__DEV__) {
      console.log('[VoiceInput] cancelVoiceRecording', {
        mode: voiceRecordModeRef.current,
        recordingReady: voiceRecordingReadyRef.current,
        finalizePending: voiceFinalizePendingRef.current,
      });
    }
    if (voiceFinalizePendingRef.current || voiceRecordModeRef.current === 'idle') return;
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }
    voiceHoldActivatedRef.current = false;
    voiceGestureActiveRef.current = false;
    setVoiceTouchTracking(false);

    if (!voiceRecordingReadyRef.current) {
      pendingVoiceOutcomeRef.current = 'cancel';
      setVoiceRecordingStartedAtMs(0);
      setVoiceRecordMode('idle');
      resetVoiceGestureVisuals();
      return;
    }

    voiceFinalizePendingRef.current = true;
    try {
      await VoiceRecorderService.stopRecording();
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] cancel voice recording error:', err);
    } finally {
      voiceRecordingReadyRef.current = false;
      pendingVoiceOutcomeRef.current = null;
      setVoiceRecordingStartedAtMs(0);
      setVoiceRecordMode('idle');
      resetVoiceGestureVisuals();
      voiceFinalizePendingRef.current = false;
    }
  }, [resetVoiceGestureVisuals, setVoiceRecordMode]);

  const finishVoiceRecording = useCallback(async () => {
    if (__DEV__) {
      console.log('[VoiceInput] finishVoiceRecording', {
        mode: voiceRecordModeRef.current,
        recordingReady: voiceRecordingReadyRef.current,
        finalizePending: voiceFinalizePendingRef.current,
      });
    }
    if (voiceFinalizePendingRef.current || voiceRecordModeRef.current === 'idle') return;
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }
    voiceHoldActivatedRef.current = false;
    voiceGestureActiveRef.current = false;
    setVoiceTouchTracking(false);

    if (!voiceRecordingReadyRef.current) {
      pendingVoiceOutcomeRef.current = 'send';
      return;
    }

    voiceFinalizePendingRef.current = true;
    try {
      const result = await VoiceRecorderService.stopRecording();
      voiceRecordingReadyRef.current = false;
      pendingVoiceOutcomeRef.current = null;
      setVoiceRecordingStartedAtMs(0);
      setVoiceRecordMode('idle');
      resetVoiceGestureVisuals();
      await onSendVoice(result);
    } catch (err) {
      voiceRecordingReadyRef.current = false;
      setVoiceRecordingStartedAtMs(0);
      setVoiceRecordMode('idle');
      resetVoiceGestureVisuals();
      if (__DEV__) console.warn('[InputBar] stop voice recording error:', err);
      Alert.alert('Ошибка', 'Не удалось сохранить голосовое сообщение.');
    } finally {
      voiceFinalizePendingRef.current = false;
    }
  }, [onSendVoice, resetVoiceGestureVisuals, setVoiceRecordMode]);

  const lockVoiceRecording = useCallback(() => {
    if (voiceRecordModeRef.current === 'idle') return;
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }
    setVoiceRecordMode('locked');
    voiceLockedSnapshotRef.current = true;
    animateVoiceGestureState(0, 0, 0, 1);
  }, [animateVoiceGestureState, setVoiceRecordMode]);

  const runAttachmentAction = useCallback(async (action: () => Promise<void>) => {
    setShowAttachmentSheet(false);
    setSelectedGalleryItems([]);
    setGalleryCaption('');
    try {
      await action();
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] attachment error:', err);
      Alert.alert('Ошибка', 'Не удалось прикрепить файл. Попробуй еще раз.');
    }
  }, []);

  const attachmentActions = useMemo<AttachmentAction[]>(() => {
    const actions: AttachmentAction[] = [];

    if (onSendFile) {
      actions.push({
        key: 'file',
        title: 'Файл',
        tone: 'file',
        onPress: async () => {
          const result = await DocumentPickerService.pickDocument();
          if (result) {
            await onSendFile(result);
          }
        },
      });
    }

    return actions;
  }, [onSendFile]);

  const loadGallery = useCallback(async () => {
    if (!onSendMedia) return;

    let hydratedFromCache = false;
    const cacheAge = Date.now() - sharedAttachmentGalleryCachedAtMs;
    if (
      sharedAttachmentGalleryCache &&
      sharedAttachmentGalleryCache.length > 0 &&
      cacheAge >= 0 &&
      cacheAge < ATTACHMENT_GALLERY_CACHE_TTL_MS
    ) {
      setGalleryItems(sharedAttachmentGalleryCache);
      setGalleryDenied(false);
      setGalleryLoading(false);
      hydratedFromCache = true;
    }

    // После выхода из приложения процесс обнуляется — читаем последний снимок с диска,
    // чтобы не ждать MediaLibrary на «холодном» открытии скрепки.
    let hydratedFromDisk = hydratedFromCache;
    if (!hydratedFromCache) {
      try {
        const diskItems = await readAttachmentGalleryDiskCache();
        if (diskItems && diskItems.length > 0) {
          setGalleryItems(diskItems);
          setGalleryDenied(false);
          setGalleryLoading(false);
          sharedAttachmentGalleryCache = diskItems;
          sharedAttachmentGalleryCachedAtMs = Date.now();
          hydratedFromDisk = true;
        }
      } catch {
        /* ignore */
      }
    }

    if (!hydratedFromDisk) {
      setGalleryLoading(true);
    }
    try {
      let permission = await MediaLibrary.getPermissionsAsync();
      let granted = permission.granted || permission.accessPrivileges === 'limited';
      if (!granted && permission.canAskAgain) {
        permission = await MediaLibrary.requestPermissionsAsync();
        granted = permission.granted || permission.accessPrivileges === 'limited';
      }

      if (!granted) {
        setGalleryDenied(true);
        setGalleryItems([]);
        sharedAttachmentGalleryCache = null;
        void clearAttachmentGalleryDiskCache();
        setGalleryLoading(false);
        galleryEndCursorRef.current = undefined;
        galleryHasNextPageRef.current = false;
        return;
      }

      setGalleryDenied(false);
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: ATTACHMENT_GALLERY_PAGE_SIZE,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      galleryEndCursorRef.current = result.endCursor;
      galleryHasNextPageRef.current = result.hasNextPage;

      // Map immediately so the grid appears without waiting for localUri
      const mapped = result.assets.map((asset) => ({
        id: asset.id,
        kind: resolveGalleryItemKind(asset.mediaType),
        uri: asset.uri,
        localUri: undefined as string | undefined,
        width: asset.width,
        height: asset.height,
        durationMs:
          asset.mediaType === MediaLibrary.MediaType.video
            ? Math.max(0, Math.round((asset.duration ?? 0) * 1000))
            : undefined,
        fileName: asset.filename,
      }));
      setGalleryItems((current) => {
        if (!hydratedFromDisk) return mapped;
        const firstPageIds = new Set(mapped.map((item) => item.id));
        return [...mapped, ...current.filter((item) => !firstPageIds.has(item.id))];
      });
      // Раньше loading держался до завершения всех getAssetInfoAsync (десятки вызовов подряд) —
      // скелетон висел 5–8 с. Показываем сетку сразу по uri из getAssetsAsync.
      setGalleryLoading(false);

      // Уточняем file:// локальные пути для превью; без ожидания полной загрузки в UI.
      const infos = await Promise.all(
        mapped.map((item) =>
          MediaLibrary.getAssetInfoAsync(item.id, {
            shouldDownloadFromNetwork: false,
          }).catch(() => null)
        )
      );
      setGalleryItems((prev) => {
        const next = [...prev];
        infos.forEach((info, i) => {
          if (!info) return;
          const localUri = info.localUri?.trim() || info.uri?.trim();
          if (!localUri) return;
          if (i < next.length) {
            next[i] = { ...next[i], localUri };
          }
        });
        sharedAttachmentGalleryCache = next;
        sharedAttachmentGalleryCachedAtMs = Date.now();
        void writeAttachmentGalleryDiskCache(
          next.slice(0, ATTACHMENT_GALLERY_PAGE_SIZE),
        );
        return next;
      });
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] loadGallery error:', err);
      setGalleryItems([]);
      sharedAttachmentGalleryCache = null;
      void clearAttachmentGalleryDiskCache();
      setGalleryLoading(false);
      galleryEndCursorRef.current = undefined;
      galleryHasNextPageRef.current = false;
    }
  }, [onSendMedia]);

  const loadMoreGallery = useCallback(async () => {
    const cursor = galleryEndCursorRef.current;
    if (
      !onSendMedia ||
      !cursor ||
      !galleryHasNextPageRef.current ||
      galleryLoadingMoreRef.current
    ) {
      return;
    }

    galleryLoadingMoreRef.current = true;
    setGalleryLoadingMore(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: ATTACHMENT_GALLERY_PAGE_SIZE,
        after: cursor,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      galleryEndCursorRef.current = result.endCursor;
      galleryHasNextPageRef.current = result.hasNextPage;

      const nextPage: GalleryItem[] = result.assets.map((asset) => ({
        id: asset.id,
        kind: resolveGalleryItemKind(asset.mediaType),
        uri: asset.uri,
        localUri: undefined,
        width: asset.width,
        height: asset.height,
        durationMs:
          asset.mediaType === MediaLibrary.MediaType.video
            ? Math.max(0, Math.round((asset.duration ?? 0) * 1000))
            : undefined,
        fileName: asset.filename,
      }));

      setGalleryItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        const next = [...current, ...nextPage.filter((item) => !knownIds.has(item.id))];
        sharedAttachmentGalleryCache = next;
        sharedAttachmentGalleryCachedAtMs = Date.now();
        // Keep only the fast-start page on disk; the full, growing list stays in memory.
        void writeAttachmentGalleryDiskCache(next.slice(0, ATTACHMENT_GALLERY_PAGE_SIZE));
        return next;
      });
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] loadMoreGallery error:', err);
    } finally {
      galleryLoadingMoreRef.current = false;
      setGalleryLoadingMore(false);
    }
  }, [onSendMedia]);

  useEffect(() => {
    if (!showAttachmentSheet || !onSendMedia) return;
    // Повторное открытие: не дергаем MediaLibrary и десятки getAssetInfoAsync заново.
    if (galleryItems.length > 0 && !galleryDenied) return;
    loadGallery();
  }, [showAttachmentSheet, onSendMedia, loadGallery, galleryItems.length, galleryDenied]);

  const handleToggleGalleryItem = useCallback((item: GalleryItem) => {
    setSelectedGalleryItems((current) => {
      const existingIndex = current.findIndex((selected) => selected.id === item.id);
      if (existingIndex >= 0) {
        return current.filter((selected) => selected.id !== item.id);
      }
      if (current.length >= 10) {
        Alert.alert('Лимит медиа', 'Можно выбрать не больше 10 фото или видео.');
        return current;
      }
      return [...current, item];
    });
  }, []);

  const resolveGalleryItemForSend = useCallback(
    async (item: GalleryItem) => {
      const editedUri = item.localUri?.trim();
      if (
        item.kind === 'image' &&
        editedUri &&
        (editedUri.startsWith('file://') ||
          editedUri.startsWith('content://') ||
          editedUri.startsWith('/'))
      ) {
        const fileName = item.fileName ?? 'photo.jpg';
        return {
          kind: 'image' as const,
          uri: editedUri,
          width: item.width,
          height: item.height,
          fileName,
          mimeType: inferMimeTypeFromFileName(fileName, 'image'),
        } satisfies MediaPickResult;
      }

      const assetInfo = await MediaLibrary.getAssetInfoAsync(item.id).catch(() => null);
      const kind =
        assetInfo?.mediaType != null ? resolveGalleryItemKind(assetInfo.mediaType) : item.kind;
      const resolvedFileName = assetInfo?.filename ?? item.fileName;
      const resolvedUri = assetInfo?.localUri?.trim() || assetInfo?.uri?.trim() || item.uri;
      const assetDuration =
        typeof assetInfo?.duration === 'number' ? assetInfo.duration * 1000 : undefined;
      const durationMs =
        kind === 'video'
          ? Math.max(0, Math.round(assetDuration ?? item.durationMs ?? 0))
          : undefined;
      const previewUri =
        kind === 'video'
          ? (await ensureVideoThumbnailUri(resolvedUri).catch(() => '')) || undefined
          : undefined;

      return {
        kind,
        uri: resolvedUri,
        previewUri,
        width: assetInfo?.width ?? item.width,
        height: assetInfo?.height ?? item.height,
        durationMs,
        fileName: resolvedFileName,
        mimeType: inferMimeTypeFromFileName(resolvedFileName, kind),
      } satisfies MediaPickResult;
    },
    []
  );

  const handleSendSelectedGalleryItems = useCallback(async (itemsOverride?: GalleryItem[]) => {
    const items = itemsOverride ?? selectedGalleryItems;
    if (!onSendMedia || items.length === 0) return;

    const caption = galleryCaption.trim();
    setSelectedGalleryItems([]);
    setGalleryCaption('');
    setShowAttachmentSheet(false);

    try {
      const resolvedItems = await Promise.all(items.map(resolveGalleryItemForSend));
      if (onSendMediaAlbum) {
        await onSendMediaAlbum({
          items: resolvedItems,
          caption: caption.length > 0 ? caption : undefined,
        });
      } else {
        for (let index = 0; index < resolvedItems.length; index += 1) {
          await onSendMedia({
            ...resolvedItems[index],
            caption: index === 0 && caption.length > 0 ? caption : undefined,
          });
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] send selected gallery error:', err);
      Alert.alert('Ошибка', 'Не удалось отправить выбранные медиа. Попробуй еще раз.');
    }
  }, [galleryCaption, onSendMedia, onSendMediaAlbum, resolveGalleryItemForSend, selectedGalleryItems]);

  const galleryEditedUris = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const it of galleryItems) {
      const local = it.localUri?.trim();
      if (local) map.set(it.id, local);
    }
    for (const it of selectedGalleryItems) {
      const local = it.localUri?.trim();
      if (local) map.set(it.id, local);
    }
    return map;
  }, [galleryItems, selectedGalleryItems]);

  const handleGalleryEditedUri = useCallback((
    itemId: string,
    uri: string,
    size?: { width: number; height: number },
  ) => {
    const dimensions =
      size && Number.isFinite(size.width) && Number.isFinite(size.height) &&
      size.width > 0 && size.height > 0
        ? { width: Math.round(size.width), height: Math.round(size.height) }
        : {};
    setSelectedGalleryItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, localUri: uri, ...dimensions } : it)),
    );
    setGalleryItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, localUri: uri, ...dimensions } : it)),
    );
  }, []);

  const closeAttachmentSheet = useCallback(() => {
    setShowAttachmentSheet(false);
    setSelectedGalleryItems([]);
    setGalleryCaption('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const focusComposerInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!composerFocusRef) return;
    composerFocusRef.current = focusComposerInput;
    return () => {
      composerFocusRef.current = null;
    };
  }, [composerFocusRef, focusComposerInput]);

  const openSendChannelSelector = useCallback(() => {
    if (!onSendChannelChange || !onSendChannelMenuOpen) return;
    sendAnchorRef.current?.measureInWindow((x, y, width, height) => {
      onSendChannelMenuOpen({ x, y, width, height });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
  }, [onSendChannelChange, onSendChannelMenuOpen]);

  const showAttachmentButton = onSendMedia != null || attachmentActions.length > 0;

  // Telegram-style всплывающий хинт над инпутом: показываем, когда функция
  // отключена настройками чата/канала (запрет голосовых/медиа и т.д.).
  const [restrictionHint, setRestrictionHint] = useState<string | null>(null);
  const restrictionHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restrictionHintOpacity = useRef(new RNAnimated.Value(0)).current;
  const showRestrictionHint = useCallback(
    (text: string) => {
      if (restrictionHintTimerRef.current) {
        clearTimeout(restrictionHintTimerRef.current);
      }
      setRestrictionHint(text);
      RNAnimated.timing(restrictionHintOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
      restrictionHintTimerRef.current = setTimeout(() => {
        RNAnimated.timing(restrictionHintOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setRestrictionHint(null);
        });
      }, 2600);
    },
    [restrictionHintOpacity]
  );
  useEffect(() => {
    return () => {
      if (restrictionHintTimerRef.current) {
        clearTimeout(restrictionHintTimerRef.current);
      }
    };
  }, []);

  /** Антифлуд (канал): плашка с секундами до разрешённой следующей отправки */
  const [commentCooldownRemainSec, setCommentCooldownRemainSec] = useState(0);
  const onCommentCooldownClearRef = useRef(onCommentCooldownClear);
  onCommentCooldownClearRef.current = onCommentCooldownClear;
  useEffect(() => {
    if (commentCooldownEndsAt == null) {
      setCommentCooldownRemainSec(0);
      return;
    }
    const tick = () => {
      const r = Math.ceil((commentCooldownEndsAt - Date.now()) / 1000);
      if (r <= 0) {
        setCommentCooldownRemainSec(0);
        onCommentCooldownClearRef.current?.();
        return;
      }
      setCommentCooldownRemainSec(r);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [commentCooldownEndsAt]);

  const openAttachmentSheet = useCallback(() => {
    if (mediaRestriction) {
      showRestrictionHint(mediaRestriction);
      return;
    }
    if (!showAttachmentButton) return;
    inputRef.current?.blur();
    Keyboard.dismiss();
    setShowAttachmentSheet(true);
  }, [mediaRestriction, showAttachmentButton, showRestrictionHint]);

  const updateVoiceDrag = useCallback(
    (dx: number, dy: number) => {
      if (voiceRecordModeRef.current !== 'holding') return;

      const translateX = Math.max(-VOICE_MAX_LEFT_DRAG, Math.min(0, dx));
      const translateY = Math.max(-VOICE_MAX_UP_DRAG, Math.min(0, dy));
      const cancelProgress = Math.max(0, Math.min(1, -translateX / VOICE_CANCEL_THRESHOLD));
      const lockProgress = Math.max(0, Math.min(1, -translateY / VOICE_LOCK_THRESHOLD));

      updateVoiceGestureState(translateX, translateY, cancelProgress, lockProgress);

      if (lockProgress >= 1) {
        lockVoiceRecording();
      }
    },
    [lockVoiceRecording, updateVoiceGestureState]
  );

  const handleVoicePanRelease = useCallback(() => {
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }

    if (recordingEntryModeRef.current === 'video' && voiceRecordModeRef.current === 'idle') {
      const shouldToggleEntryMode =
        entryModeTapEligibleRef.current && !videoSwipeTriggeredRef.current && canUseVideoNotes;

      voiceGestureActiveRef.current = false;
      setVoiceTouchTracking(false);
      entryModeTapEligibleRef.current = false;
      videoSwipeTriggeredRef.current = false;
      resetVoiceGestureVisuals(false);

      if (shouldToggleEntryMode) {
        setRecordingEntryMode('voice');
      }
      return;
    }

    if (!voiceHoldActivatedRef.current && voiceRecordModeRef.current === 'idle') {
      voiceGestureActiveRef.current = false;
      setVoiceTouchTracking(false);
      const shouldToggleEntryMode = entryModeTapEligibleRef.current && canUseVideoNotes;
      entryModeTapEligibleRef.current = false;
      videoSwipeTriggeredRef.current = false;
      resetVoiceGestureVisuals(false);
      if (shouldToggleEntryMode) {
        setRecordingEntryMode(recordingEntryModeRef.current === 'voice' ? 'video' : 'voice');
      }
      return;
    }

    if (!voiceGestureActiveRef.current && voiceRecordModeRef.current !== 'holding') return;

    if (voiceRecordModeRef.current === 'locked') {
      voiceHoldActivatedRef.current = false;
      voiceGestureActiveRef.current = false;
      setVoiceTouchTracking(false);
      entryModeTapEligibleRef.current = false;
      videoSwipeTriggeredRef.current = false;
      return;
    }

    voiceHoldActivatedRef.current = false;
    voiceGestureActiveRef.current = false;
    entryModeTapEligibleRef.current = false;
    videoSwipeTriggeredRef.current = false;
    if (voiceCancelProgressRef.current >= VOICE_CANCEL_TRIGGER_PROGRESS) {
      void cancelVoiceRecording();
      return;
    }

    void finishVoiceRecording();
  }, [
    cancelVoiceRecording,
    canUseVideoNotes,
    finishVoiceRecording,
    resetVoiceGestureVisuals,
    setRecordingEntryMode,
  ]);

  const voicePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !canSend && !showVideoNoteRecorder && voiceRecordModeRef.current === 'idle',
        onMoveShouldSetPanResponder: () =>
          voiceTouchTracking && voiceRecordModeRef.current === 'holding',
        onPanResponderGrant: () => {
          if (__DEV__) console.log('[VoiceInput] pan GRANT, entryMode=', recordingEntryModeRef.current);
          voiceGestureActiveRef.current = true;
          setVoiceTouchTracking(true);
          entryModeTapEligibleRef.current = true;
          videoSwipeTriggeredRef.current = false;
          updateVoiceGestureState(0, 0, 0, 0);
          voiceHoldActivatedRef.current = false;
          if (voiceHoldTimerRef.current) {
            clearTimeout(voiceHoldTimerRef.current);
          }
          if (recordingEntryModeRef.current === 'video') {
            voiceHoldTimerRef.current = null;
            return;
          }
          voiceHoldTimerRef.current = setTimeout(() => {
            voiceHoldTimerRef.current = null;
            if (__DEV__) console.log('[VoiceInput] hold timer fired', {
              gestureActive: voiceGestureActiveRef.current,
              mode: voiceRecordModeRef.current,
            });
            if (!voiceGestureActiveRef.current || voiceRecordModeRef.current !== 'idle') return;
            void beginVoiceRecording();
          }, VOICE_HOLD_TO_RECORD_MS);
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!voiceGestureActiveRef.current) return;

          if (
            Math.abs(gestureState.dx) > ENTRY_MODE_TAP_SLOP ||
            Math.abs(gestureState.dy) > ENTRY_MODE_TAP_SLOP
          ) {
            entryModeTapEligibleRef.current = false;
          }

          if (recordingEntryModeRef.current === 'video') {
            if (
              !videoSwipeTriggeredRef.current &&
              gestureState.dy <= -VIDEO_NOTE_SWIPE_TRIGGER &&
              onSendVideoNote != null
            ) {
              videoSwipeTriggeredRef.current = true;
              voiceGestureActiveRef.current = false;
              setVoiceTouchTracking(false);
              Keyboard.dismiss();
              resetVoiceGestureVisuals(false);
              setShowVideoNoteRecorder(true);
            }
            return;
          }

          if (!voiceHoldActivatedRef.current) return;
          updateVoiceDrag(gestureState.dx, gestureState.dy);
        },
        onPanResponderRelease: () => {
          if (__DEV__) console.log('[VoiceInput] pan RELEASE', { mode: voiceRecordModeRef.current });
          handleVoicePanRelease();
        },
        onPanResponderTerminate: () => {
          if (__DEV__) console.log('[VoiceInput] pan TERMINATE', { mode: voiceRecordModeRef.current });
          handleVoicePanRelease();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [
      beginVoiceRecording,
      canSend,
      handleVoicePanRelease,
      onSendVideoNote,
      resetVoiceGestureVisuals,
      showVideoNoteRecorder,
      updateVoiceDrag,
      updateVoiceGestureState,
      voiceTouchTracking,
    ]
  );

  const recordingBubbleStyle = useMemo(
    () => ({
      transform: [
        { translateX: voiceDragXAnimated },
      ] as ViewStyle['transform'],
    }),
    [voiceDragXAnimated]
  );

  const recordingBubbleCancelTintStyle = useMemo(
    () => ({
      opacity: voiceCancelProgressAnimated.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    }),
    [voiceCancelProgressAnimated]
  );

  const recordingLiveContentStyle = useMemo(
    () => ({
      opacity: voiceCancelProgressAnimated.interpolate({
        inputRange: [0, 0.72],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateX: voiceCancelProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -12],
            extrapolate: 'clamp',
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [voiceCancelProgressAnimated]
  );

  const recordingCancelContentStyle = useMemo(
    () => ({
      opacity: voiceCancelProgressAnimated.interpolate({
        inputRange: [0.18, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateX: voiceCancelProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
            extrapolate: 'clamp',
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [voiceCancelProgressAnimated]
  );

  const recordingLockStyle = useMemo(
    () => ({
      opacity: voiceLockProgressAnimated.interpolate({
        inputRange: [0, 0.72, 1],
        outputRange: [1, 1, 0],
      }),
      transform: [
        {
          translateY: RNAnimated.add(
            RNAnimated.multiply(voiceDragYAnimated, 0.22),
            voiceLockProgressAnimated.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 12],
            })
          ),
        },
        {
          scale: voiceLockProgressAnimated.interpolate({
            inputRange: [0, 0.72, 1],
            outputRange: [1, 1.06, 0.88],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [voiceDragYAnimated, voiceLockProgressAnimated]
  );

  const recordingUnlockIconStyle = useMemo(
    () => ({
      opacity: voiceLockProgressAnimated.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
      transform: [
        {
          scale: voiceLockProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.84],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [voiceLockProgressAnimated]
  );

  const recordingLockIconStyle = useMemo(
    () => ({
      opacity: voiceLockProgressAnimated.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          scale: voiceLockProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0.84, 1],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [voiceLockProgressAnimated]
  );

  const trailingActionMicIconStyle = useMemo(
    () => ({
      opacity: entryModeProgressAnimated.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
      transform: [
        {
          scale: entryModeProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.86],
          }),
        },
        {
          translateY: entryModeProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 3],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [entryModeProgressAnimated]
  );

  const trailingActionVideoIconStyle = useMemo(
    () => ({
      opacity: entryModeProgressAnimated.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          scale: entryModeProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0.84, 1],
          }),
        },
        {
          translateY: entryModeProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [3, 0],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [entryModeProgressAnimated]
  );

  const trailingActionModeDotStyle = useMemo(
    () => ({
      opacity: entryModeProgressAnimated.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          scale: entryModeProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [entryModeProgressAnimated]
  );

  const lockIconUnlockColor = isDark ? themeColors.link : '#5A9BFF';
  const lockIconLockColor = themeColors.accent;

  return (
    <>
      <View style={styles.inputBarRoot}>
        {isVoiceRecording ? (
          <>
            <RNAnimated.View style={[styles.recordingLockBubble, recordingLockStyle]}>
              <RNAnimated.View style={[styles.recordingLockIcon, recordingUnlockIconStyle]}>
                <Feather name="unlock" size={18} color={lockIconUnlockColor} />
              </RNAnimated.View>
              <RNAnimated.View style={[styles.recordingLockIcon, recordingLockIconStyle]}>
                <Feather name="lock" size={18} color={lockIconLockColor} />
              </RNAnimated.View>
            </RNAnimated.View>
            <RNAnimated.View style={[styles.recordingChevron, recordingUnlockIconStyle]}>
              <Feather name="chevron-up" size={18} color={themeColors.iconMuted} />
            </RNAnimated.View>
          </>
        ) : null}
        {commentCooldownRemainSec > 0 ? (
          <View
            style={styles.restrictionHint}
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Подождите ${commentCooldownRemainSec} секунд`}
          >
            <Feather name="lock" size={14} color="#FFFFFF" style={styles.restrictionHintIcon} />
            <Text style={styles.restrictionHintText}>
              Подождите {commentCooldownRemainSec} сек.
            </Text>
          </View>
        ) : null}

        {restrictionHint ? (
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.restrictionHint, { opacity: restrictionHintOpacity }]}
          >
            <Feather name="lock" size={14} color="#FFFFFF" style={styles.restrictionHintIcon} />
            <Text style={styles.restrictionHintText}>{restrictionHint}</Text>
          </RNAnimated.View>
        ) : null}

        <View style={styles.inputRow}>
        {pendingMedia ? (
          <View style={styles.previewCard}>
            <View style={styles.previewMediaWrap}>
              <Image
                source={{ uri: pendingMedia.previewUri ?? pendingMedia.uri }}
                style={styles.previewImage}
                contentFit="cover"
                cachePolicy="disk"
              />
              {pendingMedia.kind === 'video' ? (
                <View style={styles.previewPlayBadge}>
                  <Feather name="play" size={14} color="#FFFFFF" style={styles.previewPlayIcon} />
                </View>
              ) : null}
            </View>
            <View style={styles.previewTextWrap}>
              <Text style={styles.previewTitle}>
                {pendingMedia.kind === 'video' ? 'Видео готово к отправке' : 'Фото готово к отправке'}
              </Text>
              <Text style={styles.previewSubtitle}>
                Можно добавить подпись и отправить одним сообщением
              </Text>
            </View>
            <Pressable style={styles.previewRemoveButton} onPress={() => setPendingMedia(null)}>
              <Feather name="x" size={16} color={themeColors.iconMuted} />
            </Pressable>
          </View>
        ) : null}

        <Reanimated.View
          layout={COMPOSER_DOCK_LAYOUT}
          style={[
            styles.composerDock,
            replyToMessage && styles.composerDockReply,
            isVoiceRecording && styles.composerDockRecording,
          ]}
        >
          {replyToMessage ? (
              <Reanimated.View
                key="reply-strip"
                entering={REPLY_STRIP_ENTERING}
                exiting={REPLY_STRIP_EXITING}
                style={styles.replyComposerWrap}
              >
                <View style={styles.replyComposerInline}>
                  <View style={styles.replyComposerAccent} />
                  {resolvedReplyThumbnailUri.trim() ? (
                    <Image
                      source={{ uri: resolvedReplyThumbnailUri }}
                      style={styles.replyComposerThumbnail}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                  ) : null}
                  <View style={styles.replyComposerCopy}>
                    <Text style={styles.replyComposerAuthor} numberOfLines={1}>
                      {replyAuthorName?.trim() || 'Message'}
                    </Text>
                    <Text style={styles.replyComposerText} numberOfLines={1}>
                      {replyPreviewText}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel reply"
                    hitSlop={10}
                    onPress={onCancelReply}
                    style={styles.replyComposerClose}
                  >
                    <Feather name="x" size={18} color={themeColors.iconMuted} />
                  </Pressable>
                </View>
              </Reanimated.View>
            ) : null}

            {isVoiceRecording ? (
              <InputVoiceRecordingStage
                recordingStartedAtMs={voiceRecordingStartedAtMs}
                attachedToReply={!!replyToMessage}
                isLocked={isVoiceLocked}
                voiceTouchTracking={voiceTouchTracking}
                panHandlers={voicePanResponder.panHandlers}
                recordingBubbleStyle={recordingBubbleStyle}
                recordingBubbleCancelTintStyle={recordingBubbleCancelTintStyle}
                recordingLiveContentStyle={recordingLiveContentStyle}
                recordingCancelContentStyle={recordingCancelContentStyle}
                onCancel={() => {
                  void cancelVoiceRecording();
                }}
                onSend={() => {
                  void finishVoiceRecording();
                }}
              />
            ) : (
            <View style={[styles.composerShell, replyToMessage && styles.composerShellAttached]}>
              {showAttachmentButton ? (
                stickerInLeadingCluster && chatusStickersComposer ? (
                  <View style={styles.leadingCluster} accessibilityRole="toolbar">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Вложения"
                      style={styles.leadingAction}
                      onPress={openAttachmentSheet}
                    >
                      <PaperclipIcon />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={stickerSheetVisible ? 'Показать клавиатуру' : 'Открыть стикеры'}
                      accessibilityHint="Удерживайте, чтобы открыть вкладку Emoji"
                      onPress={toggleStickerPanel}
                      onLongPress={() => {
                        if (!stickerSheetVisible) openStickerPanel('emoji');
                      }}
                      delayLongPress={400}
                      style={({ pressed }) => [styles.leadingAction, pressed && styles.trailingActionPressed]}
                    >
                      {stickerSheetVisible ? (
                        <MaterialIcons name="keyboard" size={20} color={themeColors.iconMuted} />
                      ) : (
                        <Feather name="smile" size={20} color={themeColors.iconMuted} />
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Вложения"
                    style={styles.leadingAction}
                    onPress={openAttachmentSheet}
                  >
                    <PaperclipIcon />
                  </Pressable>
                )
              ) : stickerInLeadingCluster && chatusStickersComposer ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={stickerSheetVisible ? 'Показать клавиатуру' : 'Открыть стикеры'}
                  accessibilityHint="Удерживайте, чтобы открыть вкладку Emoji"
                  onPress={toggleStickerPanel}
                  onLongPress={() => {
                    if (!stickerSheetVisible) openStickerPanel('emoji');
                  }}
                  delayLongPress={400}
                  style={({ pressed }) => [styles.leadingAction, pressed && styles.trailingActionPressed]}
                >
                  {stickerSheetVisible ? (
                    <MaterialIcons name="keyboard" size={20} color={themeColors.iconMuted} />
                  ) : (
                    <Feather name="smile" size={20} color={themeColors.iconMuted} />
                  )}
                </Pressable>
              ) : null}

              <View style={styles.composerInputStickerCluster}>
                <Text
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.composerMeasureText}
                  onTextLayout={handleComposerTextLayout}
                >
                  {`${inputText || ' '}\u200B`}
                </Text>
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    styles.inputComposerField,
                    { height: composerInputHeight },
                  ]}
                  placeholder={textRestriction ?? placeholder}
                  editable={!textRestriction}
                  onFocus={() => {
                    if (!textRestriction) return;
                    inputRef.current?.blur();
                    showRestrictionHint(textRestriction);
                  }}
                  placeholderTextColor={themeColors.placeholder}
                  value={inputText}
                  onChangeText={handleInputChange}
                  multiline
                  scrollEnabled={shouldScrollComposerInput(composerInputHeight)}
                  textAlignVertical={
                    composerInputHeight === COMPOSER_INPUT_MIN_HEIGHT ? 'center' : 'top'
                  }
                  maxLength={4096}
                />
              </View>

              {!stickerInLeadingCluster && chatusStickersComposer ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={stickerSheetVisible ? 'Показать клавиатуру' : 'Открыть стикеры'}
                  accessibilityHint="Удерживайте, чтобы открыть вкладку Emoji"
                  onPress={toggleStickerPanel}
                  onLongPress={() => {
                    if (!stickerSheetVisible) openStickerPanel('emoji');
                  }}
                  delayLongPress={400}
                  style={({ pressed }) => [styles.composerStickerAction, pressed && styles.trailingActionPressed]}
                >
                  {stickerSheetVisible ? (
                    <MaterialIcons name="keyboard" size={22} color={themeColors.iconMuted} />
                  ) : (
                    <Feather name="smile" size={22} color={themeColors.iconMuted} />
                  )}
                </Pressable>
              ) : null}

              {canSend ? (
                <View ref={sendAnchorRef} collapsable={false}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Отправить"
                    style={({ pressed }) => [styles.trailingAction, pressed && styles.trailingActionPressed]}
                    onPress={handleSend}
                    onLongPress={openSendChannelSelector}
                  >
                    {onSendChannelChange && sendChannel === 'telegram' ? (
                      <PlatformSourceIcon source="telegram" size={20} />
                    ) : (
                      <SendIcon />
                    )}
                  </Pressable>
                </View>
              ) : isChannelAdmin ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Беззвучный режим"
                  style={({ pressed }) => [styles.trailingAction, pressed && styles.trailingActionPressed]}
                  onPress={onToggleChannelSilentMode}
                >
                  <Feather 
                    name={channelSilentMode ? "bell-off" : "bell"} 
                    size={19} 
                    color={themeColors.iconMuted} 
                  />
                </Pressable>
              ) : (
                <RNAnimated.View
                  pointerEvents="none"
                  style={[
                    styles.trailingAction,
                  ]}
                >
                  <RNAnimated.View style={[styles.trailingActionIconLayer, trailingActionMicIconStyle]}>
                    <MicIcon />
                  </RNAnimated.View>
                  <RNAnimated.View
                    style={[styles.trailingActionIconLayer, trailingActionVideoIconStyle]}
                  >
                    <VideoNoteIcon />
                  </RNAnimated.View>
                  <RNAnimated.View
                    style={[styles.trailingActionModeDot, trailingActionModeDotStyle]}
                  />
                </RNAnimated.View>
              )}
            </View>
            )}
          </Reanimated.View>

        {!canSend && !isChannelAdmin ? (
          voiceRestriction ? (
            // Вместо pan-жеста запуска записи показываем telegram-style хинт.
            <Pressable
              onPress={() => showRestrictionHint(voiceRestriction)}
              style={styles.voiceTouchAnchor}
            />
          ) : (
            <View
              pointerEvents={isVoiceLocked && !voiceTouchTracking ? 'none' : 'auto'}
              style={[
                styles.voiceTouchAnchor,
                isVoiceRecording && styles.voiceTouchAnchorActive,
                isVoiceLocked && !voiceTouchTracking && styles.voiceTouchAnchorHidden,
              ]}
              {...voicePanResponder.panHandlers}
            />
          )
        ) : null}
        </View>

        {chatusStickersComposer ? (
          <StickerPackSheet
            variant="dock"
            visible={stickerSheetVisible}
            onClose={() => {
              setStickerSheetVisible(false);
              setStickerSheetBootTab(null);
            }}
            onPickSticker={handleStickerPick}
            onPickEmoji={handleEmojiPick}
            initialTopTabSnapshot={stickerSheetBootTab}
            onInitialTopTabSnapshotConsumed={handleStickerBootTabConsumed}
          />
        ) : null}

      </View>

      <InputAttachmentSheet
        visible={showAttachmentSheet}
        galleryEnabled={onSendMedia != null}
        galleryItems={galleryItems}
        galleryLoading={galleryLoading}
        galleryLoadingMore={galleryLoadingMore}
        galleryDenied={galleryDenied}
        attachmentActions={attachmentActions}
        selectedItems={selectedGalleryItems}
        captionValue={galleryCaption}
        onClose={closeAttachmentSheet}
        onToggleGalleryItem={handleToggleGalleryItem}
        onCaptionChange={setGalleryCaption}
        onLoadMoreGallery={() => {
          void loadMoreGallery();
        }}
        editedUris={galleryEditedUris}
        onEditedUriChange={handleGalleryEditedUri}
        onSendSelected={(itemsOverride) => {
          void handleSendSelectedGalleryItems(itemsOverride);
        }}
        onRunAttachmentAction={runAttachmentAction}
      />

      {onSendVideoNote != null && (
        <VideoNoteRecorder
          visible={showVideoNoteRecorder}
          onComplete={handleVideoNoteComplete}
          onCancel={handleVideoNoteCancel}
          blurTargetRef={blurTargetRef}
        />
      )}



    </>
  );
}

function createInputBarStyles(themeColors: ThemeColors, isDark: boolean) {
  const lockBubbleBg = isDark ? 'rgba(32,43,54,0.96)' : 'rgba(255,255,255,0.96)';
  const lockBubbleBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(51,144,236,0.18)';

  return StyleSheet.create({
  /** Обёртка: подсказка в потоке над полем — иначе absolute уезжает за clip родителей */
  inputBarRoot: {
    width: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  recordingLockBubble: {
    position: 'absolute',
    bottom: 76,
    right: 20,
    width: 42,
    height: 74,
    borderRadius: 23,
    backgroundColor: lockBubbleBg,
    borderColor: lockBubbleBorder,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: isDark ? 0.38 : 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    zIndex: 20,
  },
  recordingLockIcon: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 7,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingChevron: {
    position: 'absolute',
    bottom: 62,
    right: 21,
    width: 36,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  inputRow: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themeColors.separator,
    borderRadius: 18,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  previewMediaWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: themeColors.placeholderBg,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlayBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: -14,
    marginTop: -14,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlayIcon: {
    marginLeft: 2,
  },
  previewTextWrap: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  previewSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  previewRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: themeColors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themeColors.separator,
  },
  replyComposerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeColors.separator,
  },
  replyComposerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  replyComposerAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: themeColors.accent,
    marginRight: 10,
  },
  replyComposerCopy: {
    flex: 1,
    minWidth: 0,
  },
  replyComposerThumbnail: {
    width: 34,
    height: 34,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: themeColors.placeholderBg,
  },
  replyComposerAuthor: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    color: themeColors.accent,
  },
  replyComposerText: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 17,
    color: themeColors.textPrimary,
  },
  replyComposerClose: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerDock: {
    gap: 0,
    overflow: 'visible',
  },
  composerDockReply: {
    backgroundColor: themeColors.composerSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themeColors.composerBorder,
    borderRadius: 24,
    overflow: 'hidden',
  },
  composerDockRecording: {
    overflow: 'visible',
  },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: composerPresentation.shellMinHeight,
    borderRadius: composerPresentation.shellBorderRadius,
    backgroundColor: themeColors.composerSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themeColors.composerBorder,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
    gap: 6,
  },
  composerShellAttached: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  composerInputStickerCluster: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  leadingAction: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingCluster: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 0,
  },
  composerStickerAction: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  input: {
    minHeight: COMPOSER_INPUT_MIN_HEIGHT,
    maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
    paddingHorizontal: 8,
    paddingTop: 11,
    paddingBottom: 10,
    fontSize: typography.messageText,
    lineHeight: typography.messageTextLineHeight,
    color: themeColors.textPrimary,
  },
  inputComposerField: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  composerMeasureText: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    opacity: 0,
    fontSize: typography.messageText,
    lineHeight: typography.messageTextLineHeight,
  },
  trailingAction: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    borderRadius: MIN_TAP_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  trailingActionIconLayer: {
    position: 'absolute',
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingActionModeDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: themeColors.accent,
  },
  trailingActionPressed: {
    opacity: 0.82,
  },
  voiceTouchAnchor: {
    position: 'absolute',
    right: 12,
    bottom: 14,
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    borderRadius: MIN_TAP_TARGET / 2,
    backgroundColor: 'transparent',
    zIndex: 12,
  },
  voiceTouchAnchorActive: {
    opacity: 0.02,
  },
  voiceTouchAnchorHidden: {
    opacity: 0,
  },
  restrictionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#2B3540',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  restrictionHintIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  restrictionHintText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
  },
});
}


