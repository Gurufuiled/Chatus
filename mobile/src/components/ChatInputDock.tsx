import React from 'react';
import Reanimated from 'react-native-reanimated';
import type { LayoutChangeEvent, StyleProp, ViewStyle, View } from 'react-native';
import type { Message } from '../stores/types';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import { InputBar } from './InputBar';

type ChatInputDockProps = {
  onLayout: (event: LayoutChangeEvent) => void;
  animatedStyle: StyleProp<ViewStyle>;
  onSendText: (text: string) => void;
  onSendVoice: (result: { uri: string; waveform: number[]; durationMs: number }) => void | Promise<void>;
  onSendVideoNote?: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onSendImage: (result: { uri: string; width?: number; height?: number; fileName?: string; mimeType?: string; caption?: string }) => void | Promise<void>;
  onSendFile: (result: { uri: string; name: string; size: number; mimeType?: string }) => void | Promise<void>;
  blurTargetRef?: React.RefObject<View | null>;
  replyToMessage: Message | null;
  replyAuthorName: string | null;
  onCancelReply: () => void;
};

export function ChatInputDock({
  onLayout,
  animatedStyle,
  onSendText,
  onSendVoice,
  onSendVideoNote,
  onSendImage,
  onSendFile,
  blurTargetRef,
  replyToMessage,
  replyAuthorName,
  onCancelReply,
}: ChatInputDockProps) {
  return (
    <Reanimated.View onLayout={onLayout} style={animatedStyle}>
      <InputBar
        onSendText={onSendText}
        onSendVoice={onSendVoice}
        onSendVideoNote={onSendVideoNote}
        onSendImage={onSendImage}
        onSendFile={onSendFile}
        blurTargetRef={blurTargetRef}
        replyToMessage={replyToMessage}
        replyAuthorName={replyAuthorName}
        onCancelReply={onCancelReply}
      />
    </Reanimated.View>
  );
}
