/** Payload helpers shared by composer sends (InputBar → TDLib). */

export function fileUriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}

export function getLocalInputFile(uri: string): Record<string, unknown> {
  return {
    '@type': 'inputFileLocal',
    path: fileUriToPath(uri),
  };
}

export function formattedText(text?: string): Record<string, unknown> {
  return {
    '@type': 'formattedText',
    text: text?.trim() ?? '',
    entities: [],
  };
}

export function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function previewForUnsupported(kind: string | undefined): string {
  switch (kind) {
    case 'messagePhoto':
      return 'Фото';
    case 'messageVideo':
      return 'Видео';
    case 'messageDocument':
      return 'Файл';
    case 'messageSticker':
      return 'Стикер';
    default:
      return 'Сообщение';
  }
}

export function getInputReplyTo(messageId: number | null): Record<string, unknown> | undefined {
  if (messageId == null || messageId <= 0) return undefined;
  return {
    '@type': 'inputMessageReplyToMessage',
    message_id: messageId,
    quote: null,
    checklist_task_id: 0,
  };
}
