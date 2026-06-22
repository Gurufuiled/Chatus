import { Transform, plainToInstance } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const LOGINUS_PROFILE_KEYS = [
  'sub',
  'userId',
  'email',
  'firstName',
  'lastName',
  'avatarUrl',
  'avatar',
] as const;

export function sanitizeLoginusProfileInput(
  value: unknown,
): LoginusProfileDto | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const src = value as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const key of LOGINUS_PROFILE_KEYS) {
    const field = src[key];
    if (typeof field === 'string' && field.length > 0) {
      picked[key] = field;
    }
  }
  return Object.keys(picked).length > 0
    ? plainToInstance(LoginusProfileDto, picked)
    : undefined;
}

export class LoginusProfileDto {
  @IsOptional()
  @IsString()
  sub?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
