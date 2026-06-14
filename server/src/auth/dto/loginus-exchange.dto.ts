import { IsNotEmpty, IsString } from 'class-validator';

export class LoginusExchangeDto {
  @IsString()
  @IsNotEmpty()
  init_data!: string;
}
