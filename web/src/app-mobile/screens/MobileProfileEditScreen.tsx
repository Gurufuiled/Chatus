import { ProfileEditPage } from '@/features/profile/ProfileEditPage';

/** Mobile shell wrapper around embed profile edit form. */
export function MobileProfileEditScreen() {
  return (
    <div className="mobile-profile-embed">
      <ProfileEditPage />
    </div>
  );
}
