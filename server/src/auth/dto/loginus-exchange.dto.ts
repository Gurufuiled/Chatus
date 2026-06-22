import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LoginusProfileDto } from './loginus-profile.dto';

export class LoginusExchangeDto {
  @IsString()
  @IsNotEmpty()
  init_data!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LoginusProfileDto)
  profile?: LoginusProfileDto;
}
