import { create } from 'zustand';

/**
 * Mock billing/monetization store.
 *
 * Пока нет реальной платёжной интеграции, экран монетизации работает на
 * детерминированных мок-данных, выводимых из channelId. Это позволяет
 * продумать UX/структуру и подключить реальные API позже без переписывания
 * экрана (достаточно будет заменить реализации fetch*).
 */

export type SubscriptionPeriod = 'month' | 'year';

export type ChannelTariff = {
  enabled: boolean;
  price_cents: number;
  currency: string;
  period: SubscriptionPeriod;
  description: string;
  trial_days: number;
};

export type PaidSubscriber = {
  id: string;
  name: string;
  avatar_url: string | null;
  since_ts: number;
  renews_ts: number;
  status: 'active' | 'grace' | 'cancelled';
};

export type RevenuePoint = {
  ts: number;
  revenue_cents: number;
  new_subs: number;
  churned: number;
};

export type MonetizationEvent = {
  id: string;
  kind: 'new_subscription' | 'renewal' | 'cancellation' | 'refund';
  user_name: string;
  amount_cents: number;
  ts: number;
};

export type MonetizationSnapshot = {
  tariff: ChannelTariff;
  mrr_cents: number;
  active_subscribers: number;
  revenue_30d_cents: number;
  churn_rate: number;
  series_30d: RevenuePoint[];
  subscribers: PaidSubscriber[];
  events: MonetizationEvent[];
  payout_available_cents: number;
  payout_pending_cents: number;
  next_payout_ts: number;
};

type MonetizationState = {
  byChannelId: Record<string, MonetizationSnapshot>;
};

type MonetizationActions = {
  load: (channelId: string) => MonetizationSnapshot;
  updateTariff: (channelId: string, patch: Partial<ChannelTariff>) => void;
};

/* ─── Mock generation ─── */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_NAMES = [
  'Анна Иванова',
  'Дмитрий Орлов',
  'Екатерина Петрова',
  'Максим Соколов',
  'Ольга Кузнецова',
  'Павел Смирнов',
  'София Лебедева',
  'Роман Федоров',
  'Юлия Никитина',
  'Артём Волков',
  'Мария Захарова',
  'Илья Громов',
];

function generateSnapshot(channelId: string): MonetizationSnapshot {
  const seed = hashString(channelId);
  const rand = mulberry32(seed);
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const price = 199 + Math.floor(rand() * 9) * 50;
  const baseSubs = 40 + Math.floor(rand() * 260);

  const series_30d: RevenuePoint[] = [];
  let subs = baseSubs;
  for (let i = 29; i >= 0; i--) {
    const newSubs = Math.floor(rand() * 8);
    const churned = Math.floor(rand() * 4);
    subs = Math.max(10, subs + newSubs - churned);
    const revenue = Math.floor(subs * price * 100 * (0.03 + rand() * 0.03));
    series_30d.push({
      ts: now - i * DAY,
      revenue_cents: revenue,
      new_subs: newSubs,
      churned,
    });
  }

  const activeSubscribers = subs;
  const mrrCents = activeSubscribers * price * 100;
  const revenue30d = series_30d.reduce((sum, p) => sum + p.revenue_cents, 0);
  const totalChurn = series_30d.reduce((sum, p) => sum + p.churned, 0);
  const churnRate = Math.min(1, totalChurn / Math.max(1, activeSubscribers));

  const subscribers: PaidSubscriber[] = Array.from({ length: Math.min(8, activeSubscribers) }).map(
    (_, i) => {
      const name = MOCK_NAMES[(seed + i) % MOCK_NAMES.length];
      const sinceDays = Math.floor(rand() * 180) + 1;
      const daysToRenew = Math.floor(rand() * 30);
      return {
        id: `${channelId}-sub-${i}`,
        name,
        avatar_url: null,
        since_ts: now - sinceDays * DAY,
        renews_ts: now + daysToRenew * DAY,
        status: rand() > 0.92 ? 'grace' : rand() > 0.96 ? 'cancelled' : 'active',
      };
    },
  );

  const events: MonetizationEvent[] = Array.from({ length: 10 }).map((_, i) => {
    const kinds: MonetizationEvent['kind'][] = [
      'new_subscription',
      'renewal',
      'renewal',
      'renewal',
      'cancellation',
    ];
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const name = MOCK_NAMES[(seed + i * 3) % MOCK_NAMES.length];
    return {
      id: `${channelId}-evt-${i}`,
      kind,
      user_name: name,
      amount_cents:
        kind === 'cancellation' || kind === 'refund' ? 0 : price * 100,
      ts: now - Math.floor(rand() * 7 * DAY),
    };
  });
  events.sort((a, b) => b.ts - a.ts);

  return {
    tariff: {
      enabled: true,
      price_cents: price * 100,
      currency: 'RUB',
      period: 'month',
      description: 'Доступ ко всем платным постам, закрытому обсуждению и голосовым чатам канала.',
      trial_days: 0,
    },
    mrr_cents: mrrCents,
    active_subscribers: activeSubscribers,
    revenue_30d_cents: revenue30d,
    churn_rate: churnRate,
    series_30d,
    subscribers,
    events,
    payout_available_cents: Math.floor(revenue30d * 0.7),
    payout_pending_cents: Math.floor(revenue30d * 0.1),
    next_payout_ts: now + 5 * DAY,
  };
}

/* ─── Store ─── */

export const monetizationStore = create<MonetizationState & MonetizationActions>((set, get) => ({
  byChannelId: {},

  load: (channelId) => {
    const existing = get().byChannelId[channelId];
    if (existing) return existing;
    const snap = generateSnapshot(channelId);
    set((state) => ({ byChannelId: { ...state.byChannelId, [channelId]: snap } }));
    return snap;
  },

  updateTariff: (channelId, patch) => {
    set((state) => {
      const current = state.byChannelId[channelId];
      if (!current) return state;
      return {
        byChannelId: {
          ...state.byChannelId,
          [channelId]: { ...current, tariff: { ...current.tariff, ...patch } },
        },
      };
    });
  },
}));

/* ─── Helpers ─── */

export function formatMoney(cents: number, currency = 'RUB'): string {
  const rubles = Math.round(cents / 100);
  const symbol = currency === 'RUB' ? '₽' : currency;
  const grouped = rubles.toLocaleString('ru-RU');
  return `${grouped} ${symbol}`;
}

export function formatPeriod(period: SubscriptionPeriod): string {
  return period === 'month' ? 'в месяц' : 'в год';
}
