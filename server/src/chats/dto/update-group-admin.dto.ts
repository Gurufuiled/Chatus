import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateGroupAdminDto {
  /** Promote to admin, demote to member, or leave role unchanged when omitted. */
  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: 'admin' | 'member';

  @IsOptional()
  @IsBoolean()
  can_change_info?: boolean;

  @IsOptional()
  @IsBoolean()
  can_delete_messages?: boolean;

  @IsOptional()
  @IsBoolean()
  can_ban_users?: boolean;

  @IsOptional()
  @IsBoolean()
  can_invite_users?: boolean;

  @IsOptional()
  @IsBoolean()
  can_pin_messages?: boolean;

  @IsOptional()
  @IsBoolean()
  can_manage_invite_links?: boolean;

  @IsOptional()
  @IsBoolean()
  can_manage_video_chats?: boolean;

  @IsOptional()
  @IsBoolean()
  can_add_admins?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tag_color?: string;
}
