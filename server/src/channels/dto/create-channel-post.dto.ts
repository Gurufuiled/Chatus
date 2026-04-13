import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChannelPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string | null;

  @IsOptional()
  @IsString()
  msg_type?: string;

  @IsOptional()
  @IsObject()
  media?: Record<string, unknown>;
}
