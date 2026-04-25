import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  AppState,
  Easing,
  Image,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import Feather from '@expo/vector-icons/Feather';
import { composerPresentation } from '../presentation';
import { colors, typography, MIN_TAP_TARGET } from '../theme/colors';
import { DocumentPickerService } from '../services/DocumentPickerService';
import { VoiceRecorderService, type VoiceRecordingResult } from '../services/VoiceRecorderService';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import type { Message } from '../stores/types';
import { ensureVideoThumbnailUri } from '../utils/videoThumbnail';
import { InputAttachmentSheet } from './InputAttachmentSheet';
import { InputVoiceRecordingStage } from './InputVoiceRecordingStage';
import { buildReplyPreviewText, getReplyPreviewThumbnailUri } from './ReplyPreview';
import { VideoNoteRecorder } from './VideoNoteRecorder';

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
  onSendText: (text: string) => void;
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
}

type AttachmentAction = {
  key: string;
  title: string;
  tone: 'file' | 'video';
  onPress: () => Promise<void>;
};

type GalleryItem = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  localUri?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fileName?: string;
};

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
  return <Feather name="paperclip" size={20} color={colors.iconMuted} />;
}

function MicIcon() {
  return <Feather name="mic" size={19} color={colors.iconMuted} />;
}

function VideoNoteIcon() {
  return <Feather name="video" size={17} color={colors.iconMuted} />;
}

