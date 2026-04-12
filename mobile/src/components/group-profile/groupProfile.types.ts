import type { Chat } from '../../stores/types';

export type GroupMember = NonNullable<Chat['members']>[number];
export type GroupMemberTagColor = 'blue' | 'green' | 'orange' | 'red';
export type GroupMemberTagOption = {
  key: GroupMemberTagColor;
  fill: string;
  bubble: string;
  text: string;
};

export type GroupMediaItem = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  previewUri?: string;
  durationMs?: number;
};

export type GroupFileItem = {
  id: string;
  title: string;
  extension: string;
  size: string;
  date: string;
  uri: string | null;
};

export type GroupVoiceItem = {
  id: string;
  kind: 'voice' | 'video_note';
  uri: string | null;
  thumbnailUri?: string;
  title?: string;
  durationMs: number;
  waveform: number[];
  dateLabel: string;
};
