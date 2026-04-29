import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RequestPhoneChangeDto {
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  new_phone!: string;
}
