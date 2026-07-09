import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchChannelDetail,
  fetchChannelFeed,
  fetchDiscussionThread,
  publishChannelPost,
  sendDiscussionMessage,
  subscribeToChannel,
  toggleChannelReaction,
  unsubscribeFromChannel,
  mockCheckoutChannel,
  updateChannel,
  type ChannelDetail,
  type ChannelFeedResult,
  type DiscussionThreadResult,
} from '@/services/channelService';
import type { MappedMessage } from '@/types/message';
import type { ChatSummary } from '@/types/chat';
import { useAuthUiStore } from '@/stores/authUiStore';
import { chatsQueryKey } from '@/queries/chats.queries';

export const channelDetailQueryKey = (channelId: string) =>
  ['channel', 'detail', channelId] as const;

export const channelFeedQueryKey = (channelId: string) =>
  ['channel', 'feed', channelId] as const;

export const discussionQueryKey = (channelId: string, postId: string) =>
  ['channel', 'discussion', channelId, postId] as const;

function upsertChatInList(
  queryClient: ReturnType<typeof useQueryClient>,
  chat: ChatSummary,
) {
  queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
    if (!old) return [chat];
    const exists = old.some((item) => item.id === chat.id);
    if (exists) {
      return old.map((item) => (item.id === chat.id ? { ...item, ...chat } : item));
    }
    return [chat, ...old];
  });
}

export function useChannelDetailQuery(channelId: string | undefined) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: channelDetailQueryKey(channelId ?? ''),
    queryFn: () => fetchChannelDetail(channelId!),
    enabled: ready && !!channelId,
    staleTime: 30_000,
  });
}

export function useChannelFeedQuery(channelId: string | undefined) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: channelFeedQueryKey(channelId ?? ''),
    queryFn: () => fetchChannelFeed(channelId!),
    enabled: ready && !!channelId,
    staleTime: 15_000,
  });
}

export function useDiscussionThreadQuery(
  channelId: string | undefined,
  postId: string | undefined,
) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: discussionQueryKey(channelId ?? '', postId ?? ''),
    queryFn: () => fetchDiscussionThread(channelId!, postId!),
    enabled: ready && !!channelId && !!postId,
    staleTime: 10_000,
  });
}

export function useSubscribeChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ channelId, inviteToken }: { channelId: string; inviteToken?: string }) =>
      subscribeToChannel(channelId, inviteToken),
    onSuccess: (chat, { channelId }) => {
      upsertChatInList(queryClient, chat);
      void queryClient.invalidateQueries({ queryKey: channelFeedQueryKey(channelId) });
      void queryClient.invalidateQueries({ queryKey: channelDetailQueryKey(channelId) });
    },
  });
}

export function useMockCheckoutChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (channelId: string) => mockCheckoutChannel(channelId),
    onSuccess: (chat, channelId) => {
      upsertChatInList(queryClient, chat);
      void queryClient.invalidateQueries({ queryKey: channelFeedQueryKey(channelId) });
      void queryClient.invalidateQueries({ queryKey: channelDetailQueryKey(channelId) });
    },
  });
}

export function useUnsubscribeChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (channelId: string) => unsubscribeFromChannel(channelId),
    onSuccess: (_data, channelId) => {
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        old?.filter((chat) => chat.id !== channelId),
      );
      void queryClient.invalidateQueries({ queryKey: channelFeedQueryKey(channelId) });
      void queryClient.invalidateQueries({ queryKey: channelDetailQueryKey(channelId) });
    },
  });
}

export function usePublishChannelPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelId,
      content,
      msgType,
      media,
    }: {
      channelId: string;
      content?: string;
      msgType?: string;
      media?: Parameters<typeof publishChannelPost>[1]['media'];
    }) =>
      publishChannelPost(channelId, {
        content: content ?? null,
        msg_type: msgType ?? 'text',
        media,
      }),
    onSuccess: (post, { channelId }) => {
      queryClient.setQueryData<ChannelFeedResult>(channelFeedQueryKey(channelId), (old) => {
        if (!old) return old;
        return { ...old, posts: [...old.posts, post] };
      });
      queryClient.setQueryData<ChannelDetail>(channelDetailQueryKey(channelId), (old) => {
        if (!old) return old;
        return { ...old, preview_posts: [...old.preview_posts, post] };
      });
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

export function useSendDiscussionMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelId,
      postId,
      content,
      replyToId,
    }: {
      channelId: string;
      postId: string;
      content: string;
      replyToId?: string;
    }) =>
      sendDiscussionMessage(channelId, postId, {
        content,
        msg_type: 'text',
        reply_to_id: replyToId ?? null,
      }),
    onSuccess: (message, { channelId, postId }) => {
      queryClient.setQueryData<DiscussionThreadResult>(
        discussionQueryKey(channelId, postId),
        (old) => {
          if (!old) return old;
          return { ...old, messages: [...old.messages, message] };
        },
      );
      queryClient.setQueryData<ChannelFeedResult>(channelFeedQueryKey(channelId), (old) => {
        if (!old) return old;
        return {
          ...old,
          posts: old.posts.map((p) =>
            p.id === postId
              ? { ...p, comment_count: (p.comment_count ?? 0) + 1 }
              : p,
          ),
        };
      });
    },
  });
}

export function useToggleChannelReactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelId,
      postId,
      emoji,
    }: {
      channelId: string;
      postId: string;
      emoji: string;
    }) => toggleChannelReaction(channelId, postId, emoji),
    onSuccess: (reactions, { channelId, postId }) => {
      const patchPost = (post: MappedMessage) =>
        post.id === postId ? { ...post, reactions } : post;

      queryClient.setQueryData<ChannelFeedResult>(channelFeedQueryKey(channelId), (old) => {
        if (!old) return old;
        return { ...old, posts: old.posts.map(patchPost) };
      });
      queryClient.setQueryData<DiscussionThreadResult>(
        discussionQueryKey(channelId, postId),
        (old) => {
          if (!old?.post) return old;
          return { ...old, post: patchPost(old.post) };
        },
      );
    },
  });
}

export function useUpdateChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelId,
      payload,
    }: {
      channelId: string;
      payload: Parameters<typeof updateChannel>[1];
    }) => updateChannel(channelId, payload),
    onSuccess: (chat, { channelId }) => {
      upsertChatInList(queryClient, chat);
      queryClient.setQueryData<ChannelDetail>(channelDetailQueryKey(channelId), (old) => {
        if (!old) return old;
        return { ...old, channel: { ...old.channel, ...chat } };
      });
      queryClient.setQueryData<ChannelFeedResult>(channelFeedQueryKey(channelId), (old) => {
        if (!old) return old;
        return { ...old, channel: { ...old.channel, ...chat } };
      });
      void queryClient.invalidateQueries({ queryKey: channelFeedQueryKey(channelId) });
      void queryClient.invalidateQueries({ queryKey: channelDetailQueryKey(channelId) });
    },
  });
}
