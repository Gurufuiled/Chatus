import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Reanimated, {
  FadeInDown,
  LinearTransition,
} from "react-native-reanimated";
import { resolveAvatarUrl } from "../config";
import { withAlpha } from "../theme/colors";

/** Появление строки реакций + плавное расширение при новых эмодзи/счётчиках (как в Telegram). */
const REACTION_ROW_ENTERING = FadeInDown.springify()
  .damping(17)
  .stiffness(255)
  .mass(0.88);
const REACTION_ROW_LAYOUT = LinearTransition.springify()
  .damping(18)
  .stiffness(235);

export type InlineReactionItem = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  reactors?: { user_id: string; avatar_url: string | null }[];
};

type MessageReactionInlineProps = {
  reactions: InlineReactionItem[];
  isMe: boolean;
  allowReactions: boolean;
  onToggle: (emoji: string) => void;
  /** Компактные «таблетки» снизу справа (голос / кружок), как в Telegram */
  variant?: "default" | "floatingTail";
  accentColor?: string;
};

const AVATAR = 15;
const AVATAR_OVERLAP = 6;

export function MessageReactionInline({
  reactions,
  isMe,
  allowReactions,
  onToggle,
  variant = "default",
  accentColor,
}: MessageReactionInlineProps) {
  if (!reactions.length) return null;

  const isTail = variant === "floatingTail";

  return (
    <Reanimated.View
      style={[styles.row, isTail && styles.rowFloatingTail]}
      entering={REACTION_ROW_ENTERING}
      layout={REACTION_ROW_LAYOUT}
    >
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          accessibilityRole="button"
          accessibilityLabel={`Реакция ${r.emoji}`}
          disabled={!allowReactions}
          onPress={() => allowReactions && onToggle(r.emoji)}
          style={({ pressed }) => [
            styles.chip,
            isTail
              ? styles.chipFloatingTail
              : isMe
                ? styles.chipPaletteMe
                : styles.chipPaletteOther,
            !isTail &&
              r.reacted_by_me &&
              (accentColor
                ? {
                    backgroundColor: withAlpha(accentColor, isMe ? 0.52 : 0.34),
                  }
                : isMe
                  ? styles.chipMineOnMe
                  : styles.chipMineOnOther),
            isTail &&
              r.reacted_by_me &&
              (accentColor
                ? {
                    backgroundColor: withAlpha(accentColor, isMe ? 0.88 : 0.42),
                    borderColor: withAlpha(accentColor, 0.22),
                  }
                : isMe
                  ? styles.chipMineTailOnMe
                  : styles.chipMineTailOnOther),
            pressed && allowReactions && styles.chipPressed,
            !allowReactions && styles.chipDisabled,
          ]}
        >
          <Text style={styles.emoji}>{r.emoji}</Text>
          <View style={styles.avatarStack}>
            {(r.reactors ?? []).slice(0, 3).map((u, index) => {
              const uri = resolveAvatarUrl(u.avatar_url);
              return (
                <View
                  key={`${r.emoji}-${u.user_id}`}
                  style={[
                    styles.avatarRing,
                    index > 0 && { marginLeft: -AVATAR_OVERLAP },
                    isTail
                      ? styles.avatarRingTail
                      : isMe
                        ? styles.avatarRingMe
                        : styles.avatarRingOther,
                  ]}
                >
                  {uri ? (
                    <Image
                      source={{ uri }}
                      cachePolicy="disk"
                      style={styles.avatarImg}
                    />
                  ) : (
                    <View
                      style={[
                        styles.avatarFallback,
                        isMe ? styles.avatarFallbackMe : null,
                      ]}
                    />
                  )}
                </View>
              );
            })}
          </View>
          {r.count > (r.reactors?.length ?? 0) ||
          (!(r.reactors?.length ?? 0) && r.count > 1) ? (
            <Text
              style={[
                styles.count,
                isTail
                  ? r.reacted_by_me && isMe
                    ? styles.countMe
                    : styles.countTail
                  : isMe && styles.countMe,
              ]}
            >
              {r.count}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingRight: 2,
    maxWidth: "100%",
  },
  rowFloatingTail: {
    marginTop: 0,
    justifyContent: "flex-end",
    alignSelf: "flex-end",
    maxWidth: "92%",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    paddingLeft: 7,
    paddingRight: 8,
    borderRadius: 14,
    gap: 3,
    maxWidth: "100%",
  },
  chipPaletteMe: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  chipPaletteOther: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  chipMineOnMe: {
    backgroundColor: "rgba(167, 139, 250, 0.52)",
  },
  chipMineOnOther: {
    backgroundColor: "rgba(139, 92, 246, 0.34)",
  },
  chipFloatingTail: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipMineTailOnMe: {
    backgroundColor: "rgba(167, 139, 250, 0.88)",
    borderColor: "rgba(91, 33, 182, 0.22)",
  },
  chipMineTailOnOther: {
    backgroundColor: "rgba(139, 92, 246, 0.42)",
    borderColor: "rgba(91, 33, 182, 0.18)",
  },
  chipPressed: {
    opacity: 0.82,
  },
  chipDisabled: {
    opacity: 0.92,
  },
  emoji: {
    fontSize: 14,
    lineHeight: 17,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 1,
  },
  avatarRing: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: (AVATAR + 2) / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRingMe: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.55)",
  },
  avatarRingOther: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
  },
  avatarRingTail: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.12)",
  },
  avatarImg: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: "rgba(120,126,138,0.35)",
  },
  avatarFallbackMe: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  count: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(17,24,39,0.58)",
    marginLeft: 2,
    minWidth: 10,
  },
  countMe: {
    color: "rgba(255,255,255,0.82)",
  },
  countTail: {
    color: "rgba(17,24,39,0.62)",
  },
});
