import { PixelRatio, type ImageSourcePropType } from 'react-native';
import type { ChatusStickerRef } from './chatusStickerPayload';

export type { ChatusStickerRef } from './chatusStickerPayload';
export {
  encodeStickerPayload,
  isChatusStickerMessage,
  resolveChatusStickerSoloSendFlag,
  tryDecodeStickerPayload,
} from './chatusStickerPayload';

/** Плейсхолдер для неизвестного pack/id в сообщении. */
const PLACEHOLDER: ImageSourcePropType = require('../../assets/chatus_icon.png');

/** Старые id в сообщениях / истории — те же файлы, что и по имени кодпоинта. */
const FRIEND_LEGACY_STICKER_TO_STEM: Readonly<Record<string, string>> = {
  wave: '1f44b',
  hi: '1f600',
  heart: '2764-fe0f',
  laugh: '1f602',
  coffee: '1f914',
  moon: '1f634',
  star: '1f929',
  gift: '1f973',
  cat: '1f923',
  plane: '270c-fe0f',
  donut: '1f60b',
  plant: '263a-fe0f',
};

const LEGACY_FRIEND_STICKER_IDS = new Set<string>(Object.keys(FRIEND_LEGACY_STICKER_TO_STEM));

const EMOJI_TO_FRIEND_STICKER_ID = new Map<string, string>();

export function friendStickerIdToEmoji(stickerId: string): string {
  let stem = stickerId;
  if (LEGACY_FRIEND_STICKER_IDS.has(stickerId)) {
    stem = FRIEND_LEGACY_STICKER_TO_STEM[stickerId] || stickerId;
  }
  return stem.split('-').map(hex => String.fromCodePoint(parseInt(hex, 16))).join('');
}

export function getFriendStickerIdForEmoji(emoji: string): string | null {
  if (EMOJI_TO_FRIEND_STICKER_ID.size === 0) {
    for (const id of Object.keys(CHATUS_STICKER_IMAGES.friend)) {
      if (LEGACY_FRIEND_STICKER_IDS.has(id)) continue;
      EMOJI_TO_FRIEND_STICKER_ID.set(friendStickerIdToEmoji(id), id);
    }
  }
  return EMOJI_TO_FRIEND_STICKER_ID.get(emoji) ?? null;
}

/** Новые отправки и MRU — по возможности с кодпоинт-id, без legacy-имён. */
export function canonicalFriendStickerRef(ref: ChatusStickerRef): ChatusStickerRef {
  if (ref.packId !== 'friend') return ref;
  const stem = FRIEND_LEGACY_STICKER_TO_STEM[ref.stickerId];
  return stem ? { packId: 'friend', stickerId: stem } : ref;
}

export type StickerSheetItem = {
  packId: string;
  stickerId: string;
};

export type StickerSheetSection = {
  id: string;
  title: string;
  stickers: StickerSheetItem[];
};

/**
 * Локальные WebP (lossless) в `mobile/assets/stickers/friend/` (имя = `stickerId`, без `.webp`).
 * Сгенерировать блок require: `node scripts/genFriendStickerRequires.mjs`
 */
