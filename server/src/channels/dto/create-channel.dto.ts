import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

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
}
