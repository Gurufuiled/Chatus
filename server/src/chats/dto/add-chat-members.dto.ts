import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AddChatMembersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  member_ids!: string[];
}
