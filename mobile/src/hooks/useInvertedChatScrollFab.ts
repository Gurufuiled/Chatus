import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const SHOW_THRESHOLD_PX = 140;
const HIDE_THRESHOLD_PX = 48;

function evaluateFabVisibility(offsetY: number, currentlyVisible: boolean): boolean {
  return offsetY > (currentlyVisible ? HIDE_THRESHOLD_PX : SHOW_THRESHOLD_PX);
}

export function useInvertedChatScrollFab<T>(
  listRef: React.RefObject<FlatList<T> | null>,
  resetKey?: string | number,
) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showRef = useRef(false);
  const lastOffsetYRef = useRef(0);

  const applyVisibility = useCallback((offsetY: number) => {
    lastOffsetYRef.current = offsetY;
    const nextVisible = evaluateFabVisibility(offsetY, showRef.current);
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

  return {
    showScrollToBottom,
    handleScroll,
    handleScrollEnd,
    recheckFabVisibility,
    scrollToBottom,
  };
}
