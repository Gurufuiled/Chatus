import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class PinMessageDto {
  @IsUUID()
  message_id!: string;

  /** When false, silent pin (Telegram-like). Default true. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
