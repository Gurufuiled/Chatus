import { create } from 'zustand';
import type { Chat, Message } from './types';
import type { ChannelMemberItem, ChannelPermissions } from '../services/channelService';

export type ChannelDetail = {
  channel: Chat;
  preview_posts: Message[];
  can_view_full_feed: boolean;
  can_comment: boolean;
  can_react: boolean;
  can_post: boolean;
  is_subscribed: boolean;
  linked_discussion_chat_id: string | null;
  channel_permissions?: ChannelPermissions;
};

type DiscussionThread = {
  discussion_chat_id: string;
  thread_root_message_id: string;
  can_comment: boolean;
  post: Message | null;
  messages: Message[];
};

type ChannelState = {
  catalog: Chat[];
  detailsById: Record<string, ChannelDetail>;
  feedByChannelId: Record<string, Message[]>;
  discussionByKey: Record<string, DiscussionThread>;
  checkoutStateByChannelId: Record<string, 'idle' | 'processing' | 'paid' | 'error'>;
  membersByKey: Record<
    string,
    {
      items: ChannelMemberItem[];
      next_cursor: string | null;
      updated_at: number;
    }
  >;
  isLoadingCatalog: boolean;
};

type ChannelActions = {
  setCatalog: (catalog: Chat[]) => void;
  setLoadingCatalog: (loading: boolean) => void;
  upsertChannel: (channel: Chat) => void;
  setDetail: (channelId: string, detail: ChannelDetail) => void;
  setFeed: (channelId: string, messages: Message[]) => void;
  prependFeedPost: (channelId: string, message: Message) => void;
  updateFeedMessage: (channelId: string, messageId: string, updates: Partial<Message>) => void;
  setDiscussion: (key: string, thread: DiscussionThread) => void;
  prependDiscussionMessage: (key: string, message: Message) => void;
  updateDiscussionMessage: (key: string, messageId: string, updates: Partial<Message>) => void;
  setCheckoutState: (
    channelId: string,
    state: 'idle' | 'processing' | 'paid' | 'error'
  ) => void;
  setMembersByKey: (
    key: string,
    payload: { items: ChannelMemberItem[]; next_cursor: string | null }
  ) => void;
  clear: () => void;
};

const initialState: ChannelState = {
  catalog: [],
  detailsById: {},
  feedByChannelId: {},
  discussionByKey: {},
  checkoutStateByChannelId: {},
  membersByKey: {},
  isLoadingCatalog: false,
};

export const channelStore = create<ChannelState & ChannelActions>((set) => ({
  ...initialState,

  setCatalog: (catalog) => set({ catalog }),
  setLoadingCatalog: (loading) => set({ isLoadingCatalog: loading }),

  upsertChannel: (channel) =>
    set((state) => {
      const existingIndex = state.catalog.findIndex((item) => item.id === channel.id);
      const nextCatalog = [...state.catalog];
      if (existingIndex >= 0) {
        nextCatalog[existingIndex] = channel;
      } else {
        nextCatalog.unshift(channel);
      }

      const existingDetail = state.detailsById[channel.id];
      return {
        catalog: nextCatalog,
        detailsById: existingDetail
          ? {
              ...state.detailsById,
              [channel.id]: {
                ...existingDetail,
                channel,
              },
            }
          : state.detailsById,
      };
    }),

  setDetail: (channelId, detail) =>
    set((state) => ({
      detailsById: {
        ...state.detailsById,
        [channelId]: detail,
      },
      feedByChannelId: {
        ...state.feedByChannelId,
        [channelId]: detail.preview_posts,
      },
      catalog: state.catalog.some((item) => item.id === channelId)
        ? state.catalog.map((item) => (item.id === channelId ? detail.channel : item))
        : [detail.channel, ...state.catalog],
    })),

  setFeed: (channelId, messages) =>
    set((state) => ({
      feedByChannelId: {
        ...state.feedByChannelId,
        [channelId]: messages,
      },
    })),

  prependFeedPost: (channelId, message) =>
    set((state) => {
      const existing = state.feedByChannelId[channelId] ?? [];
      if (existing.some((item) => item.id === message.id)) {
        return state;
      }
      return {
        feedByChannelId: {
          ...state.feedByChannelId,
          [channelId]: [message, ...existing],
        },
      };
    }),

  updateFeedMessage: (channelId, messageId, updates) =>
    set((state) => {
      const existing = state.feedByChannelId[channelId] ?? [];
      return {
        feedByChannelId: {
          ...state.feedByChannelId,
          [channelId]: existing.map((item) =>
            item.id === messageId ? { ...item, ...updates } : item
          ),
        },
      };
    }),

  setDiscussion: (key, thread) =>
    set((state) => ({
      discussionByKey: {
        ...state.discussionByKey,
        [key]: thread,
      },
    })),

  prependDiscussionMessage: (key, message) =>
    set((state) => {
      const existing = state.discussionByKey[key];
      if (!existing || existing.messages.some((item) => item.id === message.id)) {
        return state;
      }
      return {
        discussionByKey: {
          ...state.discussionByKey,
          [key]: {
            ...existing,
            messages: [message, ...existing.messages],
          },
        },
      };
    }),

  updateDiscussionMessage: (key, messageId, updates) =>
    set((state) => {
      const existing = state.discussionByKey[key];
      if (!existing) {
        return state;
      }
      return {
        discussionByKey: {
          ...state.discussionByKey,
          [key]: {
            ...existing,
            messages: existing.messages.map((item) =>
              item.id === messageId ? { ...item, ...updates } : item
            ),
          },
        },
      };
    }),

  setCheckoutState: (channelId, checkoutState) =>
    set((state) => ({
      checkoutStateByChannelId: {
        ...state.checkoutStateByChannelId,
        [channelId]: checkoutState,
      },
    })),

  setMembersByKey: (key, payload) =>
    set((state) => ({
      membersByKey: {
        ...state.membersByKey,
        [key]: {
          items: payload.items,
          next_cursor: payload.next_cursor,
          updated_at: Date.now(),
        },
      },
    })),

  clear: () => set(initialState),
}));
