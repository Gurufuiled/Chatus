import {
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^[a-zA-Z0-9_]{5,32}$/, {
    message: 'handle must be 5-32 chars, only letters, digits, underscore',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  display_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => value?.trim())
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.trim().slice(0, 32) : value;
  })
  /** ISO date string YYYY-MM-DD */
  birthday?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @Matches(/^(https:\/\/|http:\/\/|\/uploads\/)/, {
    message: 'avatar_url must be a valid https, http, or /uploads/ URL',
  })
  avatar_url?: string;
}
