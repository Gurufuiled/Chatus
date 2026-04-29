import React, { useCallback, useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { GallerySkeletonGrid } from './GallerySkeletonGrid';

export type AvatarPickResult = {
  uri: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
};

type PhotoItem = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
  fileName?: string | null;
};

function inferImageMime(fileName: string | undefined): string {
  const n = fileName?.trim().toLowerCase() ?? '';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.heic')) return 'image/heic';
  if (n.endsWith('.heif')) return 'image/heif';
  if (n.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

type SheetStyles = ReturnType<typeof createAvatarPickSheetStyles>;

function PhotoCell({
  item,
  disabled,
  onPress,
  styles,
}: {
  item: PhotoItem;
  disabled?: boolean;
  onPress: (item: PhotoItem) => void;
  styles: SheetStyles;
}) {
  return (
    <View style={styles.cellOuter}>
      <Pressable style={styles.cell} disabled={disabled} onPress={() => onPress(item)}>
        <Image source={{ uri: item.uri }} style={styles.cellImage} fadeDuration={0} />
      </Pressable>
    </View>
  );
}

function createAvatarPickSheetStyles(c: ThemeColors) {
  const shadow = withAlpha('#000000', 0.35);
  return StyleSheet.create({
    sheetRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha('#000000', 0.45),
    },
    sheetCard: {
      backgroundColor: c.inputBackgroundSolid,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingTop: 10,
      overflow: 'hidden',
      shadowColor: shadow,
      shadowOpacity: 0.35,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: -8 },
      elevation: 10,
    },
    sheetHeader: {
      minHeight: 58,
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
      backgroundColor: c.rowPressed,
    },
    titleBlock: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    sheetTitle: {
      fontSize: 17,
      lineHeight: 20,
      fontWeight: '800',
      color: c.textPrimary,
    },
    sheetSubtitle: {
      textAlign: 'center',
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '600',
    },
    headerSpacer: {
      width: 42,
      height: 42,
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
    cellOuter: {
      flex: 1,
    },
    cell: {
      aspectRatio: 1,
      overflow: 'hidden',
      backgroundColor: c.placeholderBg,
    },
    cellImage: {
      width: '100%',
      height: '100%',
    },
    skeletonWrap: {
      flex: 1,
      paddingTop: 4,
    },
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 26,
    },
    hint: {
      fontSize: 15,
      lineHeight: 21,
      color: c.textSecondary,
      textAlign: 'center',
    },
    bottomDock: {
      position: 'absolute',
      left: 16,
      right: 16,
    },
    allPhotosBtn: {
      minHeight: 54,
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      backgroundColor: c.buttonBackground,
      shadowColor: shadow,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    allPhotosBtnPressed: {
      opacity: 0.88,
    },
    allPhotosLabel: {
      fontSize: 15,
      fontWeight: '800',
      color: c.accent,
    },
  });
}

export type AvatarPickSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Вызывается после закрытия листа; родитель запускает загрузку. */
  onPick: (result: AvatarPickResult) => void | Promise<void>;
  /** Подзаголовок в шапке (например «Аватар профиля»). */
  subtitle?: string;
};

/**
 * Выдвижная галерея «Недавние» — тот же паттерн, что у вложений в чате,
 * для выбора фото аватара без системного пикера по умолчанию.
 */
