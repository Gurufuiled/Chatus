import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsIn(['bug', 'suggestion'])
  type!: 'bug' | 'suggestion';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;

  /** Публичный URL вложения (после POST /upload). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachment_url?: string;
}
