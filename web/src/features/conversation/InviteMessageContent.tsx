import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useJoinGroupByInviteMutation, useResolveGroupInviteQuery } from '@/queries/chats.queries';
import { resolveGroupInvite } from '@/services/chatService';
import { ApiError } from '@/services/apiClient';
import {
  findInviteMatches,
  isInviteOnlyMessage,
} from './inviteLinkUtils';
import { IconInviteLink } from './groupSettingsIcons';

interface InviteMessageContentProps {
  content: string;
  selectionActive?: boolean;
}

function formatMemberCount(count: number): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return `${count} участников`;
  if (n1 === 1) return `${count} участник`;
  if (n1 >= 2 && n1 <= 4) return `${count} участника`;
  return `${count} участников`;
}

export function InviteMessageContent({
  content,
  selectionActive = false,
}: InviteMessageContentProps) {
  const navigate = useNavigate();
  const joinGroup = useJoinGroupByInviteMutation();
  const [error, setError] = useState<string | null>(null);
  const [joiningToken, setJoiningToken] = useState<string | null>(null);

  const inviteOnly = isInviteOnlyMessage(content);
  const inviteOnlyToken = inviteOnly
    ? findInviteMatches(content.trim())[0]?.token
    : undefined;
  const previewQuery = useResolveGroupInviteQuery(inviteOnlyToken, Boolean(inviteOnlyToken));

  const handleJoin = async (token: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionActive || joinGroup.isPending || joiningToken) return;
    setError(null);
    try {
      let previewName: string | null = previewQuery.data?.name?.trim() || null;
      let memberCount: number | null = previewQuery.data?.member_count ?? null;
      if (!previewName) {
        try {
          const preview = await resolveGroupInvite(token);
          previewName = preview.name?.trim() || null;
          memberCount = preview.member_count;
        } catch {
          // Preview optional — still allow join if resolve fails (revoked handled by join).
        }
      }
      const label = previewName
        ? `Присоединиться к группе «${previewName}»${
            memberCount != null ? ` (${formatMemberCount(memberCount)})` : ''
          }?`
        : 'Присоединиться к группе по этой ссылке?';
      if (!window.confirm(label)) {
        return;
      }
      setJoiningToken(token);
      const chat = await joinGroup.mutateAsync(token);
      setJoiningToken(null);
      void navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
    } catch (err) {
      setJoiningToken(null);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Не удалось присоединиться';
      setError(message);
    }
  };

  if (inviteOnly) {
    const token = inviteOnlyToken;
    if (!token) {
      return <p className="message-bubble__text">{content}</p>;
    }
    const busy = joiningToken === token;
    const previewName = previewQuery.data?.name?.trim() || null;
    const memberCount = previewQuery.data?.member_count;
    const title = previewName || 'Приглашение в группу';
    const subtitle =
      memberCount != null
        ? formatMemberCount(memberCount)
        : previewQuery.isLoading
          ? 'Загрузка…'
          : null;
    return (
      <div className="message-invite-card">
        <button
          type="button"
          className="message-invite-card__btn"
          disabled={selectionActive || Boolean(joiningToken)}
          onClick={(e) => void handleJoin(token, e)}
        >
          <span className="message-invite-card__icon" aria-hidden>
            <IconInviteLink size={28} />
          </span>
          <span className="message-invite-card__body">
            <span className="message-invite-card__title">{title}</span>
            {subtitle ? (
              <span className="message-invite-card__subtitle">{subtitle}</span>
            ) : null}
            <span className="message-invite-card__action">
              {busy ? 'Подключение…' : 'Присоединиться к группе'}
            </span>
            <span className="message-invite-card__url">{content.trim()}</span>
          </span>
        </button>
        {error ? (
          <p className="message-invite-card__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const matches = findInviteMatches(content);
  if (matches.length === 0) {
    return <p className="message-bubble__text">{content}</p>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, i) => {
    if (match.index > cursor) {
      nodes.push(content.slice(cursor, match.index));
    }
    const busy = joiningToken === match.token;
    nodes.push(
      <button
        key={`invite-${i}-${match.token}`}
        type="button"
        className="message-bubble__invite-link"
        disabled={selectionActive || Boolean(joiningToken)}
        onClick={(e) => void handleJoin(match.token, e)}
      >
        {busy ? 'Подключение…' : match.raw}
      </button>,
    );
    cursor = match.index + match.length;
  });
  if (cursor < content.length) {
    nodes.push(content.slice(cursor));
  }

  return (
    <div className="message-bubble__text-with-invites">
      <p className="message-bubble__text">{nodes}</p>
      {error ? (
        <p className="message-invite-card__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
