import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentAccountPayload {
  accountId: string;
  tenantId: string;
  storeId?: string | null;
}

/** 从请求中取出 JWT 策略写入的基础账号信息（accountId/tenantId/storeId）。 */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentAccountPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
