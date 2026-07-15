import { IsString, MinLength } from 'class-validator';

export class JoinGroupByInviteDto {
  @IsString()
  @MinLength(4)
  invite_token!: string;
}
