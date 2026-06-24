import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import {
  CreateMessageMediaDto,
  normalizeCreateMessageMedia,
} from './create-message-media.dto';

const MESSAGE_TYPES = [
  'text',
  'image',
  'voice',
  'video',
  'video_note',
  'file',
] as const;
export type CreateMessageType = (typeof MESSAGE_TYPES)[number];

export class CreateMessageDto {
  @ValidateIf((o: CreateMessageDto) => (o.msg_type ?? 'text') === 'text')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  content?: string;

  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  msg_type?: CreateMessageType;

  @IsOptional()
  @Transform(({ value }) => normalizeCreateMessageMedia(value))
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateMessageMediaDto)
  media?: CreateMessageMediaDto[];

  @IsOptional()
  @IsUUID()
  reply_to_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  client_temp_id?: string;
}
