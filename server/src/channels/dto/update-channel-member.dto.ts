import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateChannelMemberDto {
  @IsOptional()
  @IsEnum(['admin', 'member'])
  role?: 'admin' | 'member';

  @IsOptional()
  @IsBoolean()
  can_post?: boolean;

  @IsOptional()
  @IsBoolean()
  can_manage_admins?: boolean;

  @IsOptional()
  @IsBoolean()
  can_edit_channel?: boolean;

  @IsOptional()
  @IsBoolean()
  can_moderate_subscribers?: boolean;

  @IsOptional()
  @IsBoolean()
  can_edit_channel_avatar?: boolean;

  @IsOptional()
  @IsBoolean()
  can_edit_channel_name?: boolean;

  @IsOptional()
  @IsBoolean()
  can_edit_channel_description?: boolean;

  @IsOptional()
  @IsBoolean()
  can_add_admins?: boolean;

  @IsOptional()
  @IsBoolean()
  can_remove_admins?: boolean;

  @IsOptional()
  @IsBoolean()
  can_edit_admin_permissions?: boolean;
}
