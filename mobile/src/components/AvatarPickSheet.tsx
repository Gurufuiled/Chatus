import React, { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import {
  InputAttachmentSheet,
  type GalleryItem,
} from './InputAttachmentSheet';

export type AvatarPickResult = {
  uri: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
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

export type AvatarPickSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Вызывается после закрытия листа; родитель запускает загрузку. */
  onPick: (result: AvatarPickResult) => void | Promise<void>;
  /** Подзаголовок в шапке (например «Аватар профиля»). */
  subtitle?: string;
};

/**
 * Выбор фото для аватара — та же интерактивная шторка, что у вложений в чате (`InputAttachmentSheet`).
 */
export function AvatarPickSheet({ visible, onClose, onPick, subtitle }: AvatarPickSheetProps) {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryDenied, setGalleryDenied] = useState(false);
  const [picking, setPicking] = useState(false);

  React.useEffect(() => {
    if (!visible) {
      return undefined;
    }

    let cancelled = false;
    setGalleryLoading(true);
    setGalleryDenied(false);

    void (async () => {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        const granted = permission.granted || permission.accessPrivileges === 'limited';
        if (!granted) {
          if (!cancelled) {
            setGalleryDenied(true);
            setGalleryItems([]);
          }
          return;
        }

        const result = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo],
          first: 60,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });

        if (cancelled) return;
        const base: GalleryItem[] = result.assets.map((a) => ({
          id: a.id,
          kind: 'image' as const,
          uri: a.uri,
          width: a.width,
          height: a.height,
          fileName: a.filename ?? undefined,
        }));
        setGalleryItems(base);

        const enriched = await Promise.all(
          base.map(async (p) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(p.id, {
                shouldDownloadFromNetwork: true,
              });
              const faster = info.localUri?.trim() || info.uri?.trim() || p.uri;
              return { ...p, uri: faster, localUri: faster };
            } catch {
              return p;
            }
          }),
        );
        if (!cancelled) {
          setGalleryItems(enriched);
        }
      } catch {
        if (!cancelled) setGalleryItems([]);
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const resolveAndPick = useCallback(
    async (item: GalleryItem) => {
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
    if (picking) return;
    setPicking(true);
    try {
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
    } finally {
      setPicking(false);
    }
  }, [onClose, onPick, picking]);

  return (
    <InputAttachmentSheet
      visible={visible}
      variant="avatar"
      headerSubtitle={subtitle}
      galleryEnabled
      galleryItems={galleryItems}
      galleryLoading={galleryLoading}
      galleryDenied={galleryDenied}
      attachmentActions={[]}
      selectedItems={[]}
      captionValue=""
      onClose={onClose}
      onToggleGalleryItem={(item) => void resolveAndPick(item)}
      onCaptionChange={() => {}}
      onSendSelected={() => {}}
      onRunAttachmentAction={async () => {}}
      bottomButton={{ label: 'Все фото…', onPress: openSystemLibrary }}
      galleryInteractDisabled={picking}
    />
  );
}
