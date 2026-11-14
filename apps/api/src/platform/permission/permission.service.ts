import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /** 权限点目录是全局系统目录（非租户隔离），由 seed 脚本维护，此处只读。 */
  findMany() {
    return this.prisma.permissionPoint.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] });
  }
}
