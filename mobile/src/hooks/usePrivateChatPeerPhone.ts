import { useEffect, useMemo, useState } from 'react';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { contactsStore } from '../stores/contactsStore';
import { getPrivateChatPeerUserId } from '../screens/chatScreen.shared';
import { UserDao } from '../db/dao/UserDao';
import { listAddressBookContacts } from '../services/contactService';
import { getUserProfile } from '../services/profileService';
import { SyncService } from '../services/SyncService';
import { normalizePhoneForTdlib } from '../utils/telegramPhone';
import type { Chat } from '../stores/types';

function phoneFromChatMembers(chat: Chat | null | undefined, peerUserId: string | null): string | undefined {
  if (!peerUserId || !chat?.members?.length) return undefined;
  const member = chat.members.find((m) => m.user_id === peerUserId);
  const raw = member?.user?.phone;
  if (!raw?.trim()) return undefined;
  return normalizePhoneForTdlib(raw);
}

function phoneFromContactsBook(peerUserId: string | null): string | undefined {
  if (!peerUserId) return undefined;
  const hit = contactsStore
    .getState()
    .phoneBookContacts.find((c) => c.chatusUserId === peerUserId && c.phoneNumber);
  if (!hit) return undefined;
  return normalizePhoneForTdlib(hit.phoneNumber);
}

/**
 * Телефон собеседника в личном чате Chatus — для моста TDLib / выбора «Отправить в Telegram».
 */
export function usePrivateChatPeerPhone(chatId: string): string | undefined {
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const chat = chatStore((s) => s.chats.find((c) => c.id === chatId) ?? null);
  const phoneBookVersion = contactsStore((s) => s.phoneBookContacts);

  const peerUserId = useMemo(
    () => getPrivateChatPeerUserId(chat, currentUserId),
    [chat, currentUserId],
  );

  const inlinePhone = useMemo(() => {
    if (chat?.chat_type !== 'private') return undefined;
    return phoneFromChatMembers(chat, peerUserId) ?? phoneFromContactsBook(peerUserId);
  }, [chat, peerUserId, phoneBookVersion]);

  const [resolvedPhone, setResolvedPhone] = useState<string | undefined>();

  useEffect(() => {
    if (inlinePhone) {
      setResolvedPhone(undefined);
      return;
    }
    if (!peerUserId || chat?.chat_type !== 'private') {
      setResolvedPhone(undefined);
      return;
    }

    setResolvedPhone(undefined);

    let cancelled = false;
    void (async () => {
      try {
        const userDao = new UserDao();
        const cached = await userDao.getById(peerUserId);
        if (cached?.phone?.trim()) {
          if (!cancelled) {
            setResolvedPhone(normalizePhoneForTdlib(cached.phone));
          }
          return;
        }

        const addressBook = await listAddressBookContacts();
        const linked = addressBook.find((c) => c.linked_user_id === peerUserId && c.phone?.trim());
        if (linked?.phone?.trim()) {
          if (!cancelled) {
            setResolvedPhone(normalizePhoneForTdlib(linked.phone));
          }
          return;
        }

        const profile = await getUserProfile(peerUserId);
        if (!cancelled) {
          setResolvedPhone(
            profile.phone?.trim() ? normalizePhoneForTdlib(profile.phone) : undefined,
          );
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[usePrivateChatPeerPhone] resolve failed', err);
        }
        if (!cancelled) setResolvedPhone(undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, inlinePhone, peerUserId, chat?.chat_type]);

  useEffect(() => {
    if (inlinePhone || resolvedPhone || chat?.chat_type !== 'private') return;
    void SyncService.refreshChats();
  }, [chatId, inlinePhone, resolvedPhone, chat?.chat_type]);

  return inlinePhone ?? resolvedPhone;
}
