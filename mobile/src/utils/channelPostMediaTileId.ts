/**
 * Id плитки медиа поста канала: один и тот же и во вьювере (`buildChannelPostMediaTiles`), и у
 * миниатюры в ленте/обсуждении (`thumbId`) — по нему фото «садится» на своё место при закрытии.
 * `index` — номер среди медиа с непустым `remote_url` (как в вьювере). Без импортов react-native.
 */
export function channelPostMediaTileId(messageId: string, index: number): string {
  return `${messageId}-m${index}`;
}
