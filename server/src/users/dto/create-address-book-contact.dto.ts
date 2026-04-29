import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateAddressBookContactDto {
  /** Digits only, min 6 — aligned with AddressBookService.create. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 40) : value,
  )
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  last_name?: string;
}
