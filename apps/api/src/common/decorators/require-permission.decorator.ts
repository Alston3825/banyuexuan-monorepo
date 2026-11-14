import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/** 声明访问该路由所需的权限点 code（见 PermissionPoint.code），由全局 PermissionGuard 校验。 */
export const RequirePermission = (permissionCode: string) =>
  SetMetadata(PERMISSION_KEY, permissionCode);
