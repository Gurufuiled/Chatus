import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  expo_token!: string;

  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  /** Native FCM device token (Android only). Used for Firebase Admin SDK direct push. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  fcm_token?: string;
}
