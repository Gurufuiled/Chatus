import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  Easing,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import type { MessageSource } from '../stores/types';
import { PlatformSourceIcon } from './PlatformSourceIcon';
import { useTheme } from '../contexts/ThemeContext';

export type SendChannelAnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface SendChannelSelectorProps {
  visible: boolean;
  currentChannel: MessageSource;
  onSelect: (channel: MessageSource) => void;
  /** Запрос закрытия (родитель ставит visible=false). */
  onDismiss: () => void;
  /** После анимации схлопывания в кнопку — очистка anchor и возврат фокуса в поле. */
  onClosed?: () => void;
  telegramAvailable: boolean;
  anchor?: SendChannelAnchorRect | null;
}

const GAP_ABOVE_SEND = 8;
/** Смещение вниз при схлопывании — в сторону кнопки «Отправить». */
const COLLAPSE_TRANSLATE_Y = 28;
const COLLAPSE_SCALE = 0.42;
const OPEN_DURATION_MS = 180;
const OPEN_EASING = Easing.out(Easing.cubic);
const CLOSE_DURATION_MS = 200;

export function SendChannelSelector({
  visible,
  currentChannel,
  onSelect,
  onDismiss,
  onClosed,
  telegramAvailable,
  anchor,
}: SendChannelSelectorProps) {
  const { colors: themeColors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const translateY = useSharedValue(COLLAPSE_TRANSLATE_Y);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(COLLAPSE_SCALE);
  const mountTimeRef = React.useRef(0);
  const [mounted, setMounted] = useState(visible);

  const finishClose = React.useCallback(() => {
    setMounted(false);
    onClosed?.();
  }, [onClosed]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      mountTimeRef.current = Date.now();
      translateY.value = COLLAPSE_TRANSLATE_Y;
      opacity.value = 0;
      scale.value = COLLAPSE_SCALE;
      translateY.value = withTiming(0, { duration: OPEN_DURATION_MS, easing: OPEN_EASING });
      opacity.value = withTiming(1, { duration: OPEN_DURATION_MS, easing: OPEN_EASING });
      scale.value = withTiming(1, { duration: OPEN_DURATION_MS, easing: OPEN_EASING });
      return;
    }
    if (!mounted) return;
    translateY.value = withTiming(COLLAPSE_TRANSLATE_Y, {
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
    });
    opacity.value = withTiming(0, { duration: CLOSE_DURATION_MS - 20, easing: Easing.in(Easing.quad) });
    scale.value = withTiming(COLLAPSE_SCALE, { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) {
        runOnJS(finishClose)();
      }
    });
  }, [visible, mounted, translateY, opacity, scale, finishClose]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }] as ViewStyle['transform'],
    opacity: opacity.value,
  }));

  if (!mounted) return null;

  const tryDismiss = () => {
    const elapsed = Date.now() - mountTimeRef.current;
    if (elapsed > 280) {
      onDismiss();
    }
  };

  const panelStyle: StyleProp<ViewStyle> = [
    styles.popover,
    {
      backgroundColor: themeColors.composerSurface,
      borderColor: themeColors.composerBorder,
    },
    animatedStyle,
  ];

  const anchoredPanelStyle: StyleProp<ViewStyle> = anchor
    ? {
        position: 'absolute',
        right: Math.max(10, windowWidth - anchor.x - anchor.width),
        bottom: Math.max(12, windowHeight - anchor.y + GAP_ABOVE_SEND),
      }
    : styles.anchorFallback;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Закрыть выбор канала"
        onPress={tryDismiss}
      />
      <View style={styles.anchorLayer} pointerEvents="box-none">
        <Reanimated.View style={[panelStyle, anchoredPanelStyle]}>
          <Text style={[styles.title, { color: themeColors.textPrimary }]}>
            Отправить через
          </Text>

          <Pressable
            style={[
              styles.option,
              { backgroundColor: themeColors.inputBackground },
              currentChannel === 'chatus' && styles.optionSelected,
            ]}
            onPress={() => {
              onSelect('chatus');
              onDismiss();
            }}
          >
            <PlatformSourceIcon source="chatus" size={24} style={styles.icon} />
            <Text
              style={[
                styles.optionText,
                { color: themeColors.textPrimary },
                currentChannel === 'chatus' && styles.optionTextSelected,
              ]}
            >
              Chatus
            </Text>
          </Pressable>

          {telegramAvailable ? (
            <Pressable
              style={[
                styles.option,
                { backgroundColor: themeColors.inputBackground },
                currentChannel === 'telegram' && styles.optionSelected,
              ]}
              onPress={() => {
                onSelect('telegram');
                onDismiss();
              }}
            >
              <PlatformSourceIcon source="telegram" size={24} style={styles.icon} />
              <Text
                style={[
                  styles.optionText,
                  { color: themeColors.textPrimary },
                  currentChannel === 'telegram' && styles.optionTextSelected,
                ]}
              >
                Telegram
              </Text>
            </Pressable>
          ) : null}
        </Reanimated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  anchorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  anchorFallback: {
    position: 'absolute',
    right: 14,
    bottom: 96,
  },
  popover: {
    minWidth: 220,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  optionSelected: {
    backgroundColor: 'rgba(52, 165, 228, 0.12)',
    borderColor: '#34A5E4',
    borderWidth: 1,
  },
  icon: {
    marginRight: 12,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#34A5E4',
    fontWeight: '600',
  },
});
