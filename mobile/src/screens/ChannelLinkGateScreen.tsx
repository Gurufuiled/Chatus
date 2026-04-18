import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { resolveChannelByInvite, resolveChannelBySlug } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<ChatsStackParamList, 'ChannelLinkSlug' | 'ChannelLinkInvite'>;

export function ChannelLinkGateScreen({ route, navigation }: Props) {
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const slug = route.name === 'ChannelLinkSlug' ? route.params.slug : undefined;
    const inviteToken =
      route.name === 'ChannelLinkInvite' ? route.params.inviteToken : undefined;

    void (async () => {
      try {
        const resolved = slug
          ? await resolveChannelBySlug(slug)
          : await resolveChannelByInvite(inviteToken ?? '');

        channelStore.getState().upsertChannel(resolved.channel);
        chatStore.getState().addOrUpdateChat(resolved.channel);
        channelStore.getState().setLinkResolve(resolved.channel_id, resolved);

        navigation.replace('ChannelFeed', {
          channelId: resolved.channel_id,
          inviteToken: inviteToken?.trim() || undefined,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Не удалось открыть канал';
        Alert.alert('Канал', msg, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    })();
  }, [navigation, route]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.hint}>Открытие канала…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackgroundSolid,
    gap: 12,
  },
  hint: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
