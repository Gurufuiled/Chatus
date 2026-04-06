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
  uri: string;
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
  uri: string | null;
  duration: string;
  date: string;
  durationMs: number;
  waveform: number[];
  dateLabel: string;
};
