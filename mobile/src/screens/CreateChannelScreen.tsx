import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ChatsStackParamList } from '../navigation/types';
import { createChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors, withAlpha } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'CreateChannel'>;

const NAME_LIMIT = 64;
const DESC_LIMIT = 255;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

function ToggleRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.toggleIcon, { backgroundColor: withAlpha(iconColor, 0.14) }]}>
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={styles.toggleBody}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E5E7EB', true: withAlpha(colors.accent, 0.55) }}
        thumbColor={value ? colors.accent : '#FAFAFA'}
        ios_backgroundColor="#E5E7EB"
      />
    </View>
  );
}

export function CreateChannelScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isPaid, setIsPaid] = React.useState(false);
  const [price, setPrice] = React.useState('4.99');
  const [allowComments, setAllowComments] = React.useState(true);
  const [allowReactions, setAllowReactions] = React.useState(true);
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length >= 2 && !submitting;

  const initial = React.useMemo(() => {
    const ch = trimmedName.charAt(0).toUpperCase();
    return ch || '•';
  }, [trimmedName]);

  const handleCreate = React.useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const channel = await createChannel({
        name: trimmedName,
        description: description.trim(),
        visibility: isPrivate ? 'private' : 'public',
        access_type: isPaid ? 'paid' : 'free',
        subscription_price_cents: isPaid ? Math.round(Number(price || '0') * 100) : undefined,
        subscription_period_days: isPaid ? 30 : undefined,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
      });
      channelStore.getState().upsertChannel(channel);
      chatStore.getState().addOrUpdateChat(channel);
      navigation.replace('ChannelFeed', { channelId: channel.id });
    } catch (error) {
      Alert.alert(
        'Не удалось создать канал',
        error instanceof Error ? error.message : 'Попробуйте еще раз.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    allowComments,
    allowReactions,
    canSubmit,
    description,
    isPaid,
    isPrivate,
    navigation,
    price,
    trimmedName,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 120 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={14} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.heroTitle}>Новый канал</Text>
          <Text style={styles.heroSubtitle}>
            Каналы — способ делиться публикациями с неограниченной аудиторией.
          </Text>
        </View>

        {/* Name + description */}
        <SectionLabel>ОСНОВНОЕ</SectionLabel>
        <SectionCard>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Название</Text>
              <Text style={styles.fieldCounter}>
                {name.length}/{NAME_LIMIT}
              </Text>
            </View>
            <TextInput
              value={name}
              onChangeText={(next) => setName(next.slice(0, NAME_LIMIT))}
              style={styles.fieldInput}
              placeholder="Например, Ежедневные новости"
              placeholderTextColor={colors.placeholder}
              maxLength={NAME_LIMIT}
              returnKeyType="next"
            />
          </View>
          <SectionDivider />
          <View style={styles.fieldRow}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Описание</Text>
              <Text style={styles.fieldCounter}>
                {description.length}/{DESC_LIMIT}
              </Text>
            </View>
            <TextInput
              value={description}
              onChangeText={(next) => setDescription(next.slice(0, DESC_LIMIT))}
              style={[styles.fieldInput, styles.fieldTextarea]}
              placeholder="О чём ваш канал"
              placeholderTextColor={colors.placeholder}
              maxLength={DESC_LIMIT}
              multiline
              textAlignVertical="top"
            />
          </View>
        </SectionCard>
        <Text style={styles.hint}>
          Название будет отображаться в списке чатов и в шапке канала.
        </Text>

        {/* Visibility */}
        <SectionLabel>ДОСТУП</SectionLabel>
        <SectionCard>
          <ToggleRow
            icon={isPrivate ? 'lock' : 'globe'}
            iconColor={isPrivate ? '#8A6DF1' : colors.accent}
            title="Приватный канал"
            subtitle={
              isPrivate
                ? 'Только по ссылке-приглашению'
                : 'Доступен всем по ссылке и в поиске'
            }
            value={isPrivate}
            onValueChange={setIsPrivate}
          />
          <SectionDivider />
          <ToggleRow
            icon="credit-card"
            iconColor="#F59E0B"
            title="Платная подписка"
            subtitle="Ежемесячный доступ за плату"
            value={isPaid}
            onValueChange={setIsPaid}
          />
          {isPaid ? (
            <>
              <SectionDivider />
              <View style={styles.priceRow}>
                <View
                  style={[
                    styles.toggleIcon,
                    { backgroundColor: withAlpha('#F59E0B', 0.14) },
                  ]}
                >
                  <MaterialCommunityIcons name="currency-usd" size={19} color="#F59E0B" />
                </View>
                <Text style={styles.toggleTitle}>Цена за месяц</Text>
                <View style={styles.priceField}>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    style={styles.priceInput}
                    selectTextOnFocus
                    maxLength={8}
                  />
                  <Text style={styles.priceCurrency}>$</Text>
                </View>
              </View>
            </>
          ) : null}
        </SectionCard>

        {/* Interactions */}
        <SectionLabel>ОБСУЖДЕНИЕ</SectionLabel>
        <SectionCard>
          <ToggleRow
            icon="message-circle"
            iconColor="#10B981"
            title="Разрешить комментарии"
            subtitle="Подписчики смогут писать под постами"
            value={allowComments}
            onValueChange={setAllowComments}
          />
          <SectionDivider />
          <ToggleRow
            icon="heart"
            iconColor="#EF4444"
            title="Разрешить реакции"
            subtitle="Эмодзи на постах видны всем"
            value={allowReactions}
            onValueChange={setAllowReactions}
          />
        </SectionCard>
        <Text style={styles.hint}>
          Вы сможете поменять любую настройку позже в разделе «Управление каналом».
        </Text>
      </ScrollView>

      {/* Submit */}
      <View style={[styles.submitBar, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable
          onPress={() => void handleCreate()}
          disabled={!canSubmit}
          android_ripple={{ color: withAlpha('#FFFFFF', 0.2) }}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
            pressed && canSubmit && styles.submitButtonPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="check" size={18} color="#FFFFFF" />
              <Text style={styles.submitText}>Создать канал</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    paddingTop: 18,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F2F4F8',
  },
  heroTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  heroSubtitle: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 19,
    maxWidth: 320,
  },

  /* Sections */
  sectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: 32,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.7,
  },
  sectionCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: 64,
  },

  /* Text fields */
  fieldRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.4,
  },
  fieldCounter: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  fieldInput: {
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: 6,
  },
  fieldTextarea: {
    minHeight: 72,
    maxHeight: 160,
    lineHeight: 22,
  },

  /* Toggle row */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBody: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15.5,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 20,
  },
  toggleSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 17,
  },

  /* Price */
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  priceField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 110,
    justifyContent: 'flex-end',
    gap: 4,
  },
  priceInput: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'right',
    padding: 0,
    minWidth: 64,
  },
  priceCurrency: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  /* Hint */
  hint: {
    marginTop: 8,
    marginHorizontal: 32,
    fontSize: 12.5,
    color: '#6B7280',
    lineHeight: 18,
  },

  /* Submit */
  submitBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(242, 244, 248, 0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  submitButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  submitButtonDisabled: {
    backgroundColor: '#9CB6D8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
