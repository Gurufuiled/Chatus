import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { withAlpha } from '../theme/stylePrimitives';

const DANGER = '#FF453A';
const CANCEL_GREEN = '#34C759';

type Props = {
  visible: boolean;
  peerName: string;
  onClose: () => void;
  onConfirmBlock: () => void;
};

export function ChatProfileBlockSheet({
  visible,
  peerName,
  onClose,
  onConfirmBlock,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, resolvedScheme } = useTheme();
  const slide = useRef(new Animated.Value(0)).current;

  const sheetBg = colors.inputBackgroundSolid;
  const captionColor = colors.textSecondary;
  const backdropTone = resolvedScheme === 'dark' ? withAlpha('#000000', 0.45) : withAlpha('#0F172A', 0.35);

  const padBottom = Math.max(insets.bottom, 12) + 8;

  useEffect(() => {
    if (!visible) {
      slide.setValue(0);
      return;
    }
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide, visible]);

  const slideDistance = useMemo(
    () => Math.max(320, Dimensions.get('window').height * 0.42),
    [],
  );

  const sheetTranslate = useMemo(
    () =>
      slide.interpolate({
        inputRange: [0, 1],
        outputRange: [slideDistance, 0],
      }),
    [slide, slideDistance],
  );

  const backdropOpacity = useMemo(
    () =>
      slide.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [slide],
  );

  const handleRequestClose = () => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleRequestClose}>
      <View style={styles.modalRoot}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity, backgroundColor: backdropTone }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetWrap,
            {
              paddingBottom: padBottom,
              transform: [{ translateY: sheetTranslate }],
            },
          ]}
        >
          <View style={[styles.card, { backgroundColor: sheetBg, borderColor: colors.separator }]}>
            <Text style={[styles.caption, { color: captionColor }]}>
              Запретить {peerName} писать Вам сообщения и звонить через приложение?
            </Text>
            <Pressable
              onPress={() => {
                onConfirmBlock();
                handleRequestClose();
              }}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.primaryBtnText, { color: DANGER }]}>Заблокировать {peerName}</Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: sheetBg, borderColor: colors.separator }]}>
            <Pressable
              onPress={handleRequestClose}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.cancelBtnText, { color: CANCEL_GREEN }]}>Отмена</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  sheetWrap: {
    paddingHorizontal: 10,
    gap: 10,
    zIndex: 1,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  caption: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  primaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
