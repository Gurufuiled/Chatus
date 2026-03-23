import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import MaterialCommunityIcons from 'expo/node_modules/@expo/vector-icons/MaterialCommunityIcons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { colors, typography, MIN_TAP_TARGET } from '../theme/colors';
import { DocumentPickerService } from '../services/DocumentPickerService';
import { VoiceRecorderService, type VoiceRecordingResult } from '../services/VoiceRecorderService';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import type { Message } from '../stores/types';
import { ReplyPreview, buildReplyPreviewText } from './ReplyPreview';
import { VideoNoteRecorder } from './VideoNoteRecorder';

export interface ImagePickResult {
  uri: string;
  width?: number;
  height?: number;
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
  onSendImage?: (result: ImagePickResult) => void | Promise<void>;
  onSendFile?: (result: FilePickResult) => void | Promise<void>;
  placeholder?: string;
  onInputChange?: (text: string) => void;
  replyToMessage?: Message | null;
  replyAuthorName?: string | null;
  onCancelReply?: () => void;
}

type AttachmentAction = {
  key: string;
  title: string;
  tone: 'file' | 'video';
  onPress: () => Promise<void>;
};

type GalleryItem = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
};

function PaperclipIcon() {
  return <Feather name="paperclip" size={20} color="#6B7280" />;
}

function MicIcon() {
  return <Feather name="mic" size={19} color="#6B7280" />;
}

function SendIcon() {
  return <Feather name="send" size={18} color={colors.accent} />;
}

function VoiceSendIcon() {
  return <Feather name="arrow-up" size={20} color="#FFFFFF" />;
}

function SheetActionIcon({ tone }: { tone: AttachmentAction['tone'] }) {
  if (tone === 'video') {
    return <MaterialCommunityIcons name="play-circle-outline" size={19} color="#6B7280" />;
  }

  return <Feather name="file-text" size={16} color="#6B7280" />;
}