export function AvatarPickSheet({ visible, onClose, onPick, subtitle }: AvatarPickSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createAvatarPickSheetStyles(colors), [colors]);

  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [picking, setPicking] = useState(false);

  React.useEffect(() => {
    if (!visible) {
      setExpanded(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDenied(false);

    void (async () => {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        const granted = permission.granted || permission.accessPrivileges === 'limited';
        if (!granted) {
          if (!cancelled) {
            setDenied(true);
            setItems([]);
          }
          return;
        }

        const result = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo],
          first: 60,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });

        if (cancelled) return;
        const base = result.assets.map((a) => ({
          id: a.id,
          uri: a.uri,
          width: a.width,
          height: a.height,
          fileName: a.filename,
        }));
        setItems(base);

        const enriched = await Promise.all(
          base.map(async (p) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(p.id, {
                shouldDownloadFromNetwork: true,
              });
              const faster = info.localUri?.trim() || info.uri?.trim() || p.uri;
              return { ...p, uri: faster };
            } catch {
              return p;
            }
          }),
        );
        if (!cancelled) {
          setItems(enriched);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const sheetHeight = expanded
    ? Math.round(Dimensions.get('window').height * 0.94)
    : Math.round(Dimensions.get('window').height * 0.66);

  const handleGalleryScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!expanded && event.nativeEvent.contentOffset.y > 12) {
        setExpanded(true);
      }
    },
    [expanded],
  );

  const resolveAndPick = useCallback(
    async (item: PhotoItem) => {
      if (picking) return;
      setPicking(true);
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(item.id).catch(() => null);
        const uri = assetInfo?.localUri?.trim() || assetInfo?.uri?.trim() || item.uri.trim();
        const name = assetInfo?.filename ?? item.fileName ?? 'avatar.jpg';
        const type = inferImageMime(name);
        const width = assetInfo?.width ?? item.width;
        const height = assetInfo?.height ?? item.height;

        onClose();
        await onPick({
          uri,
          name,
          type,
          width: width ?? undefined,
          height: height ?? undefined,
        });
      } finally {
        setPicking(false);
      }
    },
    [onClose, onPick, picking],
  );

  const openSystemLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    onClose();
    await onPick({
      uri: asset.uri,
      name: asset.fileName ?? 'avatar.jpg',
      type: asset.mimeType ?? inferImageMime(asset.fileName ?? undefined),
      width: asset.width,
      height: asset.height,
    });
  }, [onClose, onPick]);

  const keyExtractor = useCallback((item: PhotoItem) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PhotoItem }) => (
      <PhotoCell item={item} disabled={picking} onPress={(p) => void resolveAndPick(p)} styles={styles} />
    ),
    [picking, resolveAndPick, styles],
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
              <Feather name="x" size={24} color={colors.textPrimary} />
            </Pressable>

            <Pressable style={styles.titleBlock} onPress={() => setExpanded((v) => !v)}>
              <View style={styles.titleRow}>
                <Text style={styles.sheetTitle}>Недавние</Text>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </View>
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </Pressable>

            <View style={styles.headerSpacer} />
          </View>

          {loading ? (
            <View style={styles.skeletonWrap}>
              <GallerySkeletonGrid rows={4} />
            </View>
          ) : denied ? (
            <View style={styles.placeholder}>
              <Text style={styles.hint}>Нужен доступ к фото, чтобы показать недавние снимки.</Text>
            </View>
          ) : items.length > 0 ? (
            <View style={styles.galleryPanel}>
              <FlatList
                data={items}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                numColumns={3}
                style={styles.galleryList}
                contentContainerStyle={[styles.galleryGrid, { paddingBottom: 88 }]}
                columnWrapperStyle={styles.galleryRow}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                initialNumToRender={24}
                maxToRenderPerBatch={18}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
                onScroll={handleGalleryScroll}
                scrollEventThrottle={16}
              />
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.hint}>В галерее устройства пока нет фото.</Text>
            </View>
          )}

          <View
            pointerEvents="box-none"
            style={[styles.bottomDock, { bottom: Math.max(insets.bottom, 8) + 8 }]}
          >
            <Pressable
              style={({ pressed }) => [styles.allPhotosBtn, pressed && styles.allPhotosBtnPressed]}
              onPress={() => void openSystemLibrary()}
              disabled={picking}
            >
              <MaterialCommunityIcons name="folder-image" size={22} color={colors.accent} />
              <Text style={styles.allPhotosLabel}>Все фото…</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
