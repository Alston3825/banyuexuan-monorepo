import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Passw0rd!23' })
  @IsString()
  @MinLength(1)
  password: string;
}
