import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateChannelPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string | null;

  @IsOptional()
  @IsString()
  msg_type?: string;

  @IsOptional()
  @ValidateIf((_, value) => !Array.isArray(value))
  @IsObject()
  @ValidateIf((_, value) => Array.isArray(value))
  @IsArray()
  media?: Record<string, unknown> | Record<string, unknown>[];
}
