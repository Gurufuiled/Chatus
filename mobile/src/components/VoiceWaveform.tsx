/**
 * Дорожка голосового как в Telegram: тонкие столбики, прогресс закрашивает пройденную часть, по дорожке можно
 * перематывать пальцем (тап — перейти в точку, перетаскивание — «скраббинг» с отпусканием). Общая для пузыря
 * голосового в чате и строк вкладки «Голосовые» в профиле.
 *
 * Правила жестов: горизонтальное перетаскивание отдаёт дорожке приоритет над свайпом «ответить» (она
 * активируется на 8 px раньше), а вертикальное сразу отпускается списку — прокрутка не страдает.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  VOICE_BAR_WIDTH,
  buildVoiceBars,
  filledBarCount,
  voiceBarCountForWidth,
  voiceBarHeight,
  waveformRatioFromX,
} from '../utils/voiceWaveform';

export const VOICE_WAVEFORM_HEIGHT = 28;
/** Сдвиг пальца по горизонтали, после которого начинается перемотка. */
const SCRUB_ACTIVE_OFFSET_X = 8;
/** Вертикальный сдвиг, после которого жест уходит списку (прокрутка). */
const SCRUB_FAIL_OFFSET_Y = 12;

export interface VoiceWaveformProps {
  waveform: readonly number[];
  /** Ключ для «условной» дорожки, когда данных о громкости нет. */
  seed: string;
  durationMs: number;
  /** Прогресс воспроизведения 0..1. */
  progress: number;
  playedColor: string;
  unplayedColor: string;
  /** Перемотка отключена (голосовое ещё грузится). */
  disabled?: boolean;
  /** Тап или конец перетаскивания: перейти в долю дорожки 0..1. */
  onSeek?: (ratio: number) => void;
  /** Идёт перетаскивание: текущая доля; `null` — закончилось. Нужен, чтобы показать время под пальцем. */
  onScrub?: (ratio: number | null) => void;
  height?: number;
  testID?: string;
}

export const VoiceWaveform = React.memo(function VoiceWaveform({
  waveform,
  seed,
  durationMs,
  progress,
  playedColor,
  unplayedColor,
  disabled = false,
  onSeek,
  onScrub,
  height = VOICE_WAVEFORM_HEIGHT,
  testID,
}: VoiceWaveformProps) {
  const [width, setWidth] = useState(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const widthRef = useRef(0);
  const scrubRef = useRef<number | null>(null);

  const barCount = voiceBarCountForWidth(width);
  const barHeights = useMemo(
    () => buildVoiceBars(waveform, barCount, seed, durationMs).map((value) => voiceBarHeight(value)),
    [barCount, durationMs, seed, waveform],
  );

  const shownProgress = scrubRatio ?? progress;
  const filled = filledBarCount(shownProgress, barHeights.length);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== widthRef.current) {
      widthRef.current = next;
      setWidth(next);
    }
  }, []);

  const updateScrub = useCallback(
    (x: number) => {
      const ratio = waveformRatioFromX(x, widthRef.current);
      // перерисовываем только при смене столбика: палец движется чаще, чем меняется картинка
      const bars = Math.max(1, voiceBarCountForWidth(widthRef.current));
      const prev = scrubRef.current;
      if (prev != null && Math.ceil(prev * bars) === Math.ceil(ratio * bars) && ratio > 0 && ratio < 1) {
        scrubRef.current = ratio;
        return;
      }
      scrubRef.current = ratio;
      setScrubRatio(ratio);
      onScrub?.(ratio);
    },
    [onScrub],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(!disabled)
      .runOnJS(true)
      .activeOffsetX([-SCRUB_ACTIVE_OFFSET_X, SCRUB_ACTIVE_OFFSET_X])
      .failOffsetY([-SCRUB_FAIL_OFFSET_Y, SCRUB_FAIL_OFFSET_Y])
      .onStart((event) => updateScrub(event.x))
      .onUpdate((event) => updateScrub(event.x))
      .onEnd((event, success) => {
        if (!success) return;
        onSeek?.(waveformRatioFromX(event.x, widthRef.current));
      })
      .onFinalize(() => {
        scrubRef.current = null;
        setScrubRatio(null);
        onScrub?.(null);
      });

    const tap = Gesture.Tap()
      .enabled(!disabled)
      .runOnJS(true)
      .maxDuration(300)
      .onEnd((event, success) => {
        if (!success) return;
        onSeek?.(waveformRatioFromX(event.x, widthRef.current));
      });

    return Gesture.Exclusive(pan, tap);
  }, [disabled, onScrub, onSeek, updateScrub]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        onLayout={handleLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Дорожка голосового сообщения"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(shownProgress * 100) }}
        style={[styles.track, { height }]}
      >
        {barHeights.map((barHeight, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: index < filled ? playedColor : unplayedColor,
              },
            ]}
          />
        ))}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    overflow: 'hidden',
  },
  bar: {
    width: VOICE_BAR_WIDTH,
    borderRadius: VOICE_BAR_WIDTH / 2,
  },
});
