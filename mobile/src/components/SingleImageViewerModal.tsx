import React, { useCallback } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeroDismiss } from '../hooks/useHeroDismiss';
import { HeroOverlay } from './HeroOverlay';
import { measureThumbRef, type MeasurableThumb } from '../utils/mediaThumbRegistry';
import type { Size } from '../utils/heroDismissCore';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

type SingleImageViewerModalProps = {
  visible: boolean;
  uri: string;
  /** Миниатюра, на которую «садится» фото при закрытии. */
  sourceRef: React.RefObject<MeasurableThumb | null>;
  /** Натуральный размер фото, если известен (точнее посадка). */
  imageSize?: Size | null;
  onClose: () => void;
};

/**
 * Полноэкранный просмотр одного фото: тянем вверх/вниз — фото возвращается на своё место
 * в сообщении (как в Telegram). Тап по фону/кнопке закрывает с той же анимацией.
 */
export const SingleImageViewerModal = React.memo(function SingleImageViewerModal({
  visible,
  uri,
  sourceRef,
  imageSize,
  onClose,
}: SingleImageViewerModalProps) {
  const insets = useSafeAreaInsets();
  const getSourceRect = useCallback(() => measureThumbRef(sourceRef.current), [sourceRef]);
  const getImageSize = useCallback(() => imageSize ?? null, [imageSize]);
  const getHeroImageUri = useCallback(() => uri || null, [uri]);
  const hero = useHeroDismiss({
    visible,
    getSourceRect,
    getHeroImageUri,
    getImageSize,
    onDismiss: onClose,
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={hero.requestClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdropFill, hero.backdropStyle]}
        />
        <GestureDetector gesture={hero.gesture}>
          <Reanimated.View style={[styles.content, hero.contentStyle]}>
            <Pressable
              style={styles.content}
              onPress={hero.requestClose}
              accessibilityRole="button"
              accessibilityLabel="Закрыть фото"
            >
              <Image
                source={{ uri }}
                style={styles.image}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </Pressable>
          </Reanimated.View>
        </GestureDetector>

        <HeroOverlay hero={hero} />

        <Reanimated.View
          style={[StyleSheet.absoluteFill, hero.chromeStyle]}
          pointerEvents="box-none"
        >
          <View style={[styles.topBar, { top: insets.top + 10 }]} pointerEvents="box-none">
            <Pressable
              onPress={hero.requestClose}
              style={styles.closeButton}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdropFill: { backgroundColor: '#000000' },
  content: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topBar: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
});
