import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { CareConfirmMethod, CareSignShift } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareConfirmPublicService } from './care-confirm-public.service';
import { CareSignatureService } from './care-signature.service';

/** 客户 IP：main.ts 已让 Express 信任两层代理，req.ip 就是真实客户端 IP（客户在请求头里伪造的无效）。 */
export const clientIp = (req: Request): string | undefined => req.ip;

class SetSignatureBody {
  @ApiProperty() @IsString() @IsNotEmpty() signatureData: string;
}
class SignBody {
  @ApiProperty() @IsString() @IsNotEmpty() motherProfileId: string;
  @ApiProperty() @IsString() @IsNotEmpty() date: string;
  @ApiProperty({ enum: ['DAY', 'NIGHT', 'RELIEF'] }) @IsEnum(CareSignShift) shift: CareSignShift;
}
class LinkBody {
  @ApiProperty() @IsString() @IsNotEmpty() motherProfileId: string;
}
class VerifyBody {
  @ApiProperty() @IsString() phoneLast4: string;
}
class ConfirmBody {
  @IsString() viewToken: string;
  @IsArray() items: { date: string; satisfaction: number; comment?: string; nurseRatings?: { signatureId: string; score: number }[] }[];
  @IsEnum(CareConfirmMethod) method: CareConfirmMethod;
  @IsOptional() @IsString() signatureData?: string;
  @IsOptional() @IsInt() holdMs?: number;
  @IsOptional() @IsString() deviceId?: string;
  @IsBoolean() acknowledged: boolean;
}

/** 当前登录员工的电子签名图：只要登录就能管理自己的，不需要额外权限点。 */
@ApiTags('me')
@Controller('me/signature')
export class MySignatureController {
  constructor(private readonly service: CareSignatureService) {}

  @Get()
  get() {
    return this.service.mySignature();
  }

  @Put()
  set(@Body() dto: SetSignatureBody) {
    return this.service.setMySignature(dto.signatureData);
  }
}

@ApiTags('care/signature')
@Controller('care/daily')
export class CareSignatureController {
  constructor(private readonly service: CareSignatureService) {}

  /** 日历每一天的签字/客户确认小标记 */
  @Get('sign-overview')
  @RequirePermission('care.profile.view')
  overview(@Query('motherProfileId') motherProfileId: string) {
    return this.service.overview(motherProfileId);
  }

  @Get('signatures')
  @RequirePermission('care.profile.view')
  status(@Query('motherProfileId') motherProfileId: string, @Query('date') date: string) {
    return this.service.dayStatus(motherProfileId, date);
  }

  /** 护理师用自己的账号 + 自己的签名图给某一天的记录签字（白班/夜班/替班） */
  @Post('signatures')
  @RequirePermission('care.profile.update')
  sign(@Body() dto: SignBody, @Headers('x-device-id') deviceId?: string) {
    return this.service.sign({ ...dto, deviceId });
  }

  @Delete('signatures/:id')
  @RequirePermission('care.profile.update')
  unsign(@Param('id') id: string) {
    return this.service.unsign(id);
  }

  @Post('confirm-links')
  @RequirePermission('care.profile.update')
  createLink(@Body() dto: LinkBody) {
    return this.service.createLink(dto.motherProfileId);
  }

  @Get('confirm-links')
  @RequirePermission('care.profile.view')
  links(@Query('motherProfileId') motherProfileId: string) {
    return this.service.listLinks(motherProfileId);
  }

  @Delete('confirm-links/:id')
  @RequirePermission('care.profile.update')
  revoke(@Param('id') id: string) {
    return this.service.revokeLink(id);
  }
}

/**
 * 客户端（手机网页/后期微信小程序）使用的接口：不需要登录，凭链接 + 手机号后四位核验。
 * 小程序后期直接复用这四个接口，不用改后端。
 */
@ApiTags('public/care-confirm')
@Public()
@Controller('public/care-confirm')
export class PublicCareConfirmController {
  constructor(private readonly service: CareConfirmPublicService) {}

  @Get(':token/info')
  info(@Param('token') token: string) {
    return this.service.info(token);
  }

  @Post(':token/verify')
  verify(@Param('token') token: string, @Body() dto: VerifyBody) {
    return this.service.verify(token, dto.phoneLast4);
  }

  @Get(':token/days')
  days(@Param('token') token: string, @Headers('x-confirm-session') session?: string) {
    return this.service.days(token, session);
  }

  @Post(':token/confirm')
  confirm(@Param('token') token: string, @Body() dto: ConfirmBody, @Req() req: Request, @Headers('x-confirm-session') session?: string) {
    return this.service.confirm(token, session, dto, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
  }
}
