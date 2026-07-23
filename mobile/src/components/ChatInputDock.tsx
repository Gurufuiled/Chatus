import type { MessageSource } from '../stores/types';
import React from 'react';
import Reanimated from 'react-native-reanimated';
import type { LayoutChangeEvent, StyleProp, ViewStyle, View } from 'react-native';
import type { Message } from '../stores/types';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import {
  InputBar,
  type FilePickResult,
  type MediaAlbumPickResult,
  type MediaPickResult,
} from './InputBar';
import type { SendChannelAnchorRect } from './SendChannelSelector';

type ChatInputDockProps = {
  telegramAvailable?: boolean;
  sendChannel?: MessageSource;
  onSendChannelChange?: (channel: MessageSource) => void;
  onSendChannelMenuOpen?: (anchor: SendChannelAnchorRect) => void;
  onSendChannelMenuDismiss?: () => void;
  composerFocusRef?: React.MutableRefObject<(() => void) | null>;
  onLayout: (event: LayoutChangeEvent) => void;
  animatedStyle: StyleProp<ViewStyle>;
  placeholder?: string;
  onSendText: (text: string, sendOptions?: { chatusStickerSoloSend?: boolean }) => void;
  onSendVoice: (result: { uri: string; waveform: number[]; durationMs: number }) => void | Promise<void>;
  onSendVideoNote?: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onSendMedia: (result: MediaPickResult) => void | Promise<void>;
  onSendMediaAlbum?: (result: MediaAlbumPickResult) => void | Promise<void>;
  onSendFile: (result: FilePickResult) => void | Promise<void>;
  blurTargetRef?: React.RefObject<View | null>;
  replyToMessage: Message | null;
  replyAuthorName: string | null;
  onCancelReply: () => void;
  isScreenFocused?: boolean;
  textRestriction?: string | null;
  voiceRestriction?: string | null;
  mediaRestriction?: string | null;
  commentCooldownEndsAt?: number | null;
  onCommentCooldownClear?: () => void;
  replyPeerFirstLineId?: string | null;
  chatusStickersComposer?: boolean;
  onVoiceActiveChange?: (isActive: boolean) => void;
};

export function ChatInputDock({
  telegramAvailable,
  sendChannel,
  onSendChannelChange,
  onSendChannelMenuOpen,
  onSendChannelMenuDismiss,
  composerFocusRef,
  onLayout,
  animatedStyle,
  placeholder,
  onSendText,
  onSendVoice,
  onSendVideoNote,
  onSendMedia,
  onSendMediaAlbum,
  onSendFile,
  blurTargetRef,
  replyToMessage,
  replyAuthorName,
  onCancelReply,
  isScreenFocused = true,
  textRestriction = null,
  voiceRestriction = null,
  mediaRestriction = null,
  commentCooldownEndsAt = null,
  onCommentCooldownClear,
  replyPeerFirstLineId = null,
  chatusStickersComposer,
  onVoiceActiveChange,
}: ChatInputDockProps) {
  return (
    <Reanimated.View
      pointerEvents="box-none"
      style={[animatedStyle, { overflow: 'visible', height: 220, justifyContent: 'flex-end' }]}
    >
      <Reanimated.View onLayout={onLayout} style={{ width: '100%', overflow: 'visible' }}>
        <InputBar
          telegramAvailable={telegramAvailable}
          sendChannel={sendChannel as any}
          onSendChannelChange={onSendChannelChange as any}
          onSendChannelMenuOpen={onSendChannelMenuOpen}
          onSendChannelMenuDismiss={onSendChannelMenuDismiss}
          composerFocusRef={composerFocusRef}
          placeholder={placeholder}
          onSendText={onSendText}
          onSendVoice={onSendVoice}
          onSendVideoNote={onSendVideoNote}
          onSendMedia={onSendMedia}
          onSendMediaAlbum={onSendMediaAlbum}
          onSendFile={onSendFile}
          blurTargetRef={blurTargetRef}
          replyToMessage={replyToMessage}
          replyAuthorName={replyAuthorName}
          onCancelReply={onCancelReply}
          isScreenFocused={isScreenFocused}
          textRestriction={textRestriction}
          voiceRestriction={voiceRestriction}
          mediaRestriction={mediaRestriction}
          commentCooldownEndsAt={commentCooldownEndsAt}
          onCommentCooldownClear={onCommentCooldownClear}
          replyPeerFirstLineId={replyPeerFirstLineId}
          chatusStickersComposer={chatusStickersComposer}
          onVoiceActiveChange={onVoiceActiveChange}
        />
      </Reanimated.View>
    </Reanimated.View>
  );
}
