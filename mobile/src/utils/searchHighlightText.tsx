import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/** Telegram-like in-bubble search highlight */
const SEARCH_MATCH_BG = '#E8D93A';
const SEARCH_MATCH_FG = '#000000';

/**
 * Returns children suitable for `<Text style={baseStyle}>…</Text>`: plain segments + nested `<Text>` for each match.
 * Case-insensitive; preserves original casing in each match slice.
 */
export function buildSearchHighlightChildren(
  raw: string,
  queryLower: string,
): React.ReactNode {
  const q = queryLower.trim();
  if (!q) return raw;

  const nodes: React.ReactNode[] = [];
  let rest = raw;
  let guard = 0;
  let key = 0;

  while (rest.length > 0 && guard < 400) {
    guard += 1;
    const lower = rest.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx < 0) {
      nodes.push(rest);
      break;
    }
    if (idx > 0) {
      nodes.push(rest.slice(0, idx));
    }
    const match = rest.slice(idx, idx + q.length);
    key += 1;
    nodes.push(
      <Text key={`h-${key}`} style={{ backgroundColor: SEARCH_MATCH_BG, color: SEARCH_MATCH_FG }}>
        {match}
      </Text>,
    );
    rest = rest.slice(idx + q.length);
  }

  return nodes;
}

export function renderTextWithSearchHighlight(
  raw: string,
  queryLower: string,
  baseStyle: StyleProp<TextStyle>,
): React.ReactElement {
  const q = queryLower.trim();
  if (!q) {
    return <Text style={baseStyle}>{raw}</Text>;
  }
  return <Text style={baseStyle}>{buildSearchHighlightChildren(raw, q)}</Text>;
}
