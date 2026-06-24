import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class CreateMessageMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  media_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  file_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mime_type?: string;

  @IsOptional()
  @IsNumber()
  file_size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sha256?: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  duration_ms?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  thumbnail_url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(128)
  @IsInt({ each: true })
  waveform?: number[];
}

export function normalizeCreateMessageMedia(
  media?: CreateMessageMediaDto | CreateMessageMediaDto[],
): CreateMessageMediaDto[] {
  if (!media) return [];
  return Array.isArray(media) ? media : [media];
}

export function assertValidMessageMediaItems(
  items: CreateMessageMediaDto[],
): void {
  if (items.length === 0) {
    throw new Error('media must include at least one item');
  }
  for (const item of items) {
    const url = item.url?.trim();
    if (!url) {
      throw new Error('media.url is required');
    }
    if (!url.startsWith('/uploads/')) {
      throw new Error(
        'media.url must be an /uploads/ path from POST /api/upload',
      );
    }
  }
}
