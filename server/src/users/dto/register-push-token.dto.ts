import { IsIn, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  expo_token!: string;

  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';
}
