import { IsString, Matches, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyPhoneChangeDto {
  @IsUUID()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  session_id!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 6) : value,
  )
  code!: string;
}
