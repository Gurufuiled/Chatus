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

  const applyVisibility = useCallback((offsetY: number) => {
    const prevOffsetY = lastOffsetYRef.current;
    lastOffsetYRef.current = offsetY;
    const nextVisible = evaluateFabVisibility(offsetY, prevOffsetY, showRef.current);
    if (nextVisible === showRef.current) return;
    showRef.current = nextVisible;
    setShowScrollToBottom(nextVisible);
  }, []);

  useEffect(() => {
    showRef.current = false;
    lastOffsetYRef.current = 0;
    setShowScrollToBottom(false);
  }, [resetKey]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    applyVisibility(event.nativeEvent.contentOffset.y);
  }, [applyVisibility]);

  const recheckFabVisibility = useCallback(() => {
    applyVisibility(lastOffsetYRef.current);
  }, [applyVisibility]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    applyVisibility(event.nativeEvent.contentOffset.y);
  }, [applyVisibility]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    requestAnimationFrame(() => {
      applyVisibility(0);
    });
  }, [applyVisibility, listRef]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        scrollToBottom();
      }, 80);
    });
    return () => {
      sub.remove();
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
