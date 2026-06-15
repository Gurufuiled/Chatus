import { Avatar } from '@/components/avatar/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { resolveMediaUrl } from '@/services/mediaService';
import type { AuthUser } from '@/types/auth';
import { getUserDisplayName, getUserSubtitle } from './userSearchFormatters';

interface UserSearchResultItemProps {
  user: AuthUser;
  disabled?: boolean;
  onSelect: (user: AuthUser) => void;
}

export function UserSearchResultItem({
  user,
  disabled = false,
  onSelect,
}: UserSearchResultItemProps) {
  const displayName = getUserDisplayName(user);
  const subtitle = getUserSubtitle(user);
  const avatarUrl = user.avatar_url ? resolveMediaUrl(user.avatar_url) : null;

  return (
    <button
      type="button"
      className="user-search-result"
      disabled={disabled}
      onClick={() => onSelect(user)}
    >
      <Avatar name={displayName} imageUrl={avatarUrl} size={52} />
      <div className="user-search-result__body">
        <span className="user-search-result__name">{displayName}</span>
        <span className="user-search-result__subtitle">{subtitle}</span>
      </div>
      {disabled ? <Spinner label="Opening chat" /> : null}
    </button>
  );
}
