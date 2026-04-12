import React from 'react';
import Svg, { Path } from 'react-native-svg';

export type TelegramGlyphFillRule = 'evenodd' | 'nonzero';

export type TelegramGlyphProps = {
  /** Android `pathData` string (commas allowed). */
  d: string;
  size?: number;
  color: string;
  fillRule?: TelegramGlyphFillRule;
  /** SVG viewBox, default Telegram 24dp assets use 72×72. */
  viewBox?: string;
};

/**
 * Renders a single-path glyph copied from Telegram Android `vector` drawables.
 * Default viewport matches `TMessagesProj/.../drawable/*_24.xml` (72×72).
 */
export function TelegramGlyph({
  d,
  size = 24,
  color,
  fillRule = 'nonzero',
  viewBox = '0 0 72 72',
}: TelegramGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox={viewBox}>
      <Path d={d} fill={color} fillRule={fillRule} />
    </Svg>
  );
}
