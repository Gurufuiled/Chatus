import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { resolveStickerImageOrPlaceholder, tryDecodeStickerPayload } from '../stickers/chatusStickerCatalog';

const DEFAULT_ROW_SIZE = 104;
const DEFAULT_TELEGRAM_SIZE = 176;

type Props = {
  rawContent: string;
  /** Время + статус (в режиме `telegram` — в «таблетке» поверх картинки). */
  children: React.ReactNode;
  stickerSize?: number;
  /** `row` — картинка и мета в одну строку (пузырь). `telegram` — без бабла, время в углу на стикере. */
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
        />
        <View
          style={[
            styles.telegramMetaPill,
            isMe ? styles.telegramMetaPillMe : styles.telegramMetaPillOther,
          ]}
        >
          {children}
        </View>
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
  telegramMetaPill: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  telegramMetaPillMe: {
    backgroundColor: 'rgba(74, 149, 107, 0.92)',
  },
  telegramMetaPillOther: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
});
