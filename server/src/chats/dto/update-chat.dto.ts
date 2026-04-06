import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  avatar_url?: string;
}
