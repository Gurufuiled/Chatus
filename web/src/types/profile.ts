export interface UpdateProfilePayload {
  display_name?: string;
  last_name?: string | null;
  bio?: string | null;
  birthday?: string | null;
  avatar_url?: string;
  handle?: string | null;
}

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  bio: string;
  birthday: string;
  username: string;
}

export const BIO_MAX_LENGTH = 512;
export const DISPLAY_NAME_MAX_LENGTH = 200;
export const LAST_NAME_MAX_LENGTH = 120;
export const USERNAME_MIN_LENGTH = 5;
export const USERNAME_MAX_LENGTH = 32;
