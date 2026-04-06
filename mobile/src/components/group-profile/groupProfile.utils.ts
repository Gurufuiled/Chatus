import type { ApiUser } from '../../services/AuthService';
import type { GroupMember } from './groupProfile.types';

export function getDisplayNameFromMember(member: GroupMember) {
  return (
    member.user?.display_name?.trim() ||
    member.user?.username?.trim() ||
    member.user?.handle?.trim() ||
    'Пользователь'
  );
}

export function getDisplayName(user: ApiUser) {
  return user.display_name || user.username || user.handle || 'Пользователь';
}
