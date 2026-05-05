/** Pure TDLib shape helpers (no native TDLib client). Safe for Node/tsx unit tests. */

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Prefers `big` then `small` (same as download path). */
export function getTdlibChatPhotoFileId(chat: Record<string, unknown>): number | null {
  const photo = getNestedRecord(chat.photo);
  if (!photo) return null;
  const small = getNestedRecord(photo.small);
  const big = getNestedRecord(photo.big);
  const file = big ?? small;
  const fid = typeof file?.id === 'number' ? file.id : null;
  return fid;
}
