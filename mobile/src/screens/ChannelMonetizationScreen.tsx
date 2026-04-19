import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Svg, { Path, Line as SvgLine, Circle } from 'react-native-svg';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import {
  formatMoney,
  formatPeriod,
  monetizationStore,
  type MonetizationEvent,
  type PaidSubscriber,
  type RevenuePoint,
} from '../stores/monetizationStore';

type Route = RouteProp<ChatsStackParamList, 'ChannelMonetization'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelMonetization'>;

export function ChannelMonetizationScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId } = route.params;

  React.useEffect(() => {
    monetizationStore.getState().load(channelId);
  }, [channelId]);

  const snapshot = monetizationStore((s) => s.byChannelId[channelId]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Монетизация', headerBackTitle: 'Назад' });
  }, [navigation]);

  if (!snapshot) {
    return <View style={styles.screen} />;
  }

  const {
    tariff,
    mrr_cents,
    active_subscribers,
    revenue_30d_cents,
    churn_rate,
    series_30d,
    subscribers,
    events,
    payout_available_cents,
    next_payout_ts,
  } = snapshot;

  const prev30dMock = Math.round(revenue_30d_cents * 0.86);
  const revenueTrend = revenue_30d_cents - prev30dMock;
  const trendPercent = prev30dMock > 0 ? (revenueTrend / prev30dMock) * 100 : 0;

  const handleEditTariff = () => {
    Alert.alert(
      'Редактор тарифа',
      'Здесь появится форма настройки цены, периода и описания подписки. Сейчас включен демо-режим с моковыми данными.',
    );
  };

  const handleRequestPayout = () => {
    Alert.alert(
      'Вывод средств',
      `Доступно к выводу: ${formatMoney(payout_available_cents)}.\nБлижайшая автоматическая выплата — ${formatDate(
        next_payout_ts,
      )}.`,
    );
  };

  const handleOpenSubscribers = () => {
    Alert.alert('Список подписчиков', 'Полный список платных подписчиков появится в следующей версии.');
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ─── Hero: MRR ─── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Ежемесячный доход</Text>
          <Text style={styles.heroValue}>{formatMoney(mrr_cents, tariff.currency)}</Text>
          <View style={styles.heroTrendRow}>
            <Feather
              name={revenueTrend >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={revenueTrend >= 0 ? '#16A34A' : '#DC2626'}
            />
            <Text
              style={[
                styles.heroTrendText,
                { color: revenueTrend >= 0 ? '#16A34A' : '#DC2626' },
              ]}
            >
              {revenueTrend >= 0 ? '+' : ''}
              {trendPercent.toFixed(1)}% за 30 дней
            </Text>
          </View>
        </View>

        {/* ─── KPI tiles ─── */}
        <View style={styles.kpiRow}>
          <KpiTile
            icon="users"
            color="#007AFF"
            label="Платных подписчиков"
            value={String(active_subscribers)}
          />
          <KpiTile
            icon="dollar-sign"
            color="#16A34A"
            label="Выручка, 30 дней"
            value={formatMoney(revenue_30d_cents, tariff.currency)}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiTile
            icon="log-out"
            color="#F59E0B"
            label="Отток, 30 дней"
            value={`${(churn_rate * 100).toFixed(1)}%`}
          />
          <KpiTile
            icon="credit-card"
            color="#5856D6"
            label="К выплате"
            value={formatMoney(payout_available_cents, tariff.currency)}
          />
        </View>

        {/* ─── Revenue chart ─── */}
        <SectionTitle title="Выручка за 30 дней" />
        <View style={styles.card}>
          <RevenueChart data={series_30d} />
          <View style={styles.chartFooter}>
            <Text style={styles.chartFooterLabel}>
              Пик: {formatMoney(maxBy(series_30d, 'revenue_cents'), tariff.currency)}
            </Text>
            <Text style={styles.chartFooterLabel}>
              Среднее: {formatMoney(avgBy(series_30d, 'revenue_cents'), tariff.currency)}
            </Text>
          </View>
        </View>

        {/* ─── Subscribers chart ─── */}
        <SectionTitle title="Прирост подписчиков" />
        <View style={styles.card}>
          <SubscribersBars data={series_30d} />
          <View style={styles.legendRow}>
            <LegendDot color="#16A34A" label="Новые" />
            <LegendDot color="#DC2626" label="Ушли" />
          </View>
        </View>

        {/* ─── Tariff card ─── */}
        <SectionTitle title="Тариф подписки" />
        <Pressable onPress={handleEditTariff} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          <View style={styles.tariffHead}>
            <View style={styles.tariffIconWrap}>
              <Feather name="star" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tariffPrice}>
                {formatMoney(tariff.price_cents, tariff.currency)}{' '}
                <Text style={styles.tariffPeriod}>/ {formatPeriod(tariff.period)}</Text>
              </Text>
              <Text style={styles.tariffStatus}>
                {tariff.enabled ? 'Подписка активна' : 'Подписка отключена'}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.tariffDescription}>{tariff.description}</Text>
          {tariff.trial_days > 0 ? (
            <View style={styles.trialBadge}>
              <Feather name="gift" size={12} color="#1E40AF" />
              <Text style={styles.trialBadgeText}>Пробный период: {tariff.trial_days} дн.</Text>
            </View>
          ) : null}
        </Pressable>

        {/* ─── Subscribers preview ─── */}
        <SectionTitle
          title="Подписчики"
          action="Все"
          onAction={handleOpenSubscribers}
        />
        <View style={styles.card}>
          {subscribers.slice(0, 5).map((sub, index) => (
            <React.Fragment key={sub.id}>
              <SubscriberRow subscriber={sub} currency={tariff.currency} price={tariff.price_cents} />
              {index < Math.min(subscribers.length, 5) - 1 ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
          {subscribers.length === 0 ? (
            <Text style={styles.emptyText}>Пока нет платных подписчиков</Text>
          ) : null}
        </View>

        {/* ─── Recent events ─── */}
        <SectionTitle title="Последние события" />
        <View style={styles.card}>
          {events.slice(0, 6).map((evt, index) => (
            <React.Fragment key={evt.id}>
              <EventRow event={evt} currency={tariff.currency} />
              {index < Math.min(events.length, 6) - 1 ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
        </View>

        {/* ─── Payout ─── */}
        <SectionTitle title="Выплаты" />
        <View style={styles.card}>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>Доступно к выводу</Text>
            <Text style={styles.payoutValue}>
              {formatMoney(payout_available_cents, tariff.currency)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>Ближайшая выплата</Text>
            <Text style={styles.payoutSub}>{formatDate(next_payout_ts)}</Text>
          </View>
          <Pressable
            onPress={handleRequestPayout}
            style={({ pressed }) => [styles.payoutButton, pressed && styles.payoutButtonPressed]}
          >
            <Feather name="arrow-down-circle" size={16} color="#FFFFFF" />
            <Text style={styles.payoutButtonText}>Запросить выплату</Text>
          </Pressable>
        </View>

        <View style={styles.mockBanner}>
          <Feather name="info" size={14} color="#1E40AF" />
          <Text style={styles.mockBannerText}>
            Демо-режим. Реальные платежи появятся после подключения платёжного провайдера.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── Sub-components ─── */

function KpiTile({
  icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.kpiTile}>
      <View style={[styles.kpiIconWrap, { backgroundColor: color }]}>
        <Feather name={icon} size={14} color="#FFFFFF" />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const CHART_PAD_X = 12;
const CHART_PAD_Y = 16;

function RevenueChart({ data }: { data: RevenuePoint[] }) {
  if (data.length < 2) return null;

  const w = CHART_WIDTH - CHART_PAD_X * 2;
  const h = CHART_HEIGHT - CHART_PAD_Y * 2;
  const maxV = Math.max(...data.map((d) => d.revenue_cents));
  const minV = Math.min(...data.map((d) => d.revenue_cents));
  const range = maxV - minV || 1;

  const points = data.map((p, i) => {
    const x = CHART_PAD_X + (i / (data.length - 1)) * w;
    const y = CHART_PAD_Y + h - ((p.revenue_cents - minV) / range) * h;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${points[points.length - 1].x} ${CHART_PAD_Y + h} L${points[0].x} ${
    CHART_PAD_Y + h
  } Z`;

  const gridLines = [0.25, 0.5, 0.75].map(
    (frac) => CHART_PAD_Y + h * frac,
  );

  const lastPoint = points[points.length - 1];

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      {gridLines.map((y, i) => (
        <SvgLine
          key={i}
          x1={CHART_PAD_X}
          y1={y}
          x2={CHART_PAD_X + w}
          y2={y}
          stroke="#E5E7EB"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      ))}
      <Path d={areaPath} fill="rgba(22,163,74,0.12)" />
      <Path d={linePath} stroke="#16A34A" strokeWidth={2.2} fill="none" />
      <Circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill="#16A34A" />
      <Circle cx={lastPoint.x} cy={lastPoint.y} r={8} fill="rgba(22,163,74,0.2)" />
    </Svg>
  );
}

function SubscribersBars({ data }: { data: RevenuePoint[] }) {
  const w = CHART_WIDTH - CHART_PAD_X * 2;
  const h = CHART_HEIGHT - CHART_PAD_Y * 2;
  const midY = CHART_PAD_Y + h / 2;
  const maxPos = Math.max(1, ...data.map((d) => d.new_subs));
  const maxNeg = Math.max(1, ...data.map((d) => d.churned));
  const barW = (w / data.length) * 0.65;
  const step = w / data.length;

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <SvgLine
        x1={CHART_PAD_X}
        y1={midY}
        x2={CHART_PAD_X + w}
        y2={midY}
        stroke="#E5E7EB"
        strokeWidth={1}
      />
      {data.map((p, i) => {
        const x = CHART_PAD_X + i * step + (step - barW) / 2;
        const posH = (p.new_subs / maxPos) * (h / 2);
        const negH = (p.churned / maxNeg) * (h / 2);
        return (
          <React.Fragment key={i}>
            {posH > 0 ? (
              <Path
                d={`M${x} ${midY - posH} h${barW} v${posH} h${-barW} Z`}
                fill="#16A34A"
              />
            ) : null}
            {negH > 0 ? (
              <Path
                d={`M${x} ${midY} h${barW} v${negH} h${-barW} Z`}
                fill="#DC2626"
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function SubscriberRow({
  subscriber,
  currency,
  price,
}: {
  subscriber: PaidSubscriber;
  currency: string;
  price: number;
}) {
  const initial = (subscriber.name[0] || '?').toUpperCase();
  const statusColor =
    subscriber.status === 'active'
      ? '#16A34A'
      : subscriber.status === 'grace'
      ? '#F59E0B'
      : '#9CA3AF';
  const statusLabel =
    subscriber.status === 'active'
      ? 'Активна'
      : subscriber.status === 'grace'
      ? 'Льготный период'
      : 'Отменена';

  return (
    <View style={styles.subscriberRow}>
      <View style={styles.subscriberAvatar}>
        <Text style={styles.subscriberAvatarText}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.subscriberName} numberOfLines={1}>
          {subscriber.name}
        </Text>
        <Text style={styles.subscriberMeta}>
          С {formatDate(subscriber.since_ts)} · {formatMoney(price, currency)}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

function EventRow({ event, currency }: { event: MonetizationEvent; currency: string }) {
  const config = eventConfig(event.kind);
  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventIconWrap, { backgroundColor: config.color + '22' }]}>
        <Feather name={config.icon} size={14} color={config.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>{config.label}</Text>
        <Text style={styles.eventSub}>
          {event.user_name} · {formatDate(event.ts)}
        </Text>
      </View>
      {event.amount_cents > 0 ? (
        <Text style={[styles.eventAmount, { color: config.color }]}>
          +{formatMoney(event.amount_cents, currency)}
        </Text>
      ) : null}
    </View>
  );
}

function eventConfig(kind: MonetizationEvent['kind']): {
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  label: string;
} {
  switch (kind) {
    case 'new_subscription':
      return { icon: 'user-plus', color: '#16A34A', label: 'Новая подписка' };
    case 'renewal':
      return { icon: 'repeat', color: '#007AFF', label: 'Продление' };
    case 'cancellation':
      return { icon: 'user-minus', color: '#F59E0B', label: 'Отмена подписки' };
    case 'refund':
      return { icon: 'rotate-ccw', color: '#DC2626', label: 'Возврат средств' };
  }
}

/* ─── Utils ─── */

function maxBy<T>(arr: T[], key: keyof T): number {
  return arr.reduce((m, v) => Math.max(m, Number(v[key])), 0);
}
function avgBy<T>(arr: T[], key: keyof T): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((m, v) => m + Number(v[key]), 0) / arr.length);
}
function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F0F5' },
  container: { flex: 1 },
  content: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 12 },
  pressed: { opacity: 0.7 },

  heroCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  heroLabel: { color: '#6B7280', fontSize: 13, fontWeight: '500' },
  heroValue: {
    marginTop: 6,
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  heroTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  heroTrendText: { fontSize: 13, fontWeight: '600' },

  kpiRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  kpiTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 18, fontWeight: '700', color: '#111827' },
  kpiLabel: { fontSize: 12, color: '#6B7280' },

  sectionTitleRow: {
    marginTop: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sectionAction: { fontSize: 14, color: colors.accent, fontWeight: '500' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
  },

  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  chartFooterLabel: { fontSize: 12, color: '#6B7280' },

  legendRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#6B7280' },

  tariffHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tariffIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tariffPrice: { fontSize: 18, fontWeight: '700', color: '#111827' },
  tariffPeriod: { fontSize: 14, fontWeight: '400', color: '#6B7280' },
  tariffStatus: { marginTop: 2, fontSize: 12, color: '#16A34A' },
  tariffDescription: { marginTop: 10, fontSize: 13, color: '#374151', lineHeight: 18 },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  trialBadgeText: { color: '#1E40AF', fontSize: 12, fontWeight: '600' },

  subscriberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  subscriberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriberAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  subscriberName: { fontSize: 15, color: '#111827', fontWeight: '500' },
  subscriberMeta: { marginTop: 2, fontSize: 12, color: '#6B7280' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  eventIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: { fontSize: 14, color: '#111827', fontWeight: '500' },
  eventSub: { marginTop: 1, fontSize: 12, color: '#6B7280' },
  eventAmount: { fontSize: 14, fontWeight: '600' },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E4E8',
    marginVertical: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },

  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  payoutLabel: { fontSize: 14, color: '#111827' },
  payoutValue: { fontSize: 17, fontWeight: '700', color: '#111827' },
  payoutSub: { fontSize: 14, color: '#6B7280' },
  payoutButton: {
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payoutButtonPressed: { opacity: 0.8 },
  payoutButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  mockBanner: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mockBannerText: { color: '#1E40AF', fontSize: 12, flex: 1 },
});
