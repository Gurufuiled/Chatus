import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ClientLogLineDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  ts!: number;

  @IsIn(['debug', 'info', 'warn', 'error'])
  level!: 'debug' | 'info' | 'warn' | 'error';

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tag!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  data?: string;
}

export class IngestClientLogsDto {
  @IsIn(['ios', 'android', 'web', 'unknown'])
  platform!: 'ios' | 'android' | 'web' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  build?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceModel?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => ClientLogLineDto)
  lines!: ClientLogLineDto[];
}
