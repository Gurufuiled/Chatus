import React from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Reanimated from 'react-native-reanimated';
import type { HeroDismiss } from '../hooks/useHeroDismiss';

/**
 * Летящая рамка с фото для `useHeroDismiss`: при закрытии/открытии сужается до миниатюры с
 * обрезкой по краям (`cover`), поэтому не вылезает за границы плитки. Кладётся поверх контента вьювера.
 */
export function HeroOverlay({ hero }: { hero: Pick<HeroDismiss, 'frameStyle' | 'overlayUri' | 'overlayFit'> }) {
  if (!hero.overlayUri) return null;
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.frame, hero.frameStyle]}
    >
      <Image
        source={{ uri: hero.overlayUri }}
        style={StyleSheet.absoluteFill}
        contentFit={hero.overlayFit}
        cachePolicy="memory-disk"
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
