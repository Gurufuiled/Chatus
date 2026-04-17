import React from 'react';
import Reanimated from 'react-native-reanimated';
import type { LayoutChangeEvent, StyleProp, ViewStyle, View } from 'react-native';
import type { Message } from '../stores/types';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import { InputBar, type FilePickResult, type MediaPickResult } from './InputBar';

type ChatInputDockProps = {
  onLayout: (event: LayoutChangeEvent) => void;
  animatedStyle: StyleProp<ViewStyle>;
  placeholder?: string;
  onSendText: (text: string) => void;
  onSendVoice: (result: { uri: string; waveform: number[]; durationMs: number }) => void | Promise<void>;
  onSendVideoNote?: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onSendMedia: (result: MediaPickResult) => void | Promise<void>;
  onSendFile: (result: FilePickResult) => void | Promise<void>;
  blurTargetRef?: React.RefObject<View | null>;
  replyToMessage: Message | null;
  replyAuthorName: string | null;
  onCancelReply: () => void;
  isScreenFocused?: boolean;
  voiceRestriction?: string | null;
  mediaRestriction?: string | null;
  commentCooldownEndsAt?: number | null;
  onCommentCooldownClear?: () => void;
};

export function ChatInputDock({
  onLayout,
  animatedStyle,
  placeholder,
  onSendText,
  onSendVoice,
  onSendVideoNote,
  onSendMedia,
  onSendFile,
  blurTargetRef,
  replyToMessage,
  replyAuthorName,
  onCancelReply,
  isScreenFocused = true,
  voiceRestriction = null,
  mediaRestriction = null,
  commentCooldownEndsAt = null,
  onCommentCooldownClear,
}: ChatInputDockProps) {
  return (
    <Reanimated.View onLayout={onLayout} style={[animatedStyle, { overflow: 'visible' }]}>
      <InputBar
        placeholder={placeholder}
        onSendText={onSendText}
        onSendVoice={onSendVoice}
        onSendVideoNote={onSendVideoNote}
        onSendMedia={onSendMedia}
        onSendFile={onSendFile}
        blurTargetRef={blurTargetRef}
        replyToMessage={replyToMessage}
        replyAuthorName={replyAuthorName}
        onCancelReply={onCancelReply}
        isScreenFocused={isScreenFocused}
        voiceRestriction={voiceRestriction}
        mediaRestriction={mediaRestriction}
        commentCooldownEndsAt={commentCooldownEndsAt}
        onCommentCooldownClear={onCommentCooldownClear}
      />
    </Reanimated.View>
  );
}
