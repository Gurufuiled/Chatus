import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { resolveAvatarUrl } from '../../config';
import type { ApiUser } from '../../services/AuthService';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';
import { getDisplayName } from './groupProfile.utils';

type GroupAddMembersModalProps = {
  visible: boolean;
  bottomInset: number;
  query: string;
  selectedUsers: ApiUser[];
  visibleUsers: ApiUser[];
  selectedUserIds: Set<string>;
  memberSearchLoading: boolean;
  addingMembers: boolean;
  onChangeQuery: (value: string) => void;
  onToggleUser: (user: ApiUser) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function GroupAddMembersModal({
  visible,
  bottomInset,
  query,
  selectedUsers,
  visibleUsers,
  selectedUserIds,
  memberSearchLoading,
  addingMembers,
  onChangeQuery,
  onToggleUser,
  onClose,
  onSubmit,
}: GroupAddMembersModalProps) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createGroupAddMembersStyles(c), [c]);
  const [keyboardInset, setKeyboardInset] = React.useState(0);

  React.useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const handleShow = (event: { endCoordinates?: { height?: number } }) => {
      const keyboardHeight = event.endCoordinates?.height ?? 0;
      setKeyboardInset(Math.max(keyboardHeight - bottomInset, 0));
    };
    const handleHide = () => setKeyboardInset(0);

    const showSubscription = Keyboard.addListener(showEvent, handleShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [bottomInset, visible]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.sheetCard,
            {
              paddingBottom: Math.max(bottomInset, 18),
              marginBottom: keyboardInset,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Добавить участников</Text>
            <Pressable onPress={onClose} style={styles.sheetCloseButton}>
              <Feather name="x" size={20} color={c.textPrimary} />
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Поиск по имени или @handle"
            placeholderTextColor={c.placeholder}
            style={styles.sheetSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {selectedUsers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedScrollContent}
              style={styles.selectedScroll}
            >
              {selectedUsers.map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => onToggleUser(user)}
                  style={({ pressed }) => [styles.memberChip, pressed && styles.cardPressed]}
                >
                  <Text style={styles.memberChipText} numberOfLines={1}>
                    {getDisplayName(user)}
                  </Text>
                  <Text style={styles.memberChipRemove}>×</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <ScrollView
            style={styles.sheetResults}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {memberSearchLoading && visibleUsers.length === 0 ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={c.accent} />
              </View>
            ) : visibleUsers.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={styles.emptySubtitle}>
                  {query.trim()
                    ? 'Никого не нашли по этому запросу.'
                    : 'Начни вводить имя, чтобы найти участников.'}
                </Text>
              </View>
            ) : (
              <>
                {memberSearchLoading ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color={c.accent} size="small" />
                  </View>
                ) : null}
                {visibleUsers.map((user) => {
                const isSelected = selectedUserIds.has(user.id);
                const avatar = resolveAvatarUrl(user.avatar_url);
                const display = getDisplayName(user);
                return (
                  <Pressable
                    key={user.id}
                    onPress={() => onToggleUser(user)}
                    style={({ pressed }) => [
                      styles.searchResultRow,
                      pressed && styles.cardPressed,
                      isSelected && styles.searchResultRowSelected,
                    ]}
                  >
                    {avatar ? (
                      <Image
                        source={{ uri: avatar }}
                        style={styles.searchResultAvatar}
                        contentFit="cover"
                        cachePolicy="disk"
                      />
                    ) : (
                      <View style={styles.searchResultAvatarFallback}>
                        <Text style={styles.searchResultAvatarText}>
                          {(display.trim()[0] || '?').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName}>{display}</Text>
                      <Text style={styles.searchResultHandle}>
                        {user.handle ? `@${user.handle}` : user.username || 'Пользователь'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.searchCheckbox,
                        isSelected && styles.searchCheckboxSelected,
                      ]}
                    >
                      {isSelected ? <View style={styles.searchCheckboxInner} /> : null}
                    </View>
                  </Pressable>
                );
              })}
              </>
            )}
          </ScrollView>

          <Pressable
            onPress={onSubmit}
            disabled={addingMembers}
            style={({ pressed }) => [
              styles.primaryActionButton,
              pressed && !addingMembers && styles.cardPressed,
              addingMembers && styles.disabledButton,
            ]}
          >
            {addingMembers ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryActionButtonText}>Добавить</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createGroupAddMembersStyles(c: ThemeColors) {
  return StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: c.inputBackgroundSolid,
    paddingHorizontal: 18,
    paddingTop: 18,
    maxHeight: '78%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: c.textPrimary,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.inputBackground,
  },
  sheetSearchInput: {
    height: 52,
    borderRadius: 18,
    backgroundColor: c.inputBackground,
    borderWidth: 1,
    borderColor: c.composerBorder,
    paddingHorizontal: 16,
    fontSize: 16,
    color: c.textPrimary,
    marginBottom: 14,
  },
  selectedScroll: {
    maxHeight: 46,
    marginBottom: 10,
  },
  selectedScrollContent: {
    gap: 8,
    paddingRight: 4,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: withAlpha(c.accent, 0.12),
  },
  memberChipText: {
    maxWidth: 148,
    fontSize: 14,
    fontWeight: '700',
    color: c.accent,
  },
  memberChipRemove: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '700',
    color: c.accent,
  },
  sheetResults: {
    flex: 1,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  inlineLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  emptySubtitle: {
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchResultRowSelected: {
    backgroundColor: withAlpha(c.accent, 0.08),
  },
  searchResultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  searchResultAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(c.accent, 0.16),
  },
  searchResultAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: c.accent,
  },
  searchResultInfo: {
    flex: 1,
    minWidth: 0,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '700',
    color: c.textPrimary,
  },
  searchResultHandle: {
    marginTop: 2,
    fontSize: 13,
    color: c.textSecondary,
  },
  searchCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: withAlpha(c.textSecondary, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCheckboxSelected: {
    borderColor: c.accent,
    backgroundColor: withAlpha(c.accent, 0.12),
  },
  searchCheckboxInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.accent,
  },
  primaryActionButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
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
}
