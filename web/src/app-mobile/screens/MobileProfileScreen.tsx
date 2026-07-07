import { ProfileSettingsPage } from '@/features/profile/ProfileSettingsPage';

/** Mobile shell wrapper around embed profile view. */
export function MobileProfileScreen() {
  return (
    <div className="mobile-profile-embed">
      <ProfileSettingsPage backTo="/settings" />
    </div>
  );
}
