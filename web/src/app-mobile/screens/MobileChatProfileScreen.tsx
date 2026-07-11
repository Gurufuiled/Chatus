import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChatsQuery,
  useDeleteChatMutation,
  useMuteChatMutation,
} from '@/queries/chats.queries';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useUserDetailQuery } from '@/queries/users.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { ImageLightbox } from '@/features/conversation/ImageLightbox';
import { resolveMediaUrl } from '@/services/mediaService';
import type { AuthUser } from '@/types/auth';
import type { MappedMessage } from '@/types/message';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { isUserBlocked, setUserBlocked } from '../utils/blockedUsersStorage';
import { MobileChatProfileHero } from '../components/MobileChatProfileHero';
import {
  MobileChatProfileMediaSection,
  buildFileSubtitle,
  getFileExtension,
  type FileItem,
  type LinkItem,
  type MediaTile,
  type ProfileTabKey,
  type VoiceItem,
} from '../components/MobileChatProfileMediaSection';

interface MobileChatProfileScreenProps {
  chatId: string;
}

const PROFILE_MEDIA_SCAN_LIMIT = 500;

type InfoRow = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

function formatPresence(isOnline?: boolean, lastSeen?: number | null): string {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';

  const date = new Date(lastSeen);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMins < 1) return 'был(а) только что';
  if (diffMins < 60) return `был(а) ${diffMins} мин. назад`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return `был(а) сегодня в ${date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  return `был(а) ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

function formatBirthdayWithYear(ms: number): string {
  return new Date(ms).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMessageDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
  const [first, second] = octets;
  if (first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}

function isExternalLinkCandidate(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    if (!hostname) return false;
    if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) {
      return false;
    }
    if (isPrivateIpv4(hostname)) return false;
    if (url.pathname.startsWith('/uploads/')) return false;
    return true;
  } catch {
    return false;
  }
}

function extractLinks(content: string | null | undefined): string[] {
  if (!content) return [];
  return (content.match(/https?:\/\/[^\s]+/gi) ?? []).filter(isExternalLinkCandidate);
}

function buildInfoRows(
  profile: AuthUser | null | undefined,
  fallback?: { phone?: string | null; handle?: string | null; username?: string | null },
): InfoRow[] {
  const rows: InfoRow[] = [];
  const phone = profile?.phone?.trim() || fallback?.phone?.trim();
  if (phone) {
    rows.push({
      id: 'phone',
      label: 'Мобильный',
      value: phone,
      accent: true,
    });
  }

  const handle = profile?.handle?.trim() || fallback?.handle?.trim();
  const username = profile?.username?.trim() || fallback?.username?.trim();
  if (handle || username) {
    rows.push({
      id: 'username',
      label: 'Имя пользователя',
      value: handle ? `@${handle}` : username || 'Не указано',
      accent: true,
    });
  }

  if (profile?.birthday != null && profile.birthday > 0) {
    rows.push({
      id: 'birthday',
      label: 'День рождения',
      value: formatBirthdayWithYear(profile.birthday),
    });
  }

  if (profile?.bio?.trim()) {
    rows.push({
      id: 'bio',
      label: 'О себе',
      value: profile.bio.trim(),
    });
  }

  return rows;
}

function resolveVoiceUri(message: MappedMessage): string | null {
  const media = message.media?.[0];
  const candidates = [media?.remote_url, message.content];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    return resolveMediaUrl(candidate);
  }
  return null;
}

