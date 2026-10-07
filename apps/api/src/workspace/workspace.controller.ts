import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';

/** 工作台：只要登录就能看自己的待办，不需要额外权限点（各来源在服务里按权限筛）。 */
@ApiTags('workspace')
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('todos')
  todos() {
    return this.workspaceService.todos();
  }

  @Get('todos/badge')
  badge() {
    return this.workspaceService.badge();
  }
}
