import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { apiUpload } from '../services/apiClient';
import { fetchChannelDetail, updateChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { resolveAvatarUrl } from '../config';
import { AvatarPickSheet, type AvatarPickResult } from '../components/AvatarPickSheet';

type Route = RouteProp<ChatsStackParamList, 'ChannelEdit'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelEdit'>;

export function ChannelEditScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelEditStyles(c), [c]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId } = route.params;
  const detail = channelStore((s) => s.detailsById[channelId]);

  const canEditAvatar =
    detail?.channel_permissions?.can_edit_channel_avatar === true ||
    detail?.channel_permissions?.can_edit_channel === true;
  const canEditName =
    detail?.channel_permissions?.can_edit_channel_name === true ||
    detail?.channel_permissions?.can_edit_channel === true;
  const canEditDescription =
    detail?.channel_permissions?.can_edit_channel_description === true ||
    detail?.channel_permissions?.can_edit_channel === true;
  const canEditAnything = canEditAvatar || canEditName || canEditDescription;

  const [name, setName] = React.useState(detail?.channel.name ?? '');
  const [description, setDescription] = React.useState(detail?.channel.description ?? '');
  const [avatarUrl, setAvatarUrl] = React.useState(detail?.channel.avatar_url ?? null);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [avatarSheetVisible, setAvatarSheetVisible] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState<string | null>(null);
  const resolvedAvatar = resolveAvatarUrl(avatarUrl);

  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar(message);
  }, []);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  React.useEffect(() => {
    navigation.setOptions({ title: 'Изменить канал', headerBackTitle: 'Назад' });
  }, [navigation]);

  React.useEffect(() => {
    if (!detail) {
      void fetchChannelDetail(channelId).then((next) => {
        channelStore.getState().setDetail(channelId, next);
        chatStore.getState().addOrUpdateChat(next.channel);
        setName(next.channel.name ?? '');
        setDescription(next.channel.description ?? '');
        setAvatarUrl(next.channel.avatar_url ?? null);
      });
    }
  }, [channelId, detail]);

  const openAvatarPicker = React.useCallback(() => {
    if (!canEditAvatar) return showSnackbar('Недостаточно прав для изменения аватара канала');
    setAvatarSheetVisible(true);
  }, [canEditAvatar, showSnackbar]);

  const handleAvatarPicked = React.useCallback(
    async (pick: AvatarPickResult) => {
      setUploading(true);
      try {
        const uploaded = await apiUpload({
          uri: pick.uri,
          name: pick.name,
          type: pick.type,
        });
        setAvatarUrl(uploaded.url);
      } catch (error) {
        Alert.alert(
          'Не удалось загрузить фото',
          error instanceof Error ? error.message : 'Попробуйте еще раз.',
        );
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const save = React.useCallback(async () => {
    if (!canEditAnything) return showSnackbar('Недостаточно прав для изменения канала');

    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Пустое название', 'Введите название канала.');
      return;
    }

    const currentName = (detail?.channel.name ?? '').trim();
    const currentDescription = (detail?.channel.description ?? '').trim();
    const currentAvatar = detail?.channel.avatar_url ?? null;
    const nextDescription = description.trim();

    if (trimmed !== currentName && !canEditName) {
      return showSnackbar('Недостаточно прав для изменения названия канала');
    }
    if (nextDescription !== currentDescription && !canEditDescription) {
      return showSnackbar('Недостаточно прав для изменения описания канала');
    }
    if ((avatarUrl ?? null) !== currentAvatar && !canEditAvatar) {
      return showSnackbar('Недостаточно прав для изменения аватара канала');
    }

    setSaving(true);
    try {
      const payload: { name?: string; description?: string; avatar_url?: string } = {};
      if (canEditName) payload.name = trimmed;
      if (canEditDescription) payload.description = nextDescription;
      if (canEditAvatar) payload.avatar_url = avatarUrl ?? undefined;

      const updated = await updateChannel(channelId, payload);
      channelStore.getState().upsertChannel(updated);
      chatStore.getState().addOrUpdateChat(updated);
      const nextDetail = await fetchChannelDetail(channelId);
      channelStore.getState().setDetail(channelId, nextDetail);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Не удалось сохранить', error instanceof Error ? error.message : 'Попробуйте еще раз.');
    } finally {
      setSaving(false);
    }
  }, [
    avatarUrl,
    canEditAnything,
    canEditAvatar,
    canEditDescription,
    canEditName,
    channelId,
    description,
    detail?.channel.avatar_url,
    detail?.channel.description,
    detail?.channel.name,
    name,
    navigation,
    showSnackbar,
  ]);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {!canEditAnything ? (
          <View style={styles.noRightsCard}>
            <Feather name="lock" size={14} color={c.textSecondary} />
            <Text style={styles.noRightsText}>Недостаточно прав для редактирования канала.</Text>
          </View>
        ) : null}

        <Pressable onPress={() => openAvatarPicker()} style={styles.avatarButton}>
          {resolvedAvatar ? (
            <Image source={{ uri: resolvedAvatar }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.avatarText}>{(name.trim()[0] || 'К').toUpperCase()}</Text>
              )}
            </View>
          )}
          <Text style={[styles.avatarHint, !canEditAvatar && styles.disabledHint]}>
            {avatarUrl ? 'Изменить фото' : 'Поставить фото'}
          </Text>
        </Pressable>

        <Text style={styles.label}>Название</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Название канала"
          editable={canEditName}
        />

        <Text style={styles.label}>Описание</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.description]}
          placeholder="Описание"
          multiline
          editable={canEditDescription}
        />

        <Pressable
          onPress={() => void save()}
          disabled={saving || uploading}
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
            (!canEditAnything || saving || uploading) && styles.saveButtonDisabled,
          ]}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Сохранить</Text>}
        </Pressable>
      </ScrollView>

      <AvatarPickSheet
        visible={avatarSheetVisible}
        onClose={() => setAvatarSheetVisible(false)}
        onPick={(pick) => void handleAvatarPicked(pick)}
        subtitle="Фото канала"
      />

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createChannelEditStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.chatBackground },
    container: { flex: 1, backgroundColor: c.chatBackground },
    content: { padding: 16, paddingBottom: 24 },
    noRightsCard: {
      borderRadius: 14,
      backgroundColor: withAlpha('#F59E0B', 0.2),
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    noRightsText: { color: c.textPrimary, fontWeight: '600', flex: 1 },
    avatarButton: { alignItems: 'center', marginBottom: 18 },
    avatarCircle: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: '#FF6D6D',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#FFFFFF', fontSize: 36, fontWeight: '700' },
    avatarImage: { width: 84, height: 84, borderRadius: 42 },
    avatarHint: { marginTop: 8, color: c.accent, fontWeight: '600' },
    disabledHint: { color: c.textSecondary },
    label: { marginBottom: 8, color: c.textPrimary, fontWeight: '700' },
    input: {
      marginBottom: 14,
      borderRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: c.textPrimary,
    },
    description: { minHeight: 110, textAlignVertical: 'top' },
    saveButton: {
      marginTop: 8,
      height: 52,
      borderRadius: 16,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonPressed: { opacity: 0.88 },
    saveButtonDisabled: { opacity: 0.6 },
    saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
    snackbarWrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 14,
      backgroundColor: withAlpha(c.accent, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(c.accent, 0.35),
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: c.accent,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    snackbarText: { color: c.link, textAlign: 'center', fontWeight: '700' },
  });
}