export function MobileChatProfileScreen({ chatId }: MobileChatProfileScreenProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading } = useChatsQuery();
  const { data: messages } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const muteChat = useMuteChatMutation();
  const deleteChat = useDeleteChatMutation();
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>('media');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deletePhase, setDeletePhase] = useState(false);
  const [blockedTick, setBlockedTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const chat = chats?.find((c) => c.id === chatId);

  const peer = useMemo(() => {
    if (!chat || chat.chat_type !== 'private') return null;
    return chat.members?.find((m) => m.user_id !== me?.id) ?? null;
  }, [chat, me?.id]);

  const peerUserId = peer?.user_id;
  const {
    data: peerDetail,
    isLoading: peerLoading,
    isError: peerError,
    error: peerQueryError,
  } = useUserDetailQuery(peerUserId);

  const displayName = chat ? getChatDisplayName(chat) : 'Профиль';
  const avatarSrc = resolveAvatarSrc(peerDetail?.avatar_url ?? chat?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const handleLabel = peerDetail?.handle?.trim()
    ? `@${peerDetail.handle.trim()}`
    : peer?.user?.handle?.trim()
      ? `@${peer.user.handle.trim()}`
      : null;

  const statusLabel = useMemo(() => {
    if (!chat) return '';
    if (chat.chat_type === 'group') {
      return `${chat.members?.length ?? 0} участников`;
    }
    const user = peerDetail ?? peer?.user;
    return formatPresence(user?.is_online, user?.last_seen ?? null);
  }, [chat, peer, peerDetail]);

  const infoRows = useMemo(
    () =>
      buildInfoRows(peerDetail, {
        phone: peer?.user?.phone,
        handle: peer?.user?.handle,
        username: peer?.user?.username,
      }),
    [peerDetail, peer?.user],
  );

  const isMuted = Boolean(chat?.is_muted);
  const blocked = useMemo(
    () => (peerUserId ? isUserBlocked(peerUserId) : false),
    [peerUserId, blockedTick],
  );

  const profileMessagesSlice = useMemo(() => {
    const list = messages ?? [];
    return list.length > PROFILE_MEDIA_SCAN_LIMIT
      ? list.slice(0, PROFILE_MEDIA_SCAN_LIMIT)
      : list;
  }, [messages]);

  const mediaItems = useMemo<MediaTile[]>(() => {
    const tiles: MediaTile[] = [];
    for (const message of profileMessagesSlice) {
      if (message.is_deleted) continue;
      if (message.msg_type !== 'image' && message.msg_type !== 'video') continue;
      const entries = (message.media ?? []).filter((m) => m.remote_url?.trim());
      entries.forEach((m, idx) => {
        const url = resolveMediaUrl(m.remote_url!);
        const thumb = m.thumbnail_url ? resolveMediaUrl(m.thumbnail_url) : url;
        const mt = (m.media_type ?? '').toLowerCase();
        const kind: 'image' | 'video' =
          mt === 'video' || message.msg_type === 'video' ? 'video' : 'image';
        tiles.push({
          id: `${message.id}:${idx}`,
          kind,
          url,
          thumb,
          durationMs: kind === 'video' ? m.duration_ms ?? undefined : undefined,
        });
      });
    }
    return tiles;
  }, [profileMessagesSlice]);

  const fileItems = useMemo<FileItem[]>(
    () =>
      profileMessagesSlice
        .filter((message) => !message.is_deleted && message.msg_type === 'file')
        .map((message) => {
          const media = message.media?.[0];
          return {
            id: message.id,
            title: media?.file_name || 'Файл',
            subtitle: buildFileSubtitle(media?.file_size, message.created_at),
            uri: media?.remote_url ? resolveMediaUrl(media.remote_url) : null,
            extension: getFileExtension(media?.file_name || 'FILE'),
          };
        }),
    [profileMessagesSlice],
  );

  const voiceItems = useMemo<VoiceItem[]>(
    () =>
      profileMessagesSlice
        .filter(
          (message) =>
            !message.is_deleted &&
            (message.msg_type === 'voice' || message.msg_type === 'video_note'),
        )
        .map((message) => ({
          id: message.id,
          kind: message.msg_type === 'video_note' ? 'video_note' : 'voice',
          title: message.sender_id === me?.id ? 'Вы' : displayName,
          durationMs: message.media?.[0]?.duration_ms ?? 0,
          dateLabel: formatMessageDate(message.created_at),
          uri: resolveVoiceUri(message),
          thumbnailUri: message.media?.[0]?.thumbnail_url
            ? resolveMediaUrl(message.media[0].thumbnail_url)
            : undefined,
        })),
    [profileMessagesSlice, me?.id, displayName],
  );

  const linkItems = useMemo<LinkItem[]>(
    () =>
      profileMessagesSlice.flatMap((message) =>
        message.is_deleted
          ? []
          : extractLinks(message.content).map((link, index) => ({
              id: `${message.id}-${index}`,
              title: link.replace(/^https?:\/\//, ''),
              subtitle: formatMessageDate(message.created_at),
              uri: link,
            })),
      ),
    [profileMessagesSlice],
  );

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setDeletePhase(false);
      }
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        moreButtonRef.current?.contains(target) ||
        (target instanceof Element && target.closest('.mobile-chat-profile__more-menu'))
      ) {
        return;
      }
      setMoreOpen(false);
      setDeletePhase(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [moreOpen]);

  const handleMute = () => {
    if (!chat) return;
    muteChat.mutate({ chatId, muted: !isMuted });
  };

  const handleDelete = (scope: 'me' | 'all') => {
    setActionError(null);
    deleteChat.mutate(
      { chatId, scope },
      {
        onSuccess: () => {
          setMoreOpen(false);
          setDeletePhase(false);
          void navigate({ to: '/' });
        },
        onError: (err) => {
          setActionError(err instanceof Error ? err.message : 'Не удалось удалить чат');
        },
      },
    );
  };

  const handleToggleBlock = () => {
    if (!peerUserId) return;
    if (blocked) {
      if (
        !window.confirm(
          `${displayName} снова сможет писать вам (локально на этом устройстве). Разблокировать?`,
        )
      ) {
        return;
      }
      setUserBlocked(peerUserId, false);
      setBlockedTick((n) => n + 1);
      setMoreOpen(false);
      return;
    }
    if (
      !window.confirm(
        `Заблокировать ${displayName}? Это локальная отметка только на этом устройстве.`,
      )
    ) {
      return;
    }
    setUserBlocked(peerUserId, true);
    setBlockedTick((n) => n + 1);
    setMoreOpen(false);
  };

  if (isLoading) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if (!chat) {
    return (
      <div className="mobile-chat-profile">
        <header className="mobile-chat-profile__toolbar">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Профиль</span>
        </header>
        <p className="mobile-chat-profile__empty">Чат не найден</p>
      </div>
    );
  }

  const peerErrorMessage =
    peerError && peerQueryError instanceof Error
      ? peerQueryError.message
      : peerError
        ? 'Не удалось загрузить профиль'
        : null;

  return (
    <div className="mobile-chat-profile">
      <div className="mobile-chat-profile__scroll">
        <MobileChatProfileHero
          avatarSrc={avatarSrc}
          avatarColor={getAvatarColor(displayName)}
          initial={initial}
          displayName={displayName}
          statusLabel={statusLabel}
          handleLabel={handleLabel}
          loading={peerLoading}
          error={peerErrorMessage}
          isMuted={isMuted}
          onBack={() => navigate({ to: '/chat/$chatId', params: { chatId } })}
          onMute={handleMute}
          onMore={() => {
            setDeletePhase(false);
            setMoreOpen((open) => !open);
          }}
          moreButtonRef={moreButtonRef}
        />

        {infoRows.length > 0 ? (
          <section className="mobile-chat-profile__info-card">
            {infoRows.map((row, index) => (
              <div key={row.id}>
                <div className="mobile-chat-profile__info-row">
                  <div className="mobile-chat-profile__info-text">
                    <span className="mobile-chat-profile__info-label">{row.label}</span>
                    <span
                      className={`mobile-chat-profile__info-value${
                        row.accent ? ' mobile-chat-profile__info-value--accent' : ''
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                </div>
                {index !== infoRows.length - 1 ? (
                  <div className="mobile-chat-profile__info-divider" />
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <MobileChatProfileMediaSection
          activeTab={activeTab}
          mediaItems={mediaItems}
          fileItems={fileItems}
          voiceItems={voiceItems}
          linkItems={linkItems}
          onChangeTab={setActiveTab}
          onOpenMedia={(index) => {
            const item = mediaItems[index];
            if (!item) return;
            if (item.kind === 'video') {
              window.open(item.url, '_blank', 'noopener,noreferrer');
              return;
            }
            setLightboxSrc(item.url);
          }}
        />

        {actionError ? (
          <p className="mobile-chat-profile__action-error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      {moreOpen ? (
        <div className="mobile-chat-profile__more-backdrop">
          <div
            className="mobile-chat-profile__more-menu"
            role="menu"
            style={
              moreButtonRef.current
                ? {
                    top: moreButtonRef.current.getBoundingClientRect().bottom + 8,
                    right: Math.max(
                      12,
                      window.innerWidth - moreButtonRef.current.getBoundingClientRect().right,
                    ),
                  }
                : undefined
            }
          >
            {!deletePhase ? (
              <>
                <button
                  type="button"
                  className="mobile-chat-profile__more-item"
                  role="menuitem"
                  onClick={() => setDeletePhase(true)}
                >
                  Удалить чат
                </button>
                {peerUserId ? (
                  <button
                    type="button"
                    className={`mobile-chat-profile__more-item${
                      blocked ? '' : ' mobile-chat-profile__more-item--danger'
                    }`}
                    role="menuitem"
                    onClick={handleToggleBlock}
                  >
                    {blocked ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="mobile-chat-profile__delete-panel">
                <button
                  type="button"
                  className="mobile-chat-profile__more-item"
                  onClick={() => setDeletePhase(false)}
                >
                  ← Назад
                </button>
                <p className="mobile-chat-profile__delete-hint">
                  Удалить переписку с {displayName}?
                </p>
                <button
                  type="button"
                  className="mobile-chat-profile__more-item mobile-chat-profile__more-item--danger"
                  disabled={deleteChat.isPending}
                  onClick={() => handleDelete('me')}
                >
                  Удалить только у меня
                </button>
                {chat.chat_type === 'private' ? (
                  <button
                    type="button"
                    className="mobile-chat-profile__more-item mobile-chat-profile__more-item--danger"
                    disabled={deleteChat.isPending}
                    onClick={() => handleDelete('all')}
                  >
                    Удалить у обоих
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {lightboxSrc ? (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      ) : null}
    </div>
  );
}