export function InputBar({
  onSendText,
  onSendVoice,
  onSendVideoNote,
  onSendImage,
  onSendFile,
  placeholder = 'Сообщение',
  onInputChange,
  replyToMessage = null,
  replyAuthorName = null,
  onCancelReply,
}: InputBarProps) {
  const [inputText, setInputText] = useState('');
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [pendingImage, setPendingImage] = useState<ImagePickResult | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const voiceActionBusyRef = useRef(false);
  const voiceSwipeTriggeredRef = useRef(false);
  const recordingPulse = useRef(new Animated.Value(1)).current;

  const hasText = inputText.trim().length > 0;
  const hasPendingImage = pendingImage != null;
  const canSend = hasText || hasPendingImage;
  const replyPreviewText = buildReplyPreviewText(replyToMessage);

  const handleSend = useCallback(() => {
    const content = inputText.trim();
    const selectedImage = pendingImage;

    if (!content && !selectedImage) return;

    setInputText('');
    setPendingImage(null);
    onCancelReply?.();

    if (selectedImage) {
      void onSendImage?.({
        ...selectedImage,
        caption: content || undefined,
      });
      return;
    }

    onSendText(content);
  }, [inputText, onCancelReply, onSendImage, onSendText, pendingImage]);

  const handleInputChange = useCallback(
    (text: string) => {
      setInputText(text);
      onInputChange?.(text);
    },
    [onInputChange]
  );

  const handleVideoNoteComplete = useCallback(
    async (result: VideoNoteRecordingResult) => {
      setShowVideoNoteRecorder(false);
      await onSendVideoNote?.(result);
    },
    [onSendVideoNote]
  );

  const handleVideoNoteCancel = useCallback(() => {
    setShowVideoNoteRecorder(false);
  }, []);

  useEffect(() => {
    if (!isVoiceRecording) {
      setVoiceElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setVoiceElapsedMs(Date.now() - startedAt);
    }, 200);

    return () => clearInterval(timer);
  }, [isVoiceRecording]);

  useEffect(() => {
    if (!isVoiceRecording) {
      recordingPulse.stopAnimation();
      recordingPulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulse, {
          toValue: 0.25,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(recordingPulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      recordingPulse.setValue(1);
    };
  }, [isVoiceRecording, recordingPulse]);

  useEffect(() => {
    return () => {
      if (VoiceRecorderService.isRecording()) {
        VoiceRecorderService.stopRecording().catch(() => {});
      }
    };
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (voiceActionBusyRef.current || isVoiceRecording) return;
    voiceActionBusyRef.current = true;

    try {
      if (VoiceRecorderService.isRecording()) {
        return;
      }
      await VoiceRecorderService.startRecording();
      setIsVoiceRecording(true);
      setVoiceElapsedMs(0);
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] start voice recording error:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись. Проверь доступ к микрофону.');
    } finally {
      voiceActionBusyRef.current = false;
    }
  }, [isVoiceRecording]);

  const cancelVoiceRecording = useCallback(async () => {
    if (voiceActionBusyRef.current || !isVoiceRecording) return;
    voiceActionBusyRef.current = true;

    try {
      await VoiceRecorderService.stopRecording();
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] cancel voice recording error:', err);
    } finally {
      setIsVoiceRecording(false);
      setVoiceElapsedMs(0);
      voiceActionBusyRef.current = false;
    }
  }, [isVoiceRecording]);

  const finishVoiceRecording = useCallback(async () => {
    if (voiceActionBusyRef.current || !isVoiceRecording) return;
    voiceActionBusyRef.current = true;

    try {
      const result = await VoiceRecorderService.stopRecording();
      setIsVoiceRecording(false);
      setVoiceElapsedMs(0);
      await onSendVoice(result);
    } catch (err) {
      setIsVoiceRecording(false);
      setVoiceElapsedMs(0);
      if (__DEV__) console.warn('[InputBar] stop voice recording error:', err);
      Alert.alert('Ошибка', 'Не удалось сохранить голосовое сообщение.');
    } finally {
      voiceActionBusyRef.current = false;
    }
  }, [isVoiceRecording, onSendVoice]);

  const runAttachmentAction = useCallback(async (action: () => Promise<void>) => {
    setShowAttachmentSheet(false);
    try {
      await action();
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] attachment error:', err);
      Alert.alert('Ошибка', 'Не удалось прикрепить файл. Попробуй ещё раз.');
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

    if (onSendVideoNote) {
      actions.push({
        key: 'video-note',
        title: 'Видео',
        tone: 'video',
        onPress: async () => {
          setShowVideoNoteRecorder(true);
        },
      });
    }

    return actions;
  }, [onSendFile, onSendVideoNote]);

  const loadGallery = useCallback(async () => {
    if (!onSendImage) return;

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
        mediaType: 'photo',
        first: 48,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });

      setGalleryItems(
        result.assets.map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        }))
      );
    } catch (err) {
      if (__DEV__) console.warn('[InputBar] loadGallery error:', err);
      setGalleryItems([]);
    } finally {
      setGalleryLoading(false);
    }
  }, [onSendImage]);

  useEffect(() => {
    if (showAttachmentSheet && onSendImage) {
      loadGallery();
    }
  }, [showAttachmentSheet, onSendImage, loadGallery]);

  const handlePickGalleryItem = useCallback(
    async (item: GalleryItem) => {
      if (!onSendImage) return;
      setPendingImage({
        uri: item.uri,
        width: item.width,
        height: item.height,
      });
      setShowAttachmentSheet(false);
    },
    [onSendImage]
  );

  const showAttachmentButton = onSendImage != null || attachmentActions.length > 0;

  const openAttachmentSheet = useCallback(() => {
    if (!showAttachmentButton) return;
    setShowAttachmentSheet(true);
  }, [showAttachmentButton]);

  const voiceRecordGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!canSend && !isVoiceRecording)
        .activeOffsetY([-8, 8])
        .failOffsetX([-24, 24])
        .onBegin(() => {
          voiceSwipeTriggeredRef.current = false;
        })
        .onUpdate((event) => {
          if (voiceSwipeTriggeredRef.current) return;
          if (event.translationY <= -18) {
            voiceSwipeTriggeredRef.current = true;
            runOnJS(startVoiceRecording)();
          }
        })
        .onFinalize(() => {
          voiceSwipeTriggeredRef.current = false;
        }),
    [canSend, isVoiceRecording, startVoiceRecording]
  );

  const voiceElapsedLabel = useMemo(() => {
    const minutes = Math.floor(voiceElapsedMs / 60000).toString();
    const seconds = Math.floor((voiceElapsedMs % 60000) / 1000)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [voiceElapsedMs]);

  return (
    <>
      <View style={styles.inputRow}>
        {pendingImage ? (
          <View style={styles.previewCard}>
            <Image source={{ uri: pendingImage.uri }} style={styles.previewImage} />
            <View style={styles.previewTextWrap}>
              <Text style={styles.previewTitle}>Фото готово к отправке</Text>
              <Text style={styles.previewSubtitle}>
                Можно добавить подпись и отправить одним сообщением
              </Text>
            </View>
            <Pressable
              style={styles.previewRemoveButton}
              onPress={() => setPendingImage(null)}
              accessibilityRole="button"
              accessibilityLabel="Убрать выбранное фото"
            >
              <Feather name="x" size={16} color="#6B7280" />
            </Pressable>
          </View>
        ) : null}

        {replyToMessage ? (
          <View style={styles.replyComposerWrap}>
            <ReplyPreview
              author={replyAuthorName?.trim() || 'Message'}
              text={replyPreviewText}
              mode="composer"
              onClose={onCancelReply}
            />
          </View>
        ) : null}

        {isVoiceRecording ? (
          <View style={styles.recordingComposer}>
            <Pressable
              style={styles.recordingCancelButton}
              onPress={() => {
                void cancelVoiceRecording();
              }}
              accessibilityRole="button"
              accessibilityLabel="Отменить запись голосового"
            >
              <Text style={styles.recordingCancelText}>Отмена</Text>
            </Pressable>

            <View style={styles.recordingCenter}>
              <Animated.View style={[styles.recordingDot, { opacity: recordingPulse }]} />
              <Text style={styles.recordingTime}>{voiceElapsedLabel}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.recordingSendButton,
                pressed && styles.recordingSendButtonPressed,
              ]}
              onPress={() => {
                void finishVoiceRecording();
              }}
              accessibilityRole="button"
              accessibilityLabel="Отправить голосовое сообщение"
            >
              <VoiceSendIcon />
            </Pressable>
          </View>
        ) : (
          <View style={styles.composerShell}>
            {showAttachmentButton ? (
              <Pressable
                style={styles.leadingAction}
                onPress={openAttachmentSheet}
                accessibilityRole="button"
                accessibilityLabel="Открыть вложения"
              >
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
              <Pressable
                style={({ pressed }) => [styles.trailingAction, pressed && styles.trailingActionPressed]}
                onPress={handleSend}
                accessibilityRole="button"
                accessibilityLabel="Отправить сообщение"
              >
                <SendIcon />
              </Pressable>
            ) : (
              <GestureDetector gesture={voiceRecordGesture}>
                <Pressable
                  style={({ pressed }) => [
                    styles.trailingAction,
                    pressed && styles.trailingActionPressed,
                  ]}
                  onPress={() => {
                    void startVoiceRecording();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Записать голосовое сообщение"
                >
                  <MicIcon />
                </Pressable>
              </GestureDetector>
            )}
          </View>
        )}
      </View>

      <Modal
        visible={showAttachmentSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttachmentSheet(false)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowAttachmentSheet(false)} />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Недавние</Text>
              {galleryItems.length > 0 ? (
                <Text style={styles.sheetSubtitle}>Нажми на фото, чтобы добавить в сообщение</Text>
              ) : null}
            </View>

            {onSendImage ? (
              galleryLoading ? (
                <View style={styles.galleryPlaceholder}>
                  <Text style={styles.galleryHint}>Загружаем фото...</Text>
                </View>
              ) : galleryDenied ? (
                <View style={styles.galleryPlaceholder}>
                  <Text style={styles.galleryHint}>Нужен доступ к фото, чтобы показать галерею.</Text>
                </View>
              ) : galleryItems.length > 0 ? (
                <View style={styles.galleryPanel}>
                  <ScrollView
                    style={styles.galleryScroll}
                    contentContainerStyle={styles.galleryGrid}
                    showsVerticalScrollIndicator={false}
                  >
                    {galleryItems.map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.galleryCell}
                        onPress={() => handlePickGalleryItem(item)}
                      >
                        <Image source={{ uri: item.uri }} style={styles.galleryImage} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.galleryPlaceholder}>
                  <Text style={styles.galleryHint}>Фото не найдены.</Text>
                </View>
              )
            ) : null}

            {attachmentActions.length > 0 ? (
              <>
                <Text style={styles.sheetSectionTitle}>Ещё</Text>
                <View style={styles.sheetActionsRow}>
                  {attachmentActions.map((action) => (
                    <Pressable
                      key={action.key}
                      style={styles.sheetAction}
                      onPress={() => runAttachmentAction(action.onPress)}
                    >
                      <View style={styles.sheetIconWrap}>
                        <SheetActionIcon tone={action.tone} />
                      </View>
                      <Text style={styles.sheetActionLabel}>{action.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {onSendVideoNote != null && (
        <VideoNoteRecorder
          visible={showVideoNoteRecorder}
          onComplete={handleVideoNoteComplete}
          onCancel={handleVideoNoteCancel}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  inputRow: {
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
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#EEF2F7',
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
    marginBottom: 8,
  },
  recordingComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: '#2B2C30',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
  },
  recordingCancelButton: {
    minWidth: 68,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  recordingCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#67A4FF',
  },
  recordingCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4B4B',
    marginRight: 8,
  },
  recordingTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  recordingSendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5BA3FF',
    shadowColor: '#245DA8',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  recordingSendButtonPressed: {
    opacity: 0.88,
  },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8EF',
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
    gap: 6,
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
  },
  trailingActionPressed: {
    opacity: 0.82,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.18)',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: 16,
    paddingHorizontal: 16,
    maxHeight: '80%',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D6DCE5',
    marginBottom: 14,
  },
  sheetHeader: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  galleryPanel: {
    borderRadius: 22,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#E6EBF2',
    padding: 7,
  },
  galleryScroll: {
    maxHeight: 338,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
  },
  galleryCell: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EEF2F7',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryPlaceholder: {
    minHeight: 132,
    borderRadius: 22,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#E6EBF2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  galleryHint: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  sheetSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginTop: 9,
    marginBottom: 5,
    paddingHorizontal: 4,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetAction: {
    alignItems: 'center',
    width: 56,
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#E6EBF2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sheetActionLabel: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
    textAlign: 'center',
  },
});
