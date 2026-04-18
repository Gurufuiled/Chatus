import React from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  selectedItems: GalleryItem[];
  captionValue: string;
  onClose: () => void;
  onToggleGalleryItem: (item: GalleryItem) => void;
  onCaptionChange: (text: string) => void;
  onSendSelected: () => void;
  onRunAttachmentAction: (action: () => Promise<void>) => void;
};

function SheetActionIcon({ tone }: { tone: AttachmentAction['tone'] }) {
  if (tone === 'video') {
    return <MaterialCommunityIcons name="play-circle-outline" size={21} color="#5F6875" />;
  }

  return <Feather name="file-text" size={19} color="#5F6875" />;
}

const GalleryCell = React.memo(function GalleryCell({
  item,
  selectedIndex,
  onToggle,
}: {
  item: GalleryItem;
  selectedIndex: number | null;
  onToggle: (item: GalleryItem) => void;
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
        if (!cancelled) setThumbnailUri(nextUri);
      })
      .catch(() => {
        if (!cancelled) setThumbnailUri('');
      });

    return () => {
      cancelled = true;
    };
  }, [item.kind, item.uri]);

  const previewUri = item.kind === 'video' ? thumbnailUri : item.uri;
  const isSelected = selectedIndex != null;

  return (
    <View style={styles.galleryCellOuter}>
      <Pressable style={styles.galleryCell} onPress={() => onToggle(item)}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.galleryImage} />
        ) : (
          <View style={styles.galleryVideoFallback}>
            <MaterialCommunityIcons name="movie-open-play-outline" size={28} color="#FFFFFF" />
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

        <View style={[styles.selectCircle, isSelected && styles.selectCircleSelected]}>
          {isSelected ? <Text style={styles.selectCircleText}>{selectedIndex}</Text> : null}
        </View>
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
  selectedItems,
  captionValue,
  onClose,
  onToggleGalleryItem,
  onCaptionChange,
  onSendSelected,
  onRunAttachmentAction,
}: InputAttachmentSheetProps) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  const selectedById = React.useMemo(() => {
    const map = new Map<string, number>();
    selectedItems.forEach((item, index) => map.set(item.id, index + 1));
    return map;
  }, [selectedItems]);

  const renderGalleryItem = React.useCallback(
    ({ item }: { item: GalleryItem }) => (
      <GalleryCell
        item={item}
        selectedIndex={selectedById.get(item.id) ?? null}
        onToggle={onToggleGalleryItem}
      />
    ),
    [onToggleGalleryItem, selectedById]
  );

  const keyExtractor = React.useCallback((item: GalleryItem) => item.id, []);
  const hasSelection = selectedItems.length > 0;
  const sheetHeight = expanded
    ? Math.round(Dimensions.get('window').height * 0.94)
    : Math.round(Dimensions.get('window').height * 0.66);

  const handleGalleryScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!expanded && event.nativeEvent.contentOffset.y > 12) {
        setExpanded(true);
      }
    },
    [expanded]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View
          style={[
            styles.sheetCard,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, 8) + 10,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Pressable style={styles.headerCircle} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={24} color="#111827" />
            </Pressable>

            {hasSelection ? (
              <View style={styles.selectedPill}>
                <Feather name="check" size={16} color="#FFFFFF" />
                <Text style={styles.selectedPillText}>{selectedItems.length}</Text>
              </View>
            ) : null}

            <Pressable style={styles.titlePill} onPress={() => setExpanded((value) => !value)}>
              <Text style={styles.sheetTitle}>Недавние</Text>
              <Feather
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#6B7280"
              />
            </Pressable>

            <Pressable style={styles.headerCircle} hitSlop={8}>
              <Feather name="more-horizontal" size={24} color="#111827" />
            </Pressable>
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
                  contentContainerStyle={[
                    styles.galleryGrid,
                    { paddingBottom: hasSelection ? 74 : 78 },
                  ]}
                  columnWrapperStyle={styles.galleryRow}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews
                  initialNumToRender={18}
                  maxToRenderPerBatch={12}
                  windowSize={5}
                  updateCellsBatchingPeriod={40}
                  keyboardShouldPersistTaps="handled"
                  onScroll={handleGalleryScroll}
                  scrollEventThrottle={16}
                />
              </View>
            ) : (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>Медиа не найдены.</Text>
              </View>
            )
          ) : null}

          <View
            pointerEvents="box-none"
            style={[styles.bottomAccessory, { bottom: Math.max(insets.bottom, 8) + 8 }]}
          >
            {hasSelection ? (
              <View style={styles.captionBar}>
                <TextInput
                  value={captionValue}
                  onChangeText={onCaptionChange}
                  placeholder="Добавить подпись..."
                  placeholderTextColor="#8B95A1"
                  style={styles.captionInput}
                  multiline
                />
                <Pressable style={styles.sendSelectedButton} onPress={onSendSelected}>
                  <Feather name="send" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.modeDock}>
                <View style={[styles.modeAction, styles.modeActionActive]}>
                  <MaterialCommunityIcons name="image-multiple" size={22} color="#4B8FEA" />
                  <Text style={[styles.modeActionLabel, styles.modeActionLabelActive]}>
                    Галерея
                  </Text>
                </View>
                {attachmentActions.map((action) => (
                  <Pressable
                    key={action.key}
                    style={styles.modeAction}
                    onPress={() => onRunAttachmentAction(action.onPress)}
                  >
                    <SheetActionIcon tone={action.tone} />
                    <Text style={styles.modeActionLabel}>{action.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
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
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  sheetHeader: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  headerCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,250,252,0.96)',
  },
  selectedPill: {
    height: 42,
    minWidth: 58,
    paddingHorizontal: 12,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#5A86DF',
  },
  selectedPillText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  titlePill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    color: '#111827',
  },
  galleryPanel: {
    flex: 1,
  },
  galleryList: {
    flex: 1,
  },
  galleryGrid: {
    paddingBottom: 78,
  },
  galleryRow: {
    gap: 1,
    marginBottom: 1,
  },
  galleryCellOuter: {
    flex: 1,
  },
  galleryCell: {
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: '#D8DEE7',
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
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
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
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  galleryVideoPlayIcon: {
    marginLeft: 1,
  },
  galleryVideoBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  selectCircle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.7,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  selectCircleSelected: {
    borderColor: '#5A86DF',
    backgroundColor: '#5A86DF',
  },
  selectCircleText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  galleryPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  galleryHint: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
  },
  bottomAccessory: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  modeDock: {
    minHeight: 58,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  modeAction: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  modeActionActive: {
    backgroundColor: 'rgba(75,143,234,0.1)',
  },
  modeActionLabel: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#4B5563',
  },
  modeActionLabelActive: {
    color: '#4B8FEA',
  },
  captionBar: {
    minHeight: 56,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 15,
    paddingRight: 7,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  captionInput: {
    flex: 1,
    maxHeight: 92,
    minHeight: 42,
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 0,
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
  },
  sendSelectedButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5A86DF',
  },
});
