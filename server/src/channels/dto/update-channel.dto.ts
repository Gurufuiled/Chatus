import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsEnum(['public', 'private'])
  visibility?: 'public' | 'private';

  @IsOptional()
  @IsEnum(['free', 'paid'])
  access_type?: 'free' | 'paid';

  @IsOptional()
  @IsInt()
  @Min(0)
  subscription_price_cents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  subscription_period_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  preview_post_count?: number;

  @IsOptional()
  @IsBoolean()
  allow_comments?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_reactions?: boolean;

  @IsOptional()
  @IsBoolean()
  disable_comments_new?: boolean;

  @IsOptional()
  @IsBoolean()
  disable_comments_all?: boolean;

  @IsOptional()
  @IsBoolean()
  disable_voice_comments?: boolean;

  @IsOptional()
  @IsBoolean()
  disable_media_comments?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  comment_cooldown_sec?: number;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'slug must contain only latin lowercase letters (a-z), digits (0-9) and underscores',
  })
  slug?: string;
}

