import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveAvatarUrl } from '../config';

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
};

const AVATAR = 15;
const AVATAR_OVERLAP = 6;

export function MessageReactionInline({
  reactions,
  isMe,
  allowReactions,
  onToggle,
}: MessageReactionInlineProps) {
  if (!reactions.length) return null;

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          accessibilityRole="button"
          accessibilityLabel={`Реакция ${r.emoji}`}
          disabled={!allowReactions}
          onPress={() => allowReactions && onToggle(r.emoji)}
          style={({ pressed }) => [
            styles.chip,
            isMe ? styles.chipPaletteMe : styles.chipPaletteOther,
            r.reacted_by_me && (isMe ? styles.chipMineOnMe : styles.chipMineOnOther),
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
                    isMe ? styles.avatarRingMe : styles.avatarRingOther,
                  ]}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, isMe ? styles.avatarFallbackMe : null]} />
                  )}
                </View>
              );
            })}
          </View>
          {r.count > (r.reactors?.length ?? 0) ||
          (!(r.reactors?.length ?? 0) && r.count > 1) ? (
            <Text style={[styles.count, isMe && styles.countMe]}>{r.count}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    paddingRight: 2,
    maxWidth: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: 7,
    paddingRight: 8,
    borderRadius: 14,
    gap: 3,
    maxWidth: '100%',
  },
  chipPaletteMe: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  chipPaletteOther: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  chipMineOnMe: {
    backgroundColor: 'rgba(167, 139, 250, 0.52)',
  },
  chipMineOnOther: {
    backgroundColor: 'rgba(139, 92, 246, 0.34)',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 1,
  },
  avatarRing: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: (AVATAR + 2) / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingMe: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  avatarRingOther: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
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
    backgroundColor: 'rgba(120,126,138,0.35)',
  },
  avatarFallbackMe: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.58)',
    marginLeft: 2,
    minWidth: 10,
  },
  countMe: {
    color: 'rgba(255,255,255,0.82)',
  },
});
