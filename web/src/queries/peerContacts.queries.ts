import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deletePeerContact,
  listPeerContacts,
  upsertPeerContact,
} from '@/services/peerContactService';
import { useAuthUiStore } from '@/stores/authUiStore';
import type { PeerContactCustomization, UpsertPeerContactPayload } from '@/types/peerContact';
import {
  formatPeerLocalDisplayName,
  getPrivateChatPeerUserId,
} from '@/features/contacts/peerContactDisplay';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { useMeQuery } from '@/queries/auth.queries';
import type { ChatSummary } from '@/types/chat';

export const peerContactsQueryKey = ['users', 'me', 'peer-contacts'] as const;

export function usePeerContactsQuery() {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: peerContactsQueryKey,
    queryFn: listPeerContacts,
    enabled: ready,
    staleTime: 60_000,
  });
}

export function usePeerContactsMap(): Map<string, PeerContactCustomization> {
  const { data } = usePeerContactsQuery();
  return useMemo(() => {
    const map = new Map<string, PeerContactCustomization>();
    for (const row of data ?? []) {
      map.set(row.peer_user_id, row);
    }
    return map;
  }, [data]);
}

export function useChatDisplayName(chat: ChatSummary, meId?: string | null): string {
  const { data: me } = useMeQuery();
  const map = usePeerContactsMap();
  const ownerId = meId ?? me?.id;
  const peerId = getPrivateChatPeerUserId(chat, ownerId);
  const localName = peerId ? formatPeerLocalDisplayName(map.get(peerId)) : null;
  return getChatDisplayName(chat, localName);
}

export function useUpsertPeerContactMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      peerUserId,
      payload,
    }: {
      peerUserId: string;
      payload: UpsertPeerContactPayload;
    }) => upsertPeerContact(peerUserId, payload),
    onSuccess: (row) => {
      queryClient.setQueryData<PeerContactCustomization[]>(peerContactsQueryKey, (prev) => {
        const list = prev ? [...prev] : [];
        const idx = list.findIndex((c) => c.peer_user_id === row.peer_user_id);
        const empty =
          !row.first_name?.trim() && !row.last_name?.trim() && !row.note?.trim();
        if (empty) {
          if (idx >= 0) list.splice(idx, 1);
          return list;
        }
        if (idx >= 0) list[idx] = row;
        else list.unshift(row);
        return list;
      });
    },
  });
}

export function useDeletePeerContactMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (peerUserId: string) => deletePeerContact(peerUserId),
    onSuccess: (_data, peerUserId) => {
      queryClient.setQueryData<PeerContactCustomization[]>(peerContactsQueryKey, (prev) =>
        (prev ?? []).filter((c) => c.peer_user_id !== peerUserId),
      );
    },
  });
}
