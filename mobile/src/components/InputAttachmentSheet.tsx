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
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import MaterialCommunityIcons from 'expo/node_modules/@expo/vector-icons/MaterialCommunityIcons';

type GalleryItem = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
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
  return (
    <View style={styles.galleryCellOuter}>
      <Pressable style={styles.galleryCell} onPress={() => onPick(item)}>
        <Image source={{ uri: item.uri }} style={styles.galleryImage} />
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
              <Text style={styles.sheetSubtitle}>Нажми на фото, чтобы добавить в сообщение</Text>
            ) : null}
          </View>

          {galleryEnabled ? (
            galleryLoading ? (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>Загружаем фото...</Text>
              </View>
            ) : galleryDenied ? (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>
                  Нужен доступ к фото, чтобы показать галерею.
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
