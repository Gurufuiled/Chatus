import type { Message } from '../stores/types';

export function chatusToUnified(m: Message, myUserId: string): Message {
  return { ...m, source: 'chatus' } as any as Message;
}

export function telegramToUnified(m: any, myUserId: string): Message {
  let bodyText = '';
  let msgType = 'text';
  let media = undefined;

  if (m.content) {
      if (m.content['@type'] === 'messageText' && m.content.text) {
          bodyText = m.content.text.text;
      } else if (m.content['@type'] === 'messagePhoto') {
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
          msgType = 'video';
          bodyText = m.content.caption?.text || '';
          media = [{
              local_path: m.content.video?.video?.local?.path || '',
              mime_type: 'video/mp4',
              width: m.content.video?.width,
              height: m.content.video?.height,
          }];
      } else if (m.content['@type'] === 'messageDocument') {
          msgType = 'file';
          bodyText = m.content.caption?.text || '';
          media = [{
              local_path: m.content.document?.document?.local?.path || '',
              mime_type: m.content.document?.mime_type || 'application/octet-stream',
              file_name: m.content.document?.file_name || 'document',
          }];
      } else if (m.content['@type'] === 'messageVoiceNote') {
          msgType = 'voice';
          media = [{
              local_path: m.content.voice_note?.voice?.local?.path || '',
              duration_ms: (m.content.voice_note?.duration || 0) * 1000,
          }];
      } else if (m.content['@type'] === 'messageSticker') {
          msgType = 'sticker';
          media = [{
              local_path: m.content.sticker?.sticker?.local?.path || '',
          }];
      }
  }

  return {
    id: m.id?.toString() || Math.random().toString(),
    chat_id: m.chat_id?.toString() || '',
    sender_id: m.sender_id?.user_id?.toString() || myUserId,
    created_at: (m.date || Date.now() / 1000) * 1000,
    msg_type: msgType,
    body: bodyText,
    media: media,
    status: 'delivered',
    is_outgoing: m.is_outgoing ? 1 : 0,
    source: 'telegram',
  } as any as Message;
}

export function mergeTimeline(chatusMessages: Message[], telegramMessages: Message[]): Message[] {
  const merged = [...chatusMessages, ...telegramMessages];
  merged.sort((a, b) => b.created_at - a.created_at);
  return merged;
}
