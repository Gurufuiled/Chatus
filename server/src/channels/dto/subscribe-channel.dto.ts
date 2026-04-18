import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubscribeChannelDto {
  /** Required when joining a private channel without prior membership. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  invite_token?: string;
}
