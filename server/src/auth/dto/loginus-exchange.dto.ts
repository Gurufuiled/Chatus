import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LoginusProfileDto, sanitizeLoginusProfileInput } from './loginus-profile.dto';

export class LoginusExchangeDto {
  @IsString()
  @IsNotEmpty()
  init_data!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LoginusProfileDto)
  @Transform(({ value }) => sanitizeLoginusProfileInput(value))
  profile?: LoginusProfileDto;
}
