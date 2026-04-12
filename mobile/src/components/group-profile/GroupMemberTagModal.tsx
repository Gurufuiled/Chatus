import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { resolveAvatarUrl } from '../../config';
import { colors } from '../../theme/colors';
import {
  getGroupMemberTagOption,
  GROUP_MEMBER_TAG_OPTIONS,
} from './groupProfile.constants';
import type { GroupMember, GroupMemberTagColor } from './groupProfile.types';
import { getDisplayNameFromMember } from './groupProfile.utils';

type GroupMemberTagModalProps = {
  visible: boolean;
  member: GroupMember | null;
  tagDraft: string;
  tagColorDraft: GroupMemberTagColor;
  tagSaving: boolean;
  onChangeTag: (value: string) => void;
  onChangeColor: (value: GroupMemberTagColor) => void;
  onClose: () => void;
  onSave: () => void;
};

export function GroupMemberTagModal({
  visible,
  member,
  tagDraft,
  tagColorDraft,
  tagSaving,
  onChangeTag,
  onChangeColor,
  onClose,
  onSave,
}: GroupMemberTagModalProps) {
  const previewOption = getGroupMemberTagOption(tagColorDraft);
  const avatarUri = resolveAvatarUrl(member?.user?.avatar_url ?? null);
  const displayName = member ? getDisplayNameFromMember(member) : '';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.centerModalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.tagModalCard}>
          <View style={styles.tagModalHeader}>
            <Pressable onPress={onClose} style={styles.tagModalCloseButton}>
              <Feather name="x" size={22} color="#1F2937" />
            </Pressable>
            <Text style={styles.tagModalTitle}>Тег участника</Text>
            <View style={styles.tagModalHeaderSpacer} />
          </View>

          {member ? (
            <View style={styles.tagPreviewCard}>
              <View style={[styles.tagPreviewAccent, { backgroundColor: previewOption.bubble }]} />
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.tagPreviewAvatar} />
              ) : (
                <View style={styles.tagPreviewAvatarFallback}>
                  <Text style={styles.tagPreviewAvatarText}>
                    {(displayName.trim()[0] || '?').toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.tagPreviewTextWrap}>
                <View style={styles.tagPreviewTopRow}>
                  <View
                    style={[
                      styles.roleBadge,
                      styles.memberTagBadge,
                      styles.tagPreviewBadge,
                      { backgroundColor: previewOption.bubble },
                    ]}
                  >
                    <Text
                      style={[styles.roleBadgeText, { color: previewOption.text }]}
                      numberOfLines={1}
                    >
                      {tagDraft.trim() || 'Тег'}
                    </Text>
                  </View>
                  <Text style={styles.tagPreviewName}>{displayName}</Text>
                  <Text style={styles.tagPreviewCurrentTag}>
                    {member.tag?.trim() || 'Тег'}
                  </Text>
                </View>
                <View style={styles.tagPreviewLine} />
                <View style={[styles.tagPreviewLine, styles.tagPreviewLineShort]} />
              </View>
            </View>
          ) : null}

          <View style={styles.tagInputWrap}>
            <Feather name="tag" size={18} color={colors.accent} />
            <TextInput
              value={tagDraft}
              onChangeText={onChangeTag}
              placeholder="Новый тег"
              placeholderTextColor="#A0A9B7"
              style={styles.tagInput}
              maxLength={40}
            />
            {tagDraft.trim().length > 0 ? (
              <Pressable onPress={() => onChangeTag('')} style={styles.tagInputClearButton}>
                <Feather name="x-circle" size={18} color="#9AA5B5" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.tagColorsRow}>
            {GROUP_MEMBER_TAG_OPTIONS.map((option) => {
              const isSelected = tagColorDraft === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onChangeColor(option.key)}
                  style={[styles.tagColorButton, isSelected && styles.tagColorButtonSelected]}
                >
                  <View style={[styles.tagColorSwatch, { backgroundColor: option.fill }]} />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.tagHint}>
            Вы можете указать тег, который будет отображаться рядом с именем участника.
          </Text>

          <Pressable
            onPress={onSave}
            disabled={tagSaving}
            style={({ pressed }) => [
              styles.primaryActionButton,
              styles.tagSaveButton,
              pressed && !tagSaving && styles.cardPressed,
              tagSaving && styles.disabledButton,
            ]}
          >
            {tagSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryActionButtonText}>Сохранить тег</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 18, 28, 0.34)',
  },
  tagModalCard: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    shadowColor: '#18243D',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  tagModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  tagModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
  },
  tagModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  tagModalHeaderSpacer: {
    width: 36,
    height: 36,
  },
  tagPreviewCard: {
    minHeight: 112,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(197, 206, 223, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 18,
  },
  tagPreviewAccent: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  tagPreviewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 14,
  },
  tagPreviewAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  tagPreviewAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
  },
  tagPreviewTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tagPreviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  tagPreviewName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#243043',
  },
  tagPreviewCurrentTag: {
    marginLeft: 'auto',
    fontSize: 13,
    fontWeight: '600',
    color: '#8E97A6',
  },
  tagPreviewBadge: {
    maxWidth: 120,
  },
  tagPreviewLine: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
    marginBottom: 8,
  },
  tagPreviewLineShort: {
    width: '58%',
    marginBottom: 0,
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  memberTagBadge: {
    marginLeft: 0,
  },
  tagInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F6F8FC',
    borderWidth: 1,
    borderColor: 'rgba(198, 208, 224, 0.55)',
    paddingHorizontal: 14,
    height: 54,
  },
  tagInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 17,
    fontWeight: '600',
    color: '#223046',
    paddingVertical: 0,
  },
  tagInputClearButton: {
    marginLeft: 8,
  },
  tagColorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 14,
  },
  tagColorButton: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F8FC',
    borderWidth: 1,
    borderColor: 'rgba(205, 214, 229, 0.5)',
  },
  tagColorButtonSelected: {
    borderColor: colors.accent,
    transform: [{ scale: 1.04 }],
  },
  tagColorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  tagHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6E788A',
    marginBottom: 16,
  },
  primaryActionButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagSaveButton: {
    marginTop: 2,
  },
  primaryActionButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  disabledButton: {
    opacity: 0.62,
  },
});
