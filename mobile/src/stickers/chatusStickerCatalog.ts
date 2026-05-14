import type { ImageSourcePropType } from 'react-native';
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
 * Локальные PNG в `mobile/assets/stickers/friend/` (имя файла = `stickerId`, без `.png`).
 * Сгенерировать блок require: `node scripts/genFriendStickerRequires.mjs`
 */
export const CHATUS_STICKER_IMAGES: Record<string, Record<string, ImageSourcePropType>> = {
  friend: {
    '1f44b': require('../../assets/stickers/friend/1f44b.png'),
    '1f44c': require('../../assets/stickers/friend/1f44c.png'),
    '1f44d': require('../../assets/stickers/friend/1f44d.png'),
    '1f44e': require('../../assets/stickers/friend/1f44e.png'),
    '1f596': require('../../assets/stickers/friend/1f596.png'),
    '1f600': require('../../assets/stickers/friend/1f600.png'),
    '1f601': require('../../assets/stickers/friend/1f601.png'),
    '1f602': require('../../assets/stickers/friend/1f602.png'),
    '1f604': require('../../assets/stickers/friend/1f604.png'),
    '1f605': require('../../assets/stickers/friend/1f605.png'),
    '1f606': require('../../assets/stickers/friend/1f606.png'),
    '1f607': require('../../assets/stickers/friend/1f607.png'),
    '1f609': require('../../assets/stickers/friend/1f609.png'),
    '1f60a': require('../../assets/stickers/friend/1f60a.png'),
    '1f60b': require('../../assets/stickers/friend/1f60b.png'),
    '1f60c': require('../../assets/stickers/friend/1f60c.png'),
    '1f60d': require('../../assets/stickers/friend/1f60d.png'),
    '1f60e': require('../../assets/stickers/friend/1f60e.png'),
    '1f617': require('../../assets/stickers/friend/1f617.png'),
    '1f618': require('../../assets/stickers/friend/1f618.png'),
    '1f619': require('../../assets/stickers/friend/1f619.png'),
    '1f61a': require('../../assets/stickers/friend/1f61a.png'),
    '1f61b': require('../../assets/stickers/friend/1f61b.png'),
    '1f61c': require('../../assets/stickers/friend/1f61c.png'),
    '1f61d': require('../../assets/stickers/friend/1f61d.png'),
    '1f631': require('../../assets/stickers/friend/1f631.png'),
    '1f634': require('../../assets/stickers/friend/1f634.png'),
    '1f642': require('../../assets/stickers/friend/1f642.png'),
    '1f642-200d-2195-fe0f': require('../../assets/stickers/friend/1f642-200d-2195-fe0f.png'),
    '1f643': require('../../assets/stickers/friend/1f643.png'),
    '1f90c': require('../../assets/stickers/friend/1f90c.png'),
    '1f910': require('../../assets/stickers/friend/1f910.png'),
    '1f911': require('../../assets/stickers/friend/1f911.png'),
    '1f914': require('../../assets/stickers/friend/1f914.png'),
    '1f917': require('../../assets/stickers/friend/1f917.png'),
    '1f918': require('../../assets/stickers/friend/1f918.png'),
    '1f919': require('../../assets/stickers/friend/1f919.png'),
    '1f91a': require('../../assets/stickers/friend/1f91a.png'),
    '1f91e': require('../../assets/stickers/friend/1f91e.png'),
    '1f91f': require('../../assets/stickers/friend/1f91f.png'),
    '1f923': require('../../assets/stickers/friend/1f923.png'),
    '1f928': require('../../assets/stickers/friend/1f928.png'),
    '1f929': require('../../assets/stickers/friend/1f929.png'),
    '1f92a': require('../../assets/stickers/friend/1f92a.png'),
    '1f92b': require('../../assets/stickers/friend/1f92b.png'),
    '1f92d': require('../../assets/stickers/friend/1f92d.png'),
    '1f970': require('../../assets/stickers/friend/1f970.png'),
    '1f972': require('../../assets/stickers/friend/1f972.png'),
    '1f973': require('../../assets/stickers/friend/1f973.png'),
    '1f974': require('../../assets/stickers/friend/1f974.png'),
    '1f979': require('../../assets/stickers/friend/1f979.png'),
    '1f97a': require('../../assets/stickers/friend/1f97a.png'),
    '1fa77': require('../../assets/stickers/friend/1fa77.png'),
    '1fae0': require('../../assets/stickers/friend/1fae0.png'),
    '1fae2': require('../../assets/stickers/friend/1fae2.png'),
    '1fae3': require('../../assets/stickers/friend/1fae3.png'),
    '1fae9': require('../../assets/stickers/friend/1fae9.png'),
    '1faea': require('../../assets/stickers/friend/1faea.png'),
    '1faf1': require('../../assets/stickers/friend/1faf1.png'),
    '1faf2': require('../../assets/stickers/friend/1faf2.png'),
    '1faf5': require('../../assets/stickers/friend/1faf5.png'),
    '2639-fe0f': require('../../assets/stickers/friend/2639-fe0f.png'),
    '263a-fe0f': require('../../assets/stickers/friend/263a-fe0f.png'),
    '270c-fe0f': require('../../assets/stickers/friend/270c-fe0f.png'),
    '2764-fe0f': require('../../assets/stickers/friend/2764-fe0f.png'),
    wave: require('../../assets/stickers/friend/1f44b.png'),
    hi: require('../../assets/stickers/friend/1f600.png'),
    heart: require('../../assets/stickers/friend/2764-fe0f.png'),
    laugh: require('../../assets/stickers/friend/1f602.png'),
    coffee: require('../../assets/stickers/friend/1f914.png'),
    moon: require('../../assets/stickers/friend/1f634.png'),
    star: require('../../assets/stickers/friend/1f929.png'),
    gift: require('../../assets/stickers/friend/1f973.png'),
    cat: require('../../assets/stickers/friend/1f923.png'),
    plane: require('../../assets/stickers/friend/270c-fe0f.png'),
    donut: require('../../assets/stickers/friend/1f60b.png'),
    plant: require('../../assets/stickers/friend/263a-fe0f.png'),
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

export function resolveStickerImage(ref: ChatusStickerRef): ImageSourcePropType | undefined {
  return CHATUS_STICKER_IMAGES[ref.packId]?.[ref.stickerId];
}

/** Локальная картинка или общий плейсхолдер, если пак/стикер неизвестны этой сборке. */
export function resolveStickerImageOrPlaceholder(ref: ChatusStickerRef): ImageSourcePropType {
  return resolveStickerImage(ref) ?? PLACEHOLDER;
}
