/** Короткий текст превью из TDLib `message.content` (как в списке диалогов). */
export function tdlibMessagePreviewFromContent(content: Record<string, unknown> | undefined): string {
  if (!content) return 'Сообщение';
  const kind = content['@type'] as string | undefined;
  if (kind === 'messageText') {
    const text = (content.text as { text?: string } | undefined)?.text;
    return text?.trim() || 'Сообщение';
  }
  if (kind === 'messagePhoto') return 'Фото';
  if (kind === 'messageVideo') return 'Видео';
  if (kind === 'messageVideoNote') return 'Видеосообщение';
  if (kind === 'messageDocument') return 'Файл';
  if (kind === 'messageVoiceNote') return 'Голосовое';
  if (kind === 'messageSticker') return 'Стикер';
  if (kind === 'messageAnimation') return 'GIF';
  if (kind === 'messagePoll') return 'Опрос';
  if (kind === 'messageLocation') return 'Локация';
  if (kind === 'messageContact') return 'Контакт';
  return 'Сообщение';
}
