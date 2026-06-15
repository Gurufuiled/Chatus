/** True when message content is a user caption (not a media placeholder). */
export function isAlbumCaption(content: string | null | undefined): boolean {
  if (!content?.trim()) return false;
  const text = content.trim();
  if (text === 'Photo' || text === 'Video' || text === 'Voice message') return false;
  if (/^\d+ media$/.test(text)) return false;
  return true;
}

export function isAlbumMessage(
  msgType: string,
  mediaCount: number,
): boolean {
  return mediaCount > 1 && (msgType === 'image' || msgType === 'video');
}
