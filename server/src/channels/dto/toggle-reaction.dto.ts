import { IsString, MaxLength } from 'class-validator';

export class ToggleReactionDto {
  @IsString()
  @MaxLength(16)
  emoji!: string;
}
