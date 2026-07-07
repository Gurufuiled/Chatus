import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

interface MobilePillHeaderTitleProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  onClick?: () => void;
}

/** Telegram-style centered pill: avatar + name + optional status. */
export function MobilePillHeaderTitle({
  title,
  subtitle,
  avatarUrl,
  onClick,
}: MobilePillHeaderTitleProps) {
  const avatarSrc = resolveAvatarSrc(avatarUrl);
  const initial = (title.trim()[0] || '?').toUpperCase();
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className="mobile-pill-header-title"
      onClick={onClick}
      aria-label={title}
    >
      {avatarSrc ? (
        <img className="mobile-pill-header-title__avatar" src={avatarSrc} alt="" />
      ) : (
        <div
          className="mobile-pill-header-title__avatar-fallback"
          style={{ backgroundColor: getAvatarColor(title) }}
        >
          {initial}
        </div>
      )}
      <div className="mobile-pill-header-title__text">
        <span className="mobile-pill-header-title__name">{title}</span>
        {subtitle ? <span className="mobile-pill-header-title__subtitle">{subtitle}</span> : null}
      </div>
    </Tag>
  );
}
