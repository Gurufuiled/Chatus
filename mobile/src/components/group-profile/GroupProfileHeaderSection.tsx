import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ProfileActionIcon } from '../ProfileActionIcon';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';
import { formatParticipantCount } from '../../utils/groupCallSystemMessage';

type GroupProfileHeaderSectionProps = {
  isOwner: boolean;
  isEditMode: boolean;
  saving: boolean;
  avatarUploading: boolean;
  avatarUrl: string | null;
  displayName: string;
  memberCountLabel: string;
  description: string;
  nameDraft: string;
  descriptionDraft: string;
  isMuted: boolean;
  isExpanded: boolean;
  expandedHeroWidth: number;
  expandedHeroHeight: number;
  moreButtonRef: React.RefObject<View | null>;
  moreWaveStyle: any;
  moreIconScale: RNAnimated.Value;
  onBackOrCancel: () => void;
  onPrimaryPress: () => void;
  onPickAvatar: () => void;
  onToggleHeroExpanded: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onToggleMute: () => void;
  onSearch: () => void;
  onOpenMoreMenu: () => void;
  onGroupVoicePress?: () => void;
  isUserInGroupCall?: boolean;
  hasActiveGroupCall?: boolean;
  activeGroupCallParticipantCount?: number | null;
};

const HERO_COLLAPSED_SIZE = 116;

