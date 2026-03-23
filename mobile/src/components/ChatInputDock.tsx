import React from 'react';
import Reanimated from 'react-native-reanimated';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { Message } from '../stores/types';
import { InputBar } from './InputBar';

type ChatInputDockProps = {
  onLayout: (event: LayoutChangeEvent) => void;
  animatedStyle: StyleProp<ViewStyle>;
  onSendText: (text: string) => void;
  onSendVoice: (result: { uri: string; waveform: number[]; durationMs: number }) => void | Promise<void>;
  onSendImage: (result: { uri: string; width?: number; height?: number; caption?: string }) => void | Promise<void>;
  onSendFile: (result: { uri: string; name: string; size: number; mimeType?: string }) => void | Promise<void>;
  replyToMessage: Message | null;
  replyAuthorName: string | null;
  onCancelReply: () => void;
};

export function ChatInputDock({
  onLayout,
  animatedStyle,
  onSendText,
  onSendVoice,
  onSendImage,
  onSendFile,
  replyToMessage,
  replyAuthorName,
  onCancelReply,
}: ChatInputDockProps) {
  return (
    <Reanimated.View onLayout={onLayout} style={animatedStyle}>
      <InputBar
        onSendText={onSendText}
        onSendVoice={onSendVoice}
        onSendImage={onSendImage}
        onSendFile={onSendFile}
        replyToMessage={replyToMessage}
        replyAuthorName={replyAuthorName}
        onCancelReply={onCancelReply}
      />
    </Reanimated.View>
  );
}