export const CHATUS_STICKER_IMAGES: Record<string, Record<string, ImageSourcePropType>> = {
  friend: {
    '1f44b': require('../../assets/stickers/friend/1f44b.webp'),
    '1f44c': require('../../assets/stickers/friend/1f44c.webp'),
    '1f44d': require('../../assets/stickers/friend/1f44d.webp'),
    '1f44e': require('../../assets/stickers/friend/1f44e.webp'),
    '1f596': require('../../assets/stickers/friend/1f596.webp'),
    '1f600': require('../../assets/stickers/friend/1f600.webp'),
    '1f601': require('../../assets/stickers/friend/1f601.webp'),
    '1f602': require('../../assets/stickers/friend/1f602.webp'),
    '1f604': require('../../assets/stickers/friend/1f604.webp'),
    '1f605': require('../../assets/stickers/friend/1f605.webp'),
    '1f606': require('../../assets/stickers/friend/1f606.webp'),
    '1f607': require('../../assets/stickers/friend/1f607.webp'),
    '1f609': require('../../assets/stickers/friend/1f609.webp'),
    '1f60a': require('../../assets/stickers/friend/1f60a.webp'),
    '1f60b': require('../../assets/stickers/friend/1f60b.webp'),
    '1f60c': require('../../assets/stickers/friend/1f60c.webp'),
    '1f60d': require('../../assets/stickers/friend/1f60d.webp'),
    '1f60e': require('../../assets/stickers/friend/1f60e.webp'),
    '1f617': require('../../assets/stickers/friend/1f617.webp'),
    '1f618': require('../../assets/stickers/friend/1f618.webp'),
    '1f619': require('../../assets/stickers/friend/1f619.webp'),
    '1f61a': require('../../assets/stickers/friend/1f61a.webp'),
    '1f61b': require('../../assets/stickers/friend/1f61b.webp'),
    '1f61c': require('../../assets/stickers/friend/1f61c.webp'),
    '1f61d': require('../../assets/stickers/friend/1f61d.webp'),
    '1f631': require('../../assets/stickers/friend/1f631.webp'),
    '1f634': require('../../assets/stickers/friend/1f634.webp'),
    '1f642': require('../../assets/stickers/friend/1f642.webp'),
    '1f642-200d-2195-fe0f': require('../../assets/stickers/friend/1f642-200d-2195-fe0f.webp'),
    '1f643': require('../../assets/stickers/friend/1f643.webp'),
    '1f90c': require('../../assets/stickers/friend/1f90c.webp'),
    '1f910': require('../../assets/stickers/friend/1f910.webp'),
    '1f911': require('../../assets/stickers/friend/1f911.webp'),
    '1f914': require('../../assets/stickers/friend/1f914.webp'),
    '1f917': require('../../assets/stickers/friend/1f917.webp'),
    '1f918': require('../../assets/stickers/friend/1f918.webp'),
    '1f919': require('../../assets/stickers/friend/1f919.webp'),
    '1f91a': require('../../assets/stickers/friend/1f91a.webp'),
    '1f91e': require('../../assets/stickers/friend/1f91e.webp'),
    '1f91f': require('../../assets/stickers/friend/1f91f.webp'),
    '1f923': require('../../assets/stickers/friend/1f923.webp'),
    '1f928': require('../../assets/stickers/friend/1f928.webp'),
    '1f929': require('../../assets/stickers/friend/1f929.webp'),
    '1f92a': require('../../assets/stickers/friend/1f92a.webp'),
    '1f92b': require('../../assets/stickers/friend/1f92b.webp'),
    '1f92d': require('../../assets/stickers/friend/1f92d.webp'),
    '1f970': require('../../assets/stickers/friend/1f970.webp'),
    '1f972': require('../../assets/stickers/friend/1f972.webp'),
    '1f973': require('../../assets/stickers/friend/1f973.webp'),
    '1f974': require('../../assets/stickers/friend/1f974.webp'),
    '1f979': require('../../assets/stickers/friend/1f979.webp'),
    '1f97a': require('../../assets/stickers/friend/1f97a.webp'),
    '1fa77': require('../../assets/stickers/friend/1fa77.webp'),
    '1fae0': require('../../assets/stickers/friend/1fae0.webp'),
    '1fae2': require('../../assets/stickers/friend/1fae2.webp'),
    '1fae3': require('../../assets/stickers/friend/1fae3.webp'),
    '1fae9': require('../../assets/stickers/friend/1fae9.webp'),
    '1faea': require('../../assets/stickers/friend/1faea.webp'),
    '1faf1': require('../../assets/stickers/friend/1faf1.webp'),
    '1faf2': require('../../assets/stickers/friend/1faf2.webp'),
    '1faf5': require('../../assets/stickers/friend/1faf5.webp'),
    '2639-fe0f': require('../../assets/stickers/friend/2639-fe0f.webp'),
    '263a-fe0f': require('../../assets/stickers/friend/263a-fe0f.webp'),
    '270c-fe0f': require('../../assets/stickers/friend/270c-fe0f.webp'),
    '2764-fe0f': require('../../assets/stickers/friend/2764-fe0f.webp'),
    wave: require('../../assets/stickers/friend/1f44b.webp'),
    hi: require('../../assets/stickers/friend/1f600.webp'),
    heart: require('../../assets/stickers/friend/2764-fe0f.webp'),
    laugh: require('../../assets/stickers/friend/1f602.webp'),
    coffee: require('../../assets/stickers/friend/1f914.webp'),
    moon: require('../../assets/stickers/friend/1f634.webp'),
    star: require('../../assets/stickers/friend/1f929.webp'),
    gift: require('../../assets/stickers/friend/1f973.webp'),
    cat: require('../../assets/stickers/friend/1f923.webp'),
    plane: require('../../assets/stickers/friend/270c-fe0f.webp'),
    donut: require('../../assets/stickers/friend/1f60b.webp'),
    plant: require('../../assets/stickers/friend/263a-fe0f.webp'),
  },
};

