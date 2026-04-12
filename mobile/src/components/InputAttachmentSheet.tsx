import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { formatMediaDuration } from '../utils/mediaDuration';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';

type GalleryItem = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

type AttachmentAction = {
  key: string;
  title: string;
  tone: 'file' | 'video';
  onPress: () => Promise<void>;
};

type InputAttachmentSheetProps = {
  visible: boolean;
  galleryEnabled: boolean;
  galleryItems: GalleryItem[];
  galleryLoading: boolean;
  galleryDenied: boolean;
  attachmentActions: AttachmentAction[];
  onClose: () => void;
  onPickGalleryItem: (item: GalleryItem) => void;
  onRunAttachmentAction: (action: () => Promise<void>) => void;
};

function SheetActionIcon({ tone }: { tone: AttachmentAction['tone'] }) {
  if (tone === 'video') {
    return <MaterialCommunityIcons name="play-circle-outline" size={19} color="#6B7280" />;
  }

  return <Feather name="file-text" size={16} color="#6B7280" />;
}

const GalleryCell = React.memo(function GalleryCell({
  item,
  onPick,
}: {
  item: GalleryItem;
  onPick: (item: GalleryItem) => void;
}) {
  const [thumbnailUri, setThumbnailUri] = React.useState(() =>
    item.kind === 'video' ? getCachedVideoThumbnailUri(item.uri) ?? '' : ''
  );

  React.useEffect(() => {
    if (item.kind !== 'video') {
      setThumbnailUri('');
      return;
    }

    const cached = getCachedVideoThumbnailUri(item.uri);
    if (cached) {
      setThumbnailUri(cached);
      return;
    }

    let cancelled = false;
    void ensureVideoThumbnailUri(item.uri)
      .then((nextUri) => {
        if (!cancelled) {
          setThumbnailUri(nextUri);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThumbnailUri('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item.kind, item.uri]);

  const previewUri = item.kind === 'video' ? thumbnailUri : item.uri;

  return (
    <View style={styles.galleryCellOuter}>
      <Pressable style={styles.galleryCell} onPress={() => onPick(item)}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.galleryImage} />
        ) : (
          <View style={styles.galleryVideoFallback}>
            <MaterialCommunityIcons name="movie-open-play-outline" size={26} color="#FFFFFF" />
          </View>
        )}

        {item.kind === 'video' ? (
          <>
            <View style={styles.galleryVideoOverlay} />
            <View style={styles.galleryVideoBadge}>
              <Feather name="play" size={11} color="#FFFFFF" style={styles.galleryVideoPlayIcon} />
              <Text style={styles.galleryVideoBadgeText}>
                {formatMediaDuration(item.durationMs ?? 0)}
              </Text>
            </View>
          </>
        ) : null}
      </Pressable>
    </View>
  );
});

export const InputAttachmentSheet = React.memo(function InputAttachmentSheet({
  visible,
  galleryEnabled,
  galleryItems,
  galleryLoading,
  galleryDenied,
  attachmentActions,
  onClose,
  onPickGalleryItem,
  onRunAttachmentAction,
}: InputAttachmentSheetProps) {
  const renderGalleryItem = React.useCallback(
    ({ item }: { item: GalleryItem }) => <GalleryCell item={item} onPick={onPickGalleryItem} />,
    [onPickGalleryItem]
  );

  const keyExtractor = React.useCallback((item: GalleryItem) => item.id, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Недавние</Text>
            {galleryItems.length > 0 ? (
              <Text style={styles.sheetSubtitle}>
                Нажми на фото или видео, чтобы добавить в сообщение
              </Text>
            ) : null}
          </View>

          {galleryEnabled ? (
            galleryLoading ? (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>Загружаем медиа...</Text>
              </View>
            ) : galleryDenied ? (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>
                  Нужен доступ к фото и видео, чтобы показать галерею.
                </Text>
              </View>
            ) : galleryItems.length > 0 ? (
              <View style={styles.galleryPanel}>
                <FlatList
                  data={galleryItems}
                  keyExtractor={keyExtractor}
                  renderItem={renderGalleryItem}
                  numColumns={3}
                  style={styles.galleryList}
                  contentContainerStyle={styles.galleryGrid}
                  columnWrapperStyle={styles.galleryRow}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews
                  initialNumToRender={18}
                  maxToRenderPerBatch={12}
                  windowSize={5}
                  updateCellsBatchingPeriod={40}
                  keyboardShouldPersistTaps="handled"
                />
              </View>
            ) : (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>Медиа не найдены.</Text>
              </View>
            )
          ) : null}

          {attachmentActions.length > 0 ? (
            <>
              <Text style={styles.sheetSectionTitle}>Еще</Text>
              <View style={styles.sheetActionsRow}>
                {attachmentActions.map((action) => (
                  <Pressable
                    key={action.key}
                    style={styles.sheetAction}
                    onPress={() => onRunAttachmentAction(action.onPress)}
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
  );
});

const styles = StyleSheet.create({
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
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
  galleryList: {
    maxHeight: 338,
  },
  galleryGrid: {
    paddingBottom: 4,
  },
  galleryRow: {
    gap: 6,
    marginBottom: 6,
  },
  galleryCellOuter: {
    flex: 1,
  },
  galleryCell: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EEF2F7',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryVideoFallback: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.16)',
  },
  galleryVideoBadge: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  galleryVideoPlayIcon: {
    marginLeft: 1,
  },
  galleryVideoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
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
