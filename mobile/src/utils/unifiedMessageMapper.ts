import type { Message } from '../stores/types';

export function chatusToUnified(m: Message, myUserId: string): Message {
  return { ...m, source: 'chatus' } as any as Message;
}

export function telegramToUnified(m: any, myUserId: string): Message | null {
  let bodyText = '';
  let msgType = 'text';
  let media = undefined;
  let supported = false;

  if (m.content) {
      if (m.content['@type'] === 'messageText' && m.content.text) {
          bodyText = m.content.text.text;
          supported = typeof bodyText === 'string' && bodyText.length > 0;
      } else if (m.content['@type'] === 'messagePhoto') {
          supported = true;
          msgType = 'image';
          bodyText = m.content.caption?.text || '';
          const bestSize = m.content.photo?.sizes?.[m.content.photo.sizes.length - 1];
          media = [{
              local_path: bestSize?.photo?.local?.path || '',
              mime_type: 'image/jpeg',
              width: bestSize?.width,
              height: bestSize?.height,
          }];
      } else if (m.content['@type'] === 'messageVideo') {
          supported = true;
          msgType = 'video';
          bodyText = m.content.caption?.text || '';
          media = [{
              local_path: m.content.video?.video?.local?.path || '',
              mime_type: 'video/mp4',
              width: m.content.video?.width,
              height: m.content.video?.height,
          }];
      } else if (m.content['@type'] === 'messageDocument') {
          supported = true;
          msgType = 'file';
          bodyText = m.content.caption?.text || '';
          media = [{
              local_path: m.content.document?.document?.local?.path || '',
              mime_type: m.content.document?.mime_type || 'application/octet-stream',
              file_name: m.content.document?.file_name || 'document',
          }];
      } else if (m.content['@type'] === 'messageVoiceNote') {
          supported = true;
          msgType = 'voice';
          media = [{
              local_path: m.content.voice_note?.voice?.local?.path || '',
              duration_ms: (m.content.voice_note?.duration || 0) * 1000,
          }];
      } else if (m.content['@type'] === 'messageVideoNote') {
          supported = true;
          msgType = 'video_note';
          media = [{
              local_path: m.content.video_note?.video?.local?.path || '',
              thumbnail_path: m.content.video_note?.thumbnail?.file?.local?.path || '',
              duration_ms: (m.content.video_note?.duration || 0) * 1000,
              width: m.content.video_note?.length,
              height: m.content.video_note?.length,
              is_round: true,
          }];
      }
  }

  // Service messages, stickers and other unsupported Telegram payloads must not
  // turn into empty Chatus text bubbles.
  if (!supported) {
    return null;
  }

  const senderUserId =
    typeof m.sender_id?.user_id === 'number' || typeof m.sender_id?.user_id === 'string'
      ? String(m.sender_id.user_id)
      : '';
  const senderId = m.is_outgoing ? myUserId : senderUserId || `telegram:${String(m.chat_id ?? 'unknown')}`;

  return {
    id: `telegram:${m.id?.toString() || Math.random().toString()}`,
    chat_id: m.chat_id?.toString() || '',
    sender_id: senderId,
    created_at: (m.date || Date.now() / 1000) * 1000,
    msg_type: msgType,
    content: bodyText,
    media: media,
    status: 'delivered',
    is_edited: 0,
    is_deleted: 0,
    reply_to_id: null,
    transport: 'websocket',
    server_id: null,
    updated_at: (m.date || Date.now() / 1000) * 1000,
    source: 'telegram',
  } as any as Message;
}

export function mergeTimeline(chatusMessages: Message[], telegramMessages: Message[]): Message[] {
  const merged = [...chatusMessages, ...telegramMessages];
  merged.sort((a, b) => b.created_at - a.created_at);
  return merged;
}
