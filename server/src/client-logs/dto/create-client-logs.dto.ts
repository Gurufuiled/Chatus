import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ClientLogLineDto {
  @IsInt()
  @Min(0)
  ts!: number;

  @IsIn(['info', 'warn', 'error'])
  level!: 'info' | 'warn' | 'error';

  @IsIn(['tdlib'])
  tag!: 'tdlib';

  @IsString()
  @MaxLength(400)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  data?: string;
}

export class CreateClientLogsDto {
  @IsIn(['android', 'ios', 'unknown'])
  platform!: 'android' | 'ios' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ClientLogLineDto)
  lines!: ClientLogLineDto[];
}
