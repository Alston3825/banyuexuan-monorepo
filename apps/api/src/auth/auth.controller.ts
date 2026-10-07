import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string, @Headers('x-device-id') deviceId?: string) {
    return this.authService.login(dto.username, dto.password, { ip, userAgent, deviceId });
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Ip() ip: string, @Headers('user-agent') userAgent: string, @Headers('x-device-id') deviceId?: string) {
    return this.authService.refresh(dto.refreshToken, { ip, userAgent, deviceId });
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
