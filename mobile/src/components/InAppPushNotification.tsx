import React, { useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { uiStore } from '../stores/uiStore';
import { colors, withAlpha } from '../theme/colors';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { RootStackParamList } from '../navigation/types';

export function InAppPushNotification() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  
  const pushNotification = uiStore((state) => state.pushNotification);
  const dismissPushNotification = uiStore((state) => state.dismissPushNotification);
  
  const translateY = useRef(new Animated.Value(-150)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  const [activeNotification, setActiveNotification] = React.useState(pushNotification);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pushNotification) {
      setActiveNotification(pushNotification);
      
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: insets.top + 10,
          useNativeDriver: true,
          speed: 12,
          bounciness: 6,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        closeNotification();
      }, 3000);
    } else if (activeNotification) {
      closeNotification();
    }
  }, [pushNotification]);

  const closeNotification = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -150,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissPushNotification();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          translateY.setValue(insets.top + 10 + gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20 || gestureState.vy < -0.5) {
          closeNotification();
        } else {
          Animated.spring(translateY, {
            toValue: insets.top + 10,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!activeNotification) return null;

  const handlePress = () => {
    closeNotification();
    navigation.navigate('Chat', {
      chatId: activeNotification.chatId,
      chatTitle: activeNotification.title,
    });
  };

  const renderIcon = () => {
    switch (activeNotification.messageType) {
      case 'voice':
        return <MaterialCommunityIcons name="microphone" size={16} color={colors.accent} style={styles.typeIcon} />;
      case 'video_note':
      case 'video':
        return <MaterialCommunityIcons name="video" size={16} color={colors.accent} style={styles.typeIcon} />;
      case 'image':
        return <MaterialCommunityIcons name="image" size={16} color={colors.accent} style={styles.typeIcon} />;
      case 'file':
        return <MaterialCommunityIcons name="file-document" size={16} color={colors.accent} style={styles.typeIcon} />;
      default:
        return null;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable onPress={handlePress} style={styles.card}>
        {activeNotification.avatarUrl ? (
          <Image
            source={{ uri: activeNotification.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {(activeNotification.title[0] || '?').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>
            {activeNotification.title}
          </Text>
          <View style={styles.messageRow}>
            {renderIcon()}
            <Text style={styles.message} numberOfLines={1}>
              {activeNotification.messagePreview}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    zIndex: 99999,
  },
  card: {
    backgroundColor: colors.inputBackgroundSolid,
    borderRadius: 20,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: withAlpha(colors.separator, 0.4),
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.separator,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIcon: {
    marginRight: 4,
  },
  message: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