function SendIcon() {
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
  voiceRestriction = null,
  mediaRestriction = null,
  commentCooldownEndsAt = null,
  onCommentCooldownClear,
}: InputBarProps) {
  const [inputText, setInputText] = useState('');
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaPickResult | null>(null);
  const [selectedGalleryItems, setSelectedGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryCaption, setGalleryCaption] = useState('');
  const [voiceRecordModeState, setVoiceRecordModeState] = useState<VoiceRecordMode>('idle');
  const [recordingEntryModeState, setRecordingEntryModeState] =
    useState<RecordingEntryMode>('voice');
  const [voiceTouchTracking, setVoiceTouchTracking] = useState(false);
  const [voiceRecordingStartedAtMs, setVoiceRecordingStartedAtMs] = useState(0);

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
  const canSend = hasText || hasPendingMedia;
  const isVoiceRecording = voiceRecordModeState !== 'idle';
  const isVoiceLocked = voiceRecordModeState === 'locked';
  const canUseVideoNotes = onSendVideoNote != null;
  const isVideoEntryMode = canUseVideoNotes && recordingEntryModeState === 'video';
  const replyPreviewText = buildReplyPreviewText(replyToMessage);
  const replyPreviewThumbnailUri = getReplyPreviewThumbnailUri(replyToMessage);

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

    setInputText('');
    setPendingMedia(null);
    onCancelReply?.();

    if (selectedMedia) {
      void onSendMedia?.({
        ...selectedMedia,
        caption: content || undefined,
      });
      return;
    }

    onSendText(content);
  }, [inputText, onCancelReply, onSendMedia, onSendText, pendingMedia]);

  const handleInputChange = useCallback(
    (text: string) => {
      setInputText(text);
      onInputChange?.(text);
    },
    [onInputChange]
  );

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
      Keyboard.dismiss();
    }
  }, [isScreenFocused]);

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
          if (result) await onSendFile(result);
        },
      });
    }

    return actions;
  }, [onSendFile]);

  const loadGallery = useCallback(async () => {
    if (!onSendMedia) return;

    setGalleryLoading(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      const granted = permission.granted || permission.accessPrivileges === 'limited';

      if (!granted) {
        setGalleryDenied(true);
        setGalleryItems([]);
        return;
      }

      setGalleryDenied(false);
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: 48,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });

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
      setGalleryItems(mapped);

      // Resolve localUris in background batches so images render instantly via file:// paths
      const BATCH = 12;
      for (let start = 0; start < mapped.length; start += BATCH) {
        const batch = mapped.slice(start, start + BATCH);
        const infos = await Promise.all(
          batch.map((item) =>
            MediaLibrary.getAssetInfoAsync(item.id).catch(() => null)
          )
        );
        setGalleryItems((prev) => {
          const next = [...prev];
          infos.forEach((info, i) => {
            if (!info) return;
            const localUri = info.localUri?.trim() || info.uri?.trim();
            if (!localUri) return;
            const idx = start + i;
            if (idx < next.length) {
              next[idx] = { ...next[idx], localUri };
            }
          });
          return next;
        });
      }
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] loadGallery error:', err);
      setGalleryItems([]);
    } finally {
      setGalleryLoading(false);
    }
  }, [onSendMedia]);

  useEffect(() => {
    if (showAttachmentSheet && onSendMedia) {
      loadGallery();
    }
  }, [showAttachmentSheet, onSendMedia, loadGallery]);

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

  const handleSendSelectedGalleryItems = useCallback(async () => {
    if (!onSendMedia || selectedGalleryItems.length === 0) return;

    const items = selectedGalleryItems;
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

  const closeAttachmentSheet = useCallback(() => {
    setShowAttachmentSheet(false);
    setSelectedGalleryItems([]);
    setGalleryCaption('');
  }, []);

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
        { translateX: RNAnimated.multiply(voiceDragXAnimated, 0.66) },
        { translateY: RNAnimated.multiply(voiceDragYAnimated, 0.42) },
      ] as ViewStyle['transform'],
    }),
    [voiceDragXAnimated, voiceDragYAnimated]
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
      transform: [
        {
          translateY: RNAnimated.add(
            RNAnimated.multiply(voiceDragYAnimated, 0.12),
            voiceLockProgressAnimated.interpolate({
              inputRange: [0, 1],
              outputRange: [2, 8],
            })
          ),
        },
        {
          translateX: voiceLockProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 2],
          }),
        },
        {
          scaleY: voiceLockProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [1.58, 1],
          }),
        },
        {
          scaleX: voiceLockProgressAnimated.interpolate({
            inputRange: [0, 1],
            outputRange: [0.94, 1],
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

  return (
    <>
      <View style={styles.inputBarRoot}>
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
              <Feather name="x" size={16} color="#6B7280" />
            </Pressable>
          </View>
        ) : null}

        {isVoiceRecording ? (
          <InputVoiceRecordingStage
            key={voiceRecordingStartedAtMs || 'voice-recording-stage'}
            recordingStartedAtMs={voiceRecordingStartedAtMs}
            isLocked={isVoiceLocked}
            voiceTouchTracking={voiceTouchTracking}
            panHandlers={voicePanResponder.panHandlers}
            recordingBubbleStyle={recordingBubbleStyle}
            recordingBubbleCancelTintStyle={recordingBubbleCancelTintStyle}
            recordingLiveContentStyle={recordingLiveContentStyle}
            recordingCancelContentStyle={recordingCancelContentStyle}
            recordingLockStyle={recordingLockStyle}
            recordingUnlockIconStyle={recordingUnlockIconStyle}
            recordingLockIconStyle={recordingLockIconStyle}
            onCancel={() => {
              void cancelVoiceRecording();
            }}
            onSend={() => {
              void finishVoiceRecording();
            }}
          />
        ) : (
          <View style={[styles.composerDock, replyToMessage && styles.composerDockReply]}>
            {replyToMessage ? (
              <View style={styles.replyComposerWrap}>
                <View style={styles.replyComposerInline}>
                  <View style={styles.replyComposerAccent} />
                  {replyPreviewThumbnailUri ? (
                    <Image
                      source={{ uri: replyPreviewThumbnailUri }}
                      style={styles.replyComposerThumbnail}
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
                    <Feather name="x" size={18} color="#9AA4B2" />
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={[styles.composerShell, replyToMessage && styles.composerShellAttached]}>
              {showAttachmentButton ? (
                <Pressable style={styles.leadingAction} onPress={openAttachmentSheet}>
                  <PaperclipIcon />
                </Pressable>
              ) : null}

              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={colors.placeholder}
                value={inputText}
                onChangeText={handleInputChange}
                multiline
                maxLength={4096}
              />

              {canSend ? (
                <Pressable style={({ pressed }) => [styles.trailingAction, pressed && styles.trailingActionPressed]} onPress={handleSend}>
                  <SendIcon />
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
          </View>
          )}

        {!canSend ? (
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
      </View>

      <InputAttachmentSheet
        visible={showAttachmentSheet}
        galleryEnabled={onSendMedia != null}
        galleryItems={galleryItems}
        galleryLoading={galleryLoading}
        galleryDenied={galleryDenied}
        attachmentActions={attachmentActions}
        selectedItems={selectedGalleryItems}
        captionValue={galleryCaption}
        onClose={closeAttachmentSheet}
        onToggleGalleryItem={handleToggleGalleryItem}
        onCaptionChange={setGalleryCaption}
        onSendSelected={() => {
          void handleSendSelectedGalleryItems();
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

const styles = StyleSheet.create({
  /** Обёртка: подсказка в потоке над полем — иначе absolute уезжает за clip родителей */
  inputBarRoot: {
    width: '100%',
    overflow: 'visible',
  },
  inputRow: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8EF',
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
    backgroundColor: '#EEF2F7',
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
    color: '#111827',
  },
  previewSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  previewRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6EBF2',
  },
  replyComposerWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  replyComposerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  replyComposerAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: '#4B9DFF',
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
    backgroundColor: '#EEF2F7',
  },
  replyComposerAuthor: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    color: '#3497FF',
  },
  replyComposerText: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 17,
    color: '#202327',
  },
  replyComposerClose: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerDock: {
    gap: 0,
  },
  composerDockReply: {
    backgroundColor: colors.composerSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.composerBorder,
    borderRadius: 24,
    overflow: 'hidden',
  },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: composerPresentation.shellMinHeight,
    borderRadius: composerPresentation.shellBorderRadius,
    backgroundColor: colors.composerSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.composerBorder,
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
  leadingAction: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingTop: 11,
    paddingBottom: 10,
    fontSize: typography.messageText,
    lineHeight: typography.messageTextLineHeight,
    color: colors.textPrimary,
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
    backgroundColor: colors.accent,
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


