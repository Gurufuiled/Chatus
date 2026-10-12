import React, { useEffect, useRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import { registerMediaThumb, unregisterMediaThumb } from '../utils/mediaThumbRegistry';

type MediaThumbPressableProps = PressableProps & {
  /** id медиа: по нему вьювер фото находит эту миниатюру, чтобы «приземлиться» на неё. */
  thumbId: string;
};

/** `Pressable`, который регистрирует себя как миниатюру медиа в `mediaThumbRegistry`. */
export const MediaThumbPressable = React.memo(function MediaThumbPressable({
  thumbId,
  ...pressableProps
}: MediaThumbPressableProps) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    registerMediaThumb(thumbId, node);
    return () => unregisterMediaThumb(thumbId, node);
  }, [thumbId]);
  return <Pressable ref={ref} {...pressableProps} />;
});
