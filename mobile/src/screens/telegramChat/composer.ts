/** Payload helpers shared by composer sends (InputBar → TDLib). */

export function fileUriToPath(uri: string): string {
  const path = decodeURIComponent(uri.trim().replace(/^file:\/\//, '')).replace(/\/+$/, '');
  if (!path) {
    throw new Error('TDLib media file path is empty');
  }
  return path;
}

export function getLocalInputFile(uri: string): Record<string, unknown> {
  return {
    '@type': 'inputFileLocal',
    path: fileUriToPath(uri),
  };
}

export function getInputThumbnail(
  uri: string,
  width: number,
  height: number,
): Record<string, unknown> {
  return {
    '@type': 'inputThumbnail',
    thumbnail: getLocalInputFile(uri),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** TDLib `inputMessageVideoNote` (кружок), не `inputMessageVideo`. */
export function buildInputMessageVideoNoteContent(params: {
  videoUri: string;
  thumbnailUri?: string | null;
  durationMs: number;
  lengthPx: number;
}): Record<string, unknown> {
  const lengthPx = Math.min(640, Math.max(240, Math.round(params.lengthPx)));
  const durationSec = Math.max(1, Math.min(60, Math.round(params.durationMs / 1000)));
  const thumbUri = params.thumbnailUri?.trim();
  return {
    '@type': 'inputMessageVideoNote',
    video_note: {
      '@type': 'inputVideoNote',
      video_note: getLocalInputFile(params.videoUri),
      thumbnail: thumbUri ? getInputThumbnail(thumbUri, lengthPx, lengthPx) : null,
      duration: durationSec,
      length: lengthPx,
    },
    self_destruct_type: null,
  };
}

export function formattedText(text?: string): Record<string, unknown> {
  return {
    '@type': 'formattedText',
    text: text?.trim() ?? '',
    entities: [],
  };
}

/** TDLib 1.8.66 wraps the local file and metadata in `inputVoiceNote`. */
export function buildInputMessageVoiceNoteContent(params: {
  voiceUri: string;
  durationMs: number;
  waveform?: string;
}): Record<string, unknown> {
  return {
    '@type': 'inputMessageVoiceNote',
    voice_note: {
      '@type': 'inputVoiceNote',
      voice_note: getLocalInputFile(params.voiceUri),
      duration: Math.max(1, Math.round(params.durationMs / 1000)),
      waveform: params.waveform ?? '',
    },
    caption: formattedText(),
    self_destruct_type: null,
  };
}

export function buildInputMessageVideoContent(params: {
  videoUri: string;
  durationMs?: number;
  width?: number;
  height?: number;
  caption?: string;
}): Record<string, unknown> {
  return {
    '@type': 'inputMessageVideo',
    video: {
      '@type': 'inputVideo',
      video: getLocalInputFile(params.videoUri),
      thumbnail: null,
      cover: null,
      start_timestamp: 0,
      added_sticker_file_ids: [],
      duration: Math.max(1, Math.round((params.durationMs ?? 1000) / 1000)),
      width: Math.max(1, Math.round(params.width ?? 1)),
      height: Math.max(1, Math.round(params.height ?? 1)),
      supports_streaming: true,
    },
    caption: formattedText(params.caption),
    show_caption_above_media: false,
    self_destruct_type: null,
    has_spoiler: false,
  };
}

export function buildInputMessagePhotoContent(params: {
  photoUri: string;
  width?: number;
  height?: number;
  caption?: string;
}): Record<string, unknown> {
  return {
    '@type': 'inputMessagePhoto',
    photo: {
      '@type': 'inputPhoto',
      photo: getLocalInputFile(params.photoUri),
      thumbnail: null,
      video: null,
      added_sticker_file_ids: [],
      width: Math.max(1, Math.round(params.width ?? 1)),
      height: Math.max(1, Math.round(params.height ?? 1)),
    },
    caption: formattedText(params.caption),
    show_caption_above_media: false,
    self_destruct_type: null,
    has_spoiler: false,
  };
}

export function buildInputMessageDocumentContent(params: {
  documentUri: string;
}): Record<string, unknown> {
  return {
    '@type': 'inputMessageDocument',
    document: {
      '@type': 'inputDocument',
      document: getLocalInputFile(params.documentUri),
      thumbnail: null,
      disable_content_type_detection: false,
    },
    caption: formattedText(),
  };
}

export function previewForUnsupported(kind: string | undefined): string {
  switch (kind) {
    case 'messagePhoto':
      return 'Фото';
    case 'messageVideo':
      return 'Видео';
    case 'messageVideoNote':
      return 'Видеосообщение';
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
