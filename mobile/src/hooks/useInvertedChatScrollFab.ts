import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const SHOW_THRESHOLD_PX = 140;
const HIDE_THRESHOLD_PX = 48;

function evaluateFabVisibility(
  offsetY: number,
  lastOffsetY: number,
  currentlyVisible: boolean
): boolean {
  if (currentlyVisible) {
    return offsetY > HIDE_THRESHOLD_PX;
  } else {
    const isScrollingDown = offsetY < lastOffsetY;
    return isScrollingDown && offsetY > SHOW_THRESHOLD_PX;
  }
}

export function useInvertedChatScrollFab<T>(
  listRef: React.RefObject<FlatList<T> | null>,
  resetKey?: string | number,
) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showRef = useRef(false);
  const lastOffsetYRef = useRef(0);
  const suppressFabShowRef = useRef(false);
  const keyboardScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyVisibility = useCallback((offsetY: number) => {
    const prevOffsetY = lastOffsetYRef.current;
    lastOffsetYRef.current = offsetY;
    if (offsetY <= HIDE_THRESHOLD_PX) {
      suppressFabShowRef.current = false;
    }
    let nextVisible = evaluateFabVisibility(offsetY, prevOffsetY, showRef.current);
    if (suppressFabShowRef.current && nextVisible) {
      nextVisible = false;
    }
    if (nextVisible === showRef.current) return;
    showRef.current = nextVisible;
    setShowScrollToBottom(nextVisible);
  }, []);

  useEffect(() => {
    showRef.current = false;
    lastOffsetYRef.current = 0;
    suppressFabShowRef.current = false;
    if (keyboardScrollTimerRef.current != null) {
      clearTimeout(keyboardScrollTimerRef.current);
      keyboardScrollTimerRef.current = null;
    }
    setShowScrollToBottom(false);
  }, [resetKey]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    applyVisibility(event.nativeEvent.contentOffset.y);
  }, [applyVisibility]);

  const recheckFabVisibility = useCallback(() => {
    applyVisibility(lastOffsetYRef.current);
  }, [applyVisibility]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY <= HIDE_THRESHOLD_PX) {
      suppressFabShowRef.current = false;
    }
    applyVisibility(offsetY);
  }, [applyVisibility]);

  const scrollToBottom = useCallback(() => {
    suppressFabShowRef.current = true;
    showRef.current = false;
    setShowScrollToBottom(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [listRef]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      if (lastOffsetYRef.current > HIDE_THRESHOLD_PX) return;
      if (keyboardScrollTimerRef.current != null) {
        clearTimeout(keyboardScrollTimerRef.current);
      }
      keyboardScrollTimerRef.current = setTimeout(() => {
        keyboardScrollTimerRef.current = null;
        scrollToBottom();
      }, 80);
    });
    return () => {
      sub.remove();
      if (keyboardScrollTimerRef.current != null) {
        clearTimeout(keyboardScrollTimerRef.current);
        keyboardScrollTimerRef.current = null;
      }
    };
  }, [scrollToBottom]);

  return {
    showScrollToBottom,
    handleScroll,
    handleScrollEnd,
    recheckFabVisibility,
    scrollToBottom,
  };
}
