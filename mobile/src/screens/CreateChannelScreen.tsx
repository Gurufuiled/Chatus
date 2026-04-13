import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChannelsStackParamList } from '../navigation/types';
import { createChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChannelsStackParamList, 'CreateChannel'>;

export function CreateChannelScreen() {
  const navigation = useNavigation<Nav>();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isPaid, setIsPaid] = React.useState(false);
  const [price, setPrice] = React.useState('4.99');
  const [allowComments, setAllowComments] = React.useState(true);
  const [allowReactions, setAllowReactions] = React.useState(true);
  const [isPrivate, setIsPrivate] = React.useState(false);

  const handleCreate = React.useCallback(async () => {
    try {
      const channel = await createChannel({
        name,
        description,
        visibility: isPrivate ? 'private' : 'public',
        access_type: isPaid ? 'paid' : 'free',
        subscription_price_cents: isPaid ? Math.round(Number(price || '0') * 100) : undefined,
        subscription_period_days: isPaid ? 30 : undefined,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
      });
      channelStore.getState().upsertChannel(channel);
      navigation.replace('ChannelAdmin', { channelId: channel.id });
    } catch (error) {
      Alert.alert(
        'Unable to create channel',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [allowComments, allowReactions, description, isPaid, isPrivate, name, navigation, price]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Name</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        style={[styles.input, styles.textArea]}
        multiline
      />

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Private channel</Text>
        <Switch value={isPrivate} onValueChange={setIsPrivate} />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Paid subscription</Text>
        <Switch value={isPaid} onValueChange={setIsPaid} />
      </View>

      {isPaid ? (
        <>
          <Text style={styles.label}>Monthly price</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            style={styles.input}
            keyboardType="decimal-pad"
          />
        </>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Allow comments</Text>
        <Switch value={allowComments} onValueChange={setAllowComments} />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Allow reactions</Text>
        <Switch value={allowReactions} onValueChange={setAllowReactions} />
      </View>

      <Pressable style={styles.button} onPress={() => void handleCreate()}>
        <Text style={styles.buttonText}>Create channel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    padding: 16,
  },
  label: {
    marginBottom: 8,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  input: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  button: {
    marginTop: 10,
    borderRadius: 18,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
