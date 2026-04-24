import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InputAttachmentSheet } from '../components/InputAttachmentSheet';
import { apiUpload } from '../services/apiClient';
import { createFeedback } from '../services/feedbackService';
import { colors } from '../theme/colors';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'FeedbackCompose'>;

type GalleryItem = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fileName?: string;
};

function inferMimeTypeFromFileName(fileName: string | undefined): string {
  const normalized = fileName?.trim().toLowerCase();
  if (!normalized) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.heic')) return 'image/heic';
  if (normalized.endsWith('.heif')) return 'image/heif';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export function FeedbackComposeScreen({ navigation, route }: Props) {
  const { kind } = route.params;
  const title = kind === 'bug' ? 'Сообщить о баге' : 'Предложение';
  const insets = useSafeAreaInsets();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [selectedGalleryItems, setSelectedGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryCaption, setGalleryCaption] = useState('');
  const [sheetUploading, setSheetUploading] = useState(false);

  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentPreviewUri, setAttachmentPreviewUri] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => null,
    });
  }, [navigation, title]);

  const loadGallery = useCallback(async () => {
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
        mediaType: [MediaLibrary.MediaType.photo],
        first: 48,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });

      setGalleryItems(
        result.assets.map((asset) => ({
          id: asset.id,
          kind: 'image' as const,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          fileName: asset.filename,
        })),
      );
    } catch {
      setGalleryItems([]);
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showAttachmentSheet) {
      void loadGallery();
    }
  }, [showAttachmentSheet, loadGallery]);

  const handleToggleGalleryItem = useCallback((item: GalleryItem) => {
    setSelectedGalleryItems((cur) => {
      if (cur[0]?.id === item.id) return [];
      return [item];
    });
  }, []);

  const closeAttachmentSheet = useCallback(() => {
    setShowAttachmentSheet(false);
    setSelectedGalleryItems([]);
    setGalleryCaption('');
  }, []);

  const handleSendSelectedFromSheet = useCallback(async () => {
    const item = selectedGalleryItems[0];
    if (!item) return;

    setSheetUploading(true);
    try {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(item.id).catch(() => null);
      const resolvedUri =
        assetInfo?.localUri?.trim() || assetInfo?.uri?.trim() || item.uri;
      const fileName = assetInfo?.filename ?? item.fileName ?? 'photo.jpg';
      const mime = inferMimeTypeFromFileName(fileName);

      const uploaded = await apiUpload({
        uri: resolvedUri,
        name: fileName,
        type: mime,
      });

      setAttachmentUrl(uploaded.url);
      setAttachmentPreviewUri(resolvedUri);
      closeAttachmentSheet();
    } catch (e) {
      Alert.alert('', e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setSheetUploading(false);
    }
  }, [closeAttachmentSheet, selectedGalleryItems]);

  const submit = useCallback(async () => {
    const t = subject.trim();
    const b = body.trim();
    if (!t || !b) {
      Alert.alert('', 'Заполните заголовок и текст.');
      return;
    }
    setSubmitting(true);
    try {
      const entry = await createFeedback({
        type: kind,
        title: t,
        body: b,
        ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}),
      });
      setToastVisible(true);
      setTimeout(() => {
        setToastVisible(false);
        navigation.navigate('FeedbackList', { kind, prependEntry: entry });
      }, 2000);
    } catch (e) {
      Alert.alert('', e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  }, [attachmentUrl, body, kind, navigation, subject]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
      >
        <Text style={styles.label}>Заголовок</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Кратко"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          maxLength={200}
          editable={!submitting}
        />
        <Text style={styles.label}>Текст</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Опишите подробнее"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, styles.bodyInput]}
          multiline
          textAlignVertical="top"
          maxLength={8000}
          editable={!submitting}
        />

        {attachmentPreviewUri ? (
          <View style={styles.inlinePreview}>
            <Image
              source={{ uri: attachmentPreviewUri }}
              style={styles.inlinePreviewImg}
              resizeMode="contain"
            />
            <Pressable
              accessibilityLabel="Убрать фото"
              style={styles.inlinePreviewRemove}
              onPress={() => {
                setAttachmentUrl(null);
                setAttachmentPreviewUri(null);
              }}
              hitSlop={10}
            >
              <Feather name="x" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          style={styles.galleryFooterBtn}
          onPress={() => setShowAttachmentSheet(true)}
          disabled={submitting || sheetUploading}
        >
          <Feather name="image" size={22} color={colors.accent} />
          <Text style={styles.galleryFooterLabel}>Галерея</Text>
        </Pressable>

        <Pressable
          style={[styles.sendFooterBtn, submitting && styles.sendFooterBtnDisabled]}
          onPress={() => void submit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendFooterText}>Отправить</Text>
          )}
        </Pressable>
      </View>

      <InputAttachmentSheet
        visible={showAttachmentSheet}
        galleryEnabled
        galleryItems={galleryItems}
        galleryLoading={galleryLoading || sheetUploading}
        galleryDenied={galleryDenied}
        attachmentActions={[]}
        selectedItems={selectedGalleryItems}
        captionValue={galleryCaption}
        onClose={closeAttachmentSheet}
        onToggleGalleryItem={handleToggleGalleryItem}
        onCaptionChange={setGalleryCaption}
        onSendSelected={() => void handleSendSelectedFromSheet()}
        onRunAttachmentAction={async () => {}}
      />

      {toastVisible ? (
        <View style={styles.toastOverlay} pointerEvents="none">
          <View style={styles.toastPill}>
            <MaterialCommunityIcons name="check-circle" size={22} color="#fff" />
            <Text style={styles.toastText}>Отправлено</Text>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.chatBackground },
  scroll: { padding: 16, paddingBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: colors.inputBackgroundSolid,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    marginBottom: 16,
  },
  bodyInput: { minHeight: 200 },
  inlinePreview: {
    alignSelf: 'stretch',
    marginBottom: 8,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.inputBackground,
  },
  inlinePreviewImg: { width: '100%', height: '100%' },
  inlinePreviewRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.chatBackground,
  },
  galleryFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  galleryFooterLabel: { fontSize: 15, fontWeight: '600', color: colors.accent },
  sendFooterBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  sendFooterBtnDisabled: { opacity: 0.75 },
  sendFooterText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 120,
    zIndex: 50,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(33,33,33,0.92)',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