/** Все «emoji & people» (без legacy-алиасов), порядок — сортировка id как в файловой системе. */
export const FRIEND_EMOJI_PEOPLE_STICKER_ITEMS: StickerSheetItem[] = (
  Object.keys(CHATUS_STICKER_IMAGES.friend).filter((k) => !LEGACY_FRIEND_STICKER_IDS.has(k)) as string[]
)
  .sort((a, b) => a.localeCompare(b, 'en'))
  .map((stickerId) => ({ packId: 'friend', stickerId }));

/**
 * @deprecated Секции шторки собираются в `StickerPackSheet` (рейл паков + «Недавние» + каталог).
 * Оставлено для обратной совместимости импортов: полный каталог = второй раздел.
 */
export const CHATUS_STICKER_SHEET_SECTIONS: StickerSheetSection[] = [
  {
    id: 'emoji_people',
    title: 'Emoji & People',
    stickers: FRIEND_EMOJI_PEOPLE_STICKER_ITEMS,
  },
];

export function getStickerSheetItemsForPack(packId: string): StickerSheetItem[] {
  if (packId === 'friend') return FRIEND_EMOJI_PEOPLE_STICKER_ITEMS;
  return [];
}

/** Левая колонка наборов (как в TG); при добавлении паков — расширять массив. */
export type ChatusStickerPackRailItem = {
  packId: string;
  title: string;
  /** Превью в рейле */
  coverStickerId: string;
};

export const CHATUS_STICKER_PACK_RAIL: readonly ChatusStickerPackRailItem[] = [
  { packId: 'friend', title: 'Friend', coverStickerId: '1f600' },
];

/**
 * Размер исходника friend-pack WebP в пикселях (`assets/stickers/friend/*.webp`).
 * При 64×64 и отображении ~168dp на ×3 — ~8× upscale → заметное «мыло».
 * Для «как в Telegram» по крупности перегенерируйте ассеты **≥512px** и поднимите `maxDp` в `soloChatusStickerDisplayDp`.
 */
export const CHATUS_FRIEND_STICKER_SOURCE_PX = 64;

/**
 * Рекомендуемый размер **одиночного** стикера в dp: ограничиваем апскейл относительно `CHATUS_FRIEND_STICKER_SOURCE_PX`.
 */
export function soloChatusStickerDisplayDp(options?: { maxDp?: number; maxUpscale?: number }): number {
  const maxDp = options?.maxDp ?? 168;
  const maxUpscale = options?.maxUpscale ?? 4;
  const pr = PixelRatio.get() || 1;
  const cap = (CHATUS_FRIEND_STICKER_SOURCE_PX * maxUpscale) / pr;
  return Math.round(Math.min(maxDp, Math.max(56, cap)));
}

export function resolveStickerImage(ref: ChatusStickerRef): ImageSourcePropType | undefined {
  return CHATUS_STICKER_IMAGES[ref.packId]?.[ref.stickerId];
}

/** Локальная картинка или общий плейсхолдер, если пак/стикер неизвестны этой сборке. */
export function resolveStickerImageOrPlaceholder(ref: ChatusStickerRef): ImageSourcePropType {
  return resolveStickerImage(ref) ?? PLACEHOLDER;
}