export function GroupProfileHeaderSection({
  isOwner,
  isEditMode,
  saving,
  avatarUploading,
  avatarUrl,
  displayName,
  memberCountLabel,
  description,
  nameDraft,
  descriptionDraft,
  isMuted,
  isExpanded,
  expandedHeroWidth,
  expandedHeroHeight,
  moreButtonRef,
  moreWaveStyle,
  moreIconScale,
  onBackOrCancel,
  onPrimaryPress,
  onPickAvatar,
  onToggleHeroExpanded,
  onChangeName,
  onChangeDescription,
  onToggleMute,
  onSearch,
  onOpenMoreMenu,
  onGroupVoicePress,
  isUserInGroupCall = false,
  hasActiveGroupCall = false,
  activeGroupCallParticipantCount = null,
}: GroupProfileHeaderSectionProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createGroupProfileHeaderStyles(themeColors), [themeColors]);
  const progress = useSharedValue(isExpanded ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(isExpanded && !isEditMode ? 1 : 0, {
      damping: 22,
      stiffness: 185,
      mass: 0.94,
      overshootClamping: true,
    });
  }, [isEditMode, isExpanded, progress]);

  const heroGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isEditMode)
        .maxPointers(1)
        .activeOffsetY(8)
        .failOffsetX([-18, 18])
        .onEnd((event) => {
          if (isEditMode) return;

          if (!isExpanded && event.translationY > 34) {
            runOnJS(onToggleHeroExpanded)();
            return;
          }

          if (isExpanded && event.translationY < -28) {
            runOnJS(onToggleHeroExpanded)();
          }
        }),
    [isEditMode, isExpanded, onToggleHeroExpanded]
  );

  const avatarFrameStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [HERO_COLLAPSED_SIZE, expandedHeroWidth]),
    height: interpolate(progress.value, [0, 1], [HERO_COLLAPSED_SIZE, expandedHeroHeight]),
    borderRadius: interpolate(progress.value, [0, 1], [58, 30]),
    borderWidth: interpolate(progress.value, [0, 1], [2, 0]),
  }));

  return (
    <View>
      <View style={styles.topBarWrap}>
        <View style={styles.topBar}>
          <Pressable
            onPress={onBackOrCancel}
            style={({ pressed }) => [styles.pillButton, pressed && styles.cardPressed]}
          >
            <Text style={styles.pillButtonText}>{isEditMode ? 'Отмена' : 'Назад'}</Text>
          </Pressable>

          {isOwner ? (
            <Pressable
              onPress={onPrimaryPress}
              disabled={saving}
              style={({ pressed }) => [
                styles.pillButton,
                styles.primaryPillButton,
                pressed && !saving && styles.cardPressed,
                saving && styles.disabledButton,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={themeColors.textPrimary} />
              ) : (
                <Text style={[styles.pillButtonText, styles.primaryPillButtonText]}>
                  {isEditMode ? 'Готово' : 'Изм.'}
                </Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.topBarSpacer} />
          )}
        </View>
      </View>

      <View style={styles.heroCard}>
        <GestureDetector gesture={heroGesture}>
          <Pressable
            onPress={isEditMode ? onPickAvatar : onToggleHeroExpanded}
            disabled={avatarUploading}
            style={({ pressed }) => [styles.avatarPressable, pressed && styles.cardPressed]}
          >
            <Reanimated.View style={[styles.avatarFrame, avatarFrameStyle]}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarMedia}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>
                    {(displayName.trim()[0] || '?').toUpperCase()}
                  </Text>
                </View>
              )}
              {avatarUploading ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={themeColors.inputBackgroundSolid} />
                </View>
              ) : null}
            </Reanimated.View>
          </Pressable>
        </GestureDetector>

        {isEditMode ? (
          <Pressable
            onPress={onPickAvatar}
            style={({ pressed }) => [styles.changePhotoButton, pressed && styles.cardPressed]}
          >
            <Text style={styles.changePhotoText}>Выбрать фотографию</Text>
          </Pressable>
        ) : null}

        {isEditMode ? (
          <View style={styles.editCard}>
            <TextInput
              value={nameDraft}
              onChangeText={onChangeName}
              placeholder="Название группы"
              placeholderTextColor="#8E97A4"
              style={styles.nameInput}
            />
            <View style={styles.inputDivider} />
            <TextInput
              value={descriptionDraft}
              onChangeText={onChangeDescription}
              placeholder="Описание"
              placeholderTextColor="#8E97A4"
              style={styles.descriptionInput}
              multiline
            />
          </View>
        ) : (
          <>
            <View style={styles.heroTextSlot}>
              <View style={styles.heroTextWrap}>
                <Text style={styles.groupTitle} numberOfLines={2}>
                  {displayName}
                </Text>
                <Text style={styles.groupSubtitle} numberOfLines={1}>
                  {memberCountLabel}
                </Text>
              </View>
            </View>

            <View style={styles.actionsSlot}>
              <View style={styles.actionsRow}>
                {onGroupVoicePress ? (
                  <Pressable
                    onPress={onGroupVoicePress}
                    style={({ pressed }) => [
                      styles.actionButton,
                      isUserInGroupCall && styles.actionButtonActive,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <ProfileActionIcon
                      name="call"
                      size={20}
                      color={isUserInGroupCall ? '#FFFFFF' : themeColors.accent}
                    />
                    <Text
                      style={[
                        styles.actionButtonLabel,
                        isUserInGroupCall && styles.actionButtonLabelActive,
                      ]}
                    >
                      {isUserInGroupCall
                        ? 'Открыть'
                        : hasActiveGroupCall
                          ? 'Войти'
                          : 'Голос'}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={onToggleMute}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <ProfileActionIcon
                    name="sound"
                    size={20}
                    color={themeColors.accent}
                    active={isMuted}
                  />
                  <Text style={styles.actionButtonLabel}>Звук</Text>
                </Pressable>

                <Pressable
                  onPress={onSearch}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]}
                >
                  <ProfileActionIcon name="search" size={20} color={themeColors.accent} />
                  <Text style={styles.actionButtonLabel}>Поиск</Text>
                </Pressable>

                <Pressable
                  ref={moreButtonRef}
                  onPress={onOpenMoreMenu}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]}
                >
                  <View style={styles.actionButtonIconWrap}>
                    <RNAnimated.View
                      pointerEvents="none"
                      style={[styles.actionButtonWave, moreWaveStyle]}
                    />
                    <RNAnimated.View style={{ transform: [{ scale: moreIconScale }] }}>
                      <ProfileActionIcon name="more" size={20} color={themeColors.accent} />
                    </RNAnimated.View>
                  </View>
                  <Text style={styles.actionButtonLabel}>Ещё</Text>
                </Pressable>
              </View>
              {activeGroupCallParticipantCount && activeGroupCallParticipantCount > 0 ? (
                <Text style={styles.activeCallHint}>
                  {`Сейчас в звонке: ${formatParticipantCount(activeGroupCallParticipantCount)}`}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </View>

      {!isEditMode ? (
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionTitle}>Описание</Text>
          <Text style={styles.descriptionText}>{description || 'Пока без описания'}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createGroupProfileHeaderStyles(c: ThemeColors) {
  return StyleSheet.create({
  topBarWrap: {
    marginBottom: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarSpacer: {
    width: 84,
  },
  pillButton: {
    minWidth: 84,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.inputBackgroundSolid,
    shadowColor: '#9EAAC0',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryPillButton: {
    backgroundColor: c.inputBackgroundSolid,
  },
  pillButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textPrimary,
  },
  primaryPillButtonText: {
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.72,
  },
  heroCard: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 18,
  },
  avatarPressable: {
    width: '100%',
    alignItems: 'center',
  },
  avatarFrame: {
    width: HERO_COLLAPSED_SIZE,
    height: HERO_COLLAPSED_SIZE,
    borderRadius: 58,
    overflow: 'hidden',
    backgroundColor: withAlpha(c.accent, 0.12),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarMedia: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
  avatarFallbackText: {
    fontSize: 40,
    fontWeight: '800',
    color: c.inputBackgroundSolid,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.35)',
  },
  changePhotoButton: {
    marginTop: 12,
  },
  changePhotoText: {
    fontSize: 16,
    fontWeight: '500',
    color: c.accent,
  },
  heroTextSlot: {
    width: '100%',
    marginTop: 14,
  },
  heroTextWrap: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  groupTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: c.textPrimary,
    textAlign: 'center',
  },
  groupSubtitle: {
    marginTop: 4,
    fontSize: 16,
    color: c.textSecondary,
    textAlign: 'center',
  },
  actionsSlot: {
    width: '100%',
    marginTop: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 72,
    borderRadius: 20,
    backgroundColor: c.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.separator,
    shadowColor: '#A3AEC2',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actionButtonIconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 13,
  },
  actionButtonWave: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: withAlpha(c.accent, 0.82),
  },
  actionButtonLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: c.accent,
  },
  actionButtonActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  actionButtonLabelActive: {
    color: '#FFFFFF',
  },
  activeCallHint: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    color: c.textSecondary,
    paddingHorizontal: 8,
  },
  descriptionCard: {
    marginTop: 16,
    borderRadius: 24,
    backgroundColor: c.inputBackgroundSolid,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#A3AEC2',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  descriptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  descriptionText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: c.textPrimary,
  },
  editCard: {
    width: '100%',
    marginTop: 18,
    borderRadius: 24,
    backgroundColor: c.inputBackgroundSolid,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '600',
    color: c.textPrimary,
    paddingVertical: 8,
  },
  inputDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.separator,
  },
  descriptionInput: {
    minHeight: 72,
    paddingTop: 10,
    paddingBottom: 8,
    fontSize: 16,
    lineHeight: 22,
    color: c.textPrimary,
    textAlignVertical: 'top',
  },
  cardPressed: {
    opacity: 0.84,
  },
  });
}
