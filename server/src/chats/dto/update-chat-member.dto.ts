import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const MEMBER_TAG_COLORS = ['blue', 'green', 'orange', 'red'] as const;

export class UpdateChatMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsString()
  @IsIn(MEMBER_TAG_COLORS)
  tag_color?: (typeof MEMBER_TAG_COLORS)[number];
}
