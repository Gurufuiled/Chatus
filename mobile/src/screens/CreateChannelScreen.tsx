import React, { useMemo } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'CreateChannel'>;

const NAME_LIMIT = 64;
const DESC_LIMIT = 255;

type CreateChannelStyles = ReturnType<typeof createCreateChannelStyles>;

function createCreateChannelStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.chatBackground,
    },
    container: {
      flex: 1,
    },
    content: {
      paddingBottom: 120,
    },

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
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent,
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
      backgroundColor: c.toolbar,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: c.chatBackground,
    },
    heroTitle: {
      marginTop: 14,
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
    },
    heroSubtitle: {
      marginTop: 6,
      textAlign: 'center',
      fontSize: 13.5,
      color: c.textSecondary,
      lineHeight: 19,
      maxWidth: 320,
    },

    sectionLabel: {
      marginTop: 22,
      marginBottom: 8,
      marginHorizontal: 32,
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.7,
    },
    sectionCard: {
      marginHorizontal: 16,
      borderRadius: 16,
      backgroundColor: c.inputBackgroundSolid,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 64,
    },

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
      color: c.textSecondary,
      letterSpacing: 0.4,
    },
    fieldCounter: {
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: '600',
    },
    fieldInput: {
      fontSize: 16,
      color: c.textPrimary,
      paddingVertical: 6,
    },
    fieldTextarea: {
      minHeight: 72,
      maxHeight: 160,
      lineHeight: 22,
    },

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
      color: c.textPrimary,
      fontWeight: '600',
      lineHeight: 20,
    },
    toggleSubtitle: {
      marginTop: 2,
      fontSize: 12.5,
      color: c.textSecondary,
      lineHeight: 17,
    },

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
      backgroundColor: c.inputBackground,
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
      color: c.textPrimary,
      textAlign: 'right',
      padding: 0,
      minWidth: 64,
    },
    priceCurrency: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textSecondary,
    },

    hint: {
      marginTop: 8,
      marginHorizontal: 32,
      fontSize: 12.5,
      color: c.textSecondary,
      lineHeight: 18,
    },

    submitBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: withAlpha(c.chatBackground, 0.94),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 52,
      borderRadius: 16,
      backgroundColor: c.accent,
      shadowColor: c.accent,
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
      backgroundColor: c.disabled,
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
}

function SectionLabel({ children, st }: { children: React.ReactNode; st: CreateChannelStyles }) {
  return <Text style={st.sectionLabel}>{children}</Text>;
}

function SectionCard({ children, st }: { children: React.ReactNode; st: CreateChannelStyles }) {
  return <View style={st.sectionCard}>{children}</View>;
}

function SectionDivider({ st }: { st: CreateChannelStyles }) {
  return <View style={st.sectionDivider} />;
}

function ToggleRow({
  st,
  accent,
  trackOff,
  thumbOff,
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  st: CreateChannelStyles;
  accent: string;
  trackOff: string;
  thumbOff: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={st.toggleRow}>
      <View style={[st.toggleIcon, { backgroundColor: withAlpha(iconColor, 0.14) }]}>
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={st.toggleBody}>
        <Text style={st.toggleTitle}>{title}</Text>
        <Text style={st.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: trackOff, true: withAlpha(accent, 0.55) }}
        thumbColor={value ? accent : thumbOff}
        ios_backgroundColor={trackOff}
      />
    </View>
  );
}

export function CreateChannelScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createCreateChannelStyles(c), [c]);
  const switchTrackOff = useMemo(() => withAlpha(c.textSecondary, 0.28), [c.textSecondary]);
  const switchThumbOff = c.inputBackgroundSolid;

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

        <SectionLabel st={styles}>ОСНОВНОЕ</SectionLabel>
        <SectionCard st={styles}>
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
              placeholderTextColor={c.placeholder}
              maxLength={NAME_LIMIT}
              returnKeyType="next"
            />
          </View>
          <SectionDivider st={styles} />
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
              placeholderTextColor={c.placeholder}
              maxLength={DESC_LIMIT}
              multiline
              textAlignVertical="top"
            />
          </View>
        </SectionCard>
        <Text style={styles.hint}>
          Название будет отображаться в списке чатов и в шапке канала.
        </Text>

        <SectionLabel st={styles}>ДОСТУП</SectionLabel>
        <SectionCard st={styles}>
          <ToggleRow
            st={styles}
            accent={c.accent}
            trackOff={switchTrackOff}
            thumbOff={switchThumbOff}
            icon={isPrivate ? 'lock' : 'globe'}
            iconColor={isPrivate ? '#8A6DF1' : c.accent}
            title="Приватный канал"
            subtitle={
              isPrivate
                ? 'Только по ссылке-приглашению'
                : 'Доступен всем по ссылке и в поиске'
            }
            value={isPrivate}
            onValueChange={setIsPrivate}
          />
          <SectionDivider st={styles} />
          <ToggleRow
            st={styles}
            accent={c.accent}
            trackOff={switchTrackOff}
            thumbOff={switchThumbOff}
            icon="credit-card"
            iconColor="#F59E0B"
            title="Платная подписка"
            subtitle="Ежемесячный доступ за плату"
            value={isPaid}
            onValueChange={setIsPaid}
          />
          {isPaid ? (
            <>
              <SectionDivider st={styles} />
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

        <SectionLabel st={styles}>ОБСУЖДЕНИЕ</SectionLabel>
        <SectionCard st={styles}>
          <ToggleRow
            st={styles}
            accent={c.accent}
            trackOff={switchTrackOff}
            thumbOff={switchThumbOff}
            icon="message-circle"
            iconColor="#10B981"
            title="Разрешить комментарии"
            subtitle="Подписчики смогут писать под постами"
            value={allowComments}
            onValueChange={setAllowComments}
          />
          <SectionDivider st={styles} />
          <ToggleRow
            st={styles}
            accent={c.accent}
            trackOff={switchTrackOff}
            thumbOff={switchThumbOff}
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
