import React from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { ChatusStickerBubbleRow } from './ChatusStickerBubbleRow';
import { MessageTimeStatus } from './MessageTimeStatus';

const TELEGRAM_STICKER_SIZE = 176;
const META_ON_STICKER_COLOR = '#FFFFFF';
const META_ON_STICKER_ICON = 'rgba(255,255,255,0.95)';

/** Лёгкое появление исходящего стикера (фаза 4.2 журнала), в духе остального чата. */
const OUTGOING_STICKER_ENTERING = FadeIn.springify().damping(18).stiffness(240).mass(0.85);

export type StickerMessageBubbleProps = {
  rawContent: string;
  isMe: boolean;
  time: string;
  status: string;
  /** Игнорируется в режиме без пузыря (мета рисуется поверх стикера светлым). */
  timeColor?: string;
  iconColor?: string;
  stickerSize?: number;
  /** Автор / переслано над стикером */
  topHeader: React.ReactNode;
  replySnippet: React.ReactNode;
  reactions: React.ReactNode | null;
  /**
   * `false` — старый вид внутри пузыря (нужны `renderOutgoingShell` / `renderIncomingShell`).
   * `true` (по умолчанию) — как в Telegram: только картинка + время в углу, без бабла.
   */
  bubbleless?: boolean;
  renderOutgoingShell?: (body: React.ReactNode) => React.ReactNode;
  renderIncomingShell?: (body: React.ReactNode) => React.ReactNode;
  /**
   * Лёгкий `entering` только для исходящих: **отдельная** отправка стикера с пустым композером
   * (`Message.chatus_sticker_solo_send` в ленте). Превью меню / стикер при непустом черновике — без анимации.
   */
  playOutgoingEntrance?: boolean;
};

/**
 * Сообщение‑стикер Chatus: шапки, ответ, стикер + мета, реакции.
 * По умолчанию без пузыря (как в Telegram).
 */
export function StickerMessageBubble({
  rawContent,
  isMe,
  time,
  status,
  timeColor = META_ON_STICKER_COLOR,
  iconColor = META_ON_STICKER_ICON,
  stickerSize = TELEGRAM_STICKER_SIZE,
  topHeader,
  replySnippet,
  reactions,
  bubbleless = true,
  renderOutgoingShell,
  renderIncomingShell,
  playOutgoingEntrance = false,
}: StickerMessageBubbleProps) {
  const meta = (
    <MessageTimeStatus
      time={time}
      status={status}
      isMe={isMe}
      compact
      timeColor={bubbleless ? META_ON_STICKER_COLOR : timeColor}
      iconColor={bubbleless ? META_ON_STICKER_ICON : iconColor}
    />
  );

  if (bubbleless) {
    const body = (
      <>
        {topHeader}
        {replySnippet}
        <ChatusStickerBubbleRow
          layout="telegram"
          isMe={isMe}
          rawContent={rawContent}
          stickerSize={stickerSize}
        >
          {meta}
        </ChatusStickerBubbleRow>
        {reactions}
      </>
    );

    if (isMe && playOutgoingEntrance) {
      return (
        <Reanimated.View
          entering={OUTGOING_STICKER_ENTERING}
          style={[styles.bubblelessRoot, styles.bubblelessRootMe]}
        >
          {body}
        </Reanimated.View>
      );
    }

    if (isMe) {
      return (
        <View style={[styles.bubblelessRoot, styles.bubblelessRootMe]}>
          {body}
        </View>
      );
    }

    return (
      <View style={[styles.bubblelessRoot, styles.bubblelessRootOther]}>
        {body}
      </View>
    );
  }

  const body = (
    <>
      {topHeader}
      {replySnippet}
      <View style={styles.rowFallback}>
        <ChatusStickerBubbleRow layout="row" rawContent={rawContent} stickerSize={stickerSize}>
          {meta}
        </ChatusStickerBubbleRow>
      </View>
      {reactions}
    </>
  );

  if (!renderOutgoingShell || !renderIncomingShell) {
    if (isMe && playOutgoingEntrance) {
      return (
        <Reanimated.View
          entering={OUTGOING_STICKER_ENTERING}
          style={[styles.bubblelessRoot, styles.bubblelessRootMe]}
        >
          {body}
        </Reanimated.View>
      );
    }
    if (isMe) {
      return (
        <View style={[styles.bubblelessRoot, styles.bubblelessRootMe]}>
          {body}
        </View>
      );
    }
    return (
      <View style={[styles.bubblelessRoot, styles.bubblelessRootOther]}>
        {body}
      </View>
    );
  }

  return isMe ? renderOutgoingShell(body) : renderIncomingShell(body);
}

const styles = StyleSheet.create({
  bubblelessRoot: {
    maxWidth: 280,
    marginVertical: 2,
  },
  bubblelessRootMe: {
    alignSelf: 'flex-end',
  },
  bubblelessRootOther: {
    alignSelf: 'flex-start',
  },
  rowFallback: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
