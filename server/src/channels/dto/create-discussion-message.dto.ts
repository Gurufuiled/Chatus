import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDiscussionMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string | null;

  @IsOptional()
  @IsString()
  msg_type?: string;

  @IsOptional()
  @IsString()
  reply_to_id?: string | null;

  @IsOptional()
  @IsObject()
  media?: Record<string, unknown>;
}
