import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { resolveStickerImageOrPlaceholder, soloChatusStickerDisplayDp, tryDecodeStickerPayload } from '../stickers/chatusStickerCatalog';

const DEFAULT_TELEGRAM_SIZE = soloChatusStickerDisplayDp();
const DEFAULT_ROW_SIZE = 96;

type Props = {
  rawContent: string;
  /** Время + статус: в `telegram` — под картинкой; в `row` — справа в строке. */
  children: React.ReactNode;
  stickerSize?: number;
  /** `row` — картинка и мета в одну строку (пузырь). `telegram` — без бабла, время под стикером (как в Telegram). */
  layout?: 'row' | 'telegram';
  isMe?: boolean;
};

/**
 * Если `content` — JSON-стикер Chatus, рисуем картинку + `children`.
 * Иначе возвращает `null` — родитель рендерит обычный текст.
 */
export function ChatusStickerBubbleRow({
  rawContent,
  children,
  stickerSize,
  layout = 'telegram',
  isMe = false,
}: Props) {
  const ref = tryDecodeStickerPayload(rawContent);
  if (!ref) return null;
  const src = resolveStickerImageOrPlaceholder(ref);
  const size = stickerSize ?? (layout === 'telegram' ? DEFAULT_TELEGRAM_SIZE : DEFAULT_ROW_SIZE);

  if (layout === 'telegram') {
    return (
      <View
        style={[
          styles.telegramWrap,
          isMe ? styles.telegramWrapMe : styles.telegramWrapOther,
        ]}
      >
        <Image
          source={src}
          style={{ width: size, height: size }}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={`${ref.packId}:${ref.stickerId}`}
        />
        {children ? (
          <View style={[styles.telegramMetaRow, isMe ? styles.telegramMetaRowMe : styles.telegramMetaRowOther]}>
            {children}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Image
        source={src}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={`${ref.packId}:${ref.stickerId}`}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 1,
  },
  telegramWrap: {
    position: 'relative',
  },
  /** Исходящий стикер прижимаем к правому краю блока (reply/forward может быть шире картинки). */
  telegramWrapMe: {
    alignSelf: 'flex-end',
  },
  telegramWrapOther: {
    alignSelf: 'flex-start',
  },
  telegramMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingRight: 2,
  },
  telegramMetaRowMe: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  telegramMetaRowOther: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
});
