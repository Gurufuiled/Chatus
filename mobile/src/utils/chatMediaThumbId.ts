/**
 * Ключ миниатюры медиа в `mediaThumbRegistry` для обычных чатов: связывает плитку альбома /
 * фото в сообщении с кадром во вьювере (по адресу файла). Без импортов react-native.
 */
export type ChatMediaLike = {
  remote_url?: string | null;
  thumbnail_url?: string | null;
};

export function chatMediaThumbId(item: ChatMediaLike | null | undefined): string {
  return `chat-media:${(item?.remote_url ?? item?.thumbnail_url ?? '').trim()}`;
}
