import type { ReactNode } from 'react';

export type MobileChatProfileHeroProps = {
  avatarSrc: string | null;
  avatarColor: string;
  initial: string;
  displayName: string;
  statusLabel: string;
  handleLabel: string | null;
  loading?: boolean;
  error?: string | null;
  isMuted: boolean;
  onBack: () => void;
  onEdit?: () => void;
  onMute: () => void;
  onMore: () => void;
  moreButtonRef?: React.Ref<HTMLButtonElement>;
};

function QuickActionIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {children}
    </svg>
  );
}

export function MobileChatProfileHero({
  avatarSrc,
  avatarColor,
  initial,
  displayName,
  statusLabel,
  handleLabel,
  loading = false,
  error = null,
  isMuted,
  onBack,
  onEdit,
  onMute,
  onMore,
  moreButtonRef,
}: MobileChatProfileHeroProps) {
  return (
    <div className="mobile-chat-profile__hero-card">
      <div className="mobile-chat-profile__hero-top">
        <button
          type="button"
          className="mobile-chat-profile__nav-bubble"
          onClick={onBack}
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {onEdit ? (
          <button type="button" className="mobile-chat-profile__edit-bubble" onClick={onEdit}>
            Изм.
          </button>
        ) : (
          <span className="mobile-chat-profile__edit-bubble mobile-chat-profile__edit-bubble--spacer" />
        )}
      </div>

      {avatarSrc ? (
        <img className="mobile-chat-profile__avatar mobile-chat-profile__avatar--hero" src={avatarSrc} alt="" />
      ) : (
        <div
          className="mobile-chat-profile__avatar-fallback mobile-chat-profile__avatar--hero"
          style={{ backgroundColor: avatarColor }}
        >
          {initial}
        </div>
      )}

      <h1 className="mobile-chat-profile__name">{displayName}</h1>
      <p className="mobile-chat-profile__status">{statusLabel}</p>
      {handleLabel ? <p className="mobile-chat-profile__handle">{handleLabel}</p> : null}

      <div className="mobile-chat-profile__quick-actions">
        <button type="button" className="mobile-chat-profile__quick-action" onClick={onMute}>
          <span className="mobile-chat-profile__quick-action-icon" aria-hidden>
            {isMuted ? (
              <QuickActionIcon>
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </QuickActionIcon>
            ) : (
              <QuickActionIcon>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </QuickActionIcon>
            )}
          </span>
          <span className="mobile-chat-profile__quick-action-label">Звук</span>
        </button>

        <button
          ref={moreButtonRef}
          type="button"
          className="mobile-chat-profile__quick-action"
          onClick={onMore}
        >
          <span className="mobile-chat-profile__quick-action-icon" aria-hidden>
            <QuickActionIcon>
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </QuickActionIcon>
          </span>
          <span className="mobile-chat-profile__quick-action-label">Ещё</span>
        </button>
      </div>

      {loading ? (
        <p className="mobile-chat-profile__hero-loading">Загружаем профиль...</p>
      ) : null}
      {!loading && error ? <p className="mobile-chat-profile__hero-error">{error}</p> : null}
    </div>
  );
}
