import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme/colors';

export type ProfileActionIconName = 'call' | 'sound' | 'search' | 'more';

type ProfileActionIconProps = {
  name: ProfileActionIconName;
  size?: number;
  color?: string;
  active?: boolean;
};

export function ProfileActionIcon({
  name,
  size = 20,
  color = colors.accent,
  active = false,
}: ProfileActionIconProps) {
  const strokeWidth = size >= 20 ? 1.9 : 1.8;

  switch (name) {
    case 'call':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M7.35 5.36C7.73 4.99 8.35 5 8.71 5.37L10.45 7.15C10.8 7.5 10.84 8.05 10.54 8.46L9.74 9.52C9.61 9.69 9.58 9.92 9.66 10.11C10.34 11.72 11.66 13.04 13.27 13.72C13.46 13.8 13.69 13.77 13.86 13.64L14.91 12.84C15.33 12.54 15.88 12.58 16.23 12.93L18.01 14.67C18.38 15.03 18.39 15.65 18.02 16.03L16.84 17.22C16.24 17.82 15.36 18.05 14.55 17.84C9.97 16.64 6.38 13.05 5.18 8.47C4.97 7.66 5.2 6.78 5.8 6.18L7.35 5.36Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'sound':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 4.75C9.93 4.75 8.25 6.43 8.25 8.5V10.24C8.25 11.12 7.96 11.98 7.42 12.68L6.42 13.97C5.91 14.64 6.39 15.63 7.22 15.63H16.78C17.61 15.63 18.09 14.64 17.58 13.97L16.58 12.68C16.04 11.98 15.75 11.12 15.75 10.24V8.5C15.75 6.43 14.07 4.75 12 4.75Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M10.58 18C10.85 18.82 11.36 19.25 12 19.25C12.64 19.25 13.15 18.82 13.42 18"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {active ? (
            <Path
              d="M7.25 6.75L16.75 16.25"
              stroke={color}
              strokeWidth={strokeWidth + 0.15}
              strokeLinecap="round"
            />
          ) : null}
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle
            cx="10.75"
            cy="10.75"
            r="5.25"
            stroke={color}
            strokeWidth={strokeWidth}
          />
          <Path
            d="M14.6 14.6L18.5 18.5"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="6.5" cy="12" r="1.9" fill={color} />
          <Circle cx="12" cy="12" r="1.9" fill={color} />
          <Circle cx="17.5" cy="12" r="1.9" fill={color} />
        </Svg>
      );
    default:
      return null;
  }
}
