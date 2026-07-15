import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class GroupMemberPermissionsDto {
  @IsOptional()
  @IsBoolean()
  can_send_messages?: boolean;

  @IsOptional()
  @IsBoolean()
  can_send_media?: boolean;

  @IsOptional()
  @IsBoolean()
  can_add_users?: boolean;

  @IsOptional()
  @IsBoolean()
  can_pin_messages?: boolean;

  @IsOptional()
  @IsBoolean()
  can_change_info?: boolean;

  @IsOptional()
  @IsBoolean()
  can_create_polls?: boolean;
}

export class UpdateGroupSettingsDto {
  @IsOptional()
  @IsBoolean()
  hide_members?: boolean;

  @IsOptional()
  @IsBoolean()
  restrict_saving_content?: boolean;

  /** `private` = invite-only; `public` accepted but join-by-slug is stubbed. */
  @IsOptional()
  @IsIn(['private', 'public'])
  visibility?: 'private' | 'public';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GroupMemberPermissionsDto)
  member_permissions?: GroupMemberPermissionsDto;
}
