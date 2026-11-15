import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { WorkbenchService } from './workbench.service';

/** 工作台：只要登录就能看自己的待办，不需要额外权限点（各来源在服务里按权限筛）。 */
@ApiTags('workspace')
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly wb: WorkbenchService,
  ) {}

  @Get('todos')
  todos() {
    return this.workspaceService.todos();
  }

  @Get('todos/badge')
  async badge() {
    const [business, reminders] = await Promise.all([
      this.workspaceService.badge(),
      this.wb.remindersForDay(),
    ]);
    const pending = reminders.filter((r) => !r.done);
    return {
      total: business.total + pending.length,
      overdue: business.overdue + pending.filter((r) => r.overdue).length,
    };
  }

  // ===== 个人工作台（只操作自己的数据，登录即可） =====
  @Get('my/tasks') myTasks() { return this.wb.tasks(); }
  @Post('my/tasks') createTask(@Body() b: any) { return this.wb.createTask(b); }
  @Patch('my/tasks/:id') updateTask(@Param('id') id: string, @Body() b: any) { return this.wb.updateTask(id, b); }
  @Delete('my/tasks/:id') deleteTask(@Param('id') id: string) { return this.wb.deleteTask(id); }

  @Get('my/reminders') myReminders(@Query('date') date?: string) { return this.wb.remindersForDay(date); }
  @Get('my/reminders/defs') reminderDefs() { return this.wb.reminderDefs(); }
  @Get('my/reminders/badge') reminderBadge() { return this.wb.reminderBadge().then((n) => ({ pending: n })); }
  @Post('my/reminders') createReminder(@Body() b: any) { return this.wb.createReminder(b); }
  @Patch('my/reminders/:id') updateReminder(@Param('id') id: string, @Body() b: any) { return this.wb.updateReminder(id, b); }
  @Delete('my/reminders/:id') deleteReminder(@Param('id') id: string) { return this.wb.deleteReminder(id); }
  @Post('my/reminders/:id/mark') markReminder(@Param('id') id: string, @Body() b: any) { return this.wb.markReminder(id, b); }

  @Get('my/ongoing') myOngoing() { return this.wb.ongoing(); }
  @Post('my/ongoing') createOngoing(@Body() b: any) { return this.wb.createOngoing(b); }
  @Patch('my/ongoing/:id') updateOngoing(@Param('id') id: string, @Body() b: any) { return this.wb.updateOngoing(id, b); }
  @Delete('my/ongoing/:id') deleteOngoing(@Param('id') id: string) { return this.wb.deleteOngoing(id); }
  @Post('my/ongoing/:id/steps') addStep(@Param('id') id: string, @Body() b: any) { return this.wb.addStep(id, b); }
  @Patch('my/ongoing/:id/steps/:stepId') updateStep(@Param('id') id: string, @Param('stepId') sid: string, @Body() b: any) { return this.wb.updateStep(id, sid, b); }
  @Delete('my/ongoing/:id/steps/:stepId') deleteStep(@Param('id') id: string, @Param('stepId') sid: string) { return this.wb.deleteStep(id, sid); }

  @Get('my/theme') myTheme() { return this.wb.myTheme(); }
  @Put('my/theme') saveTheme(@Body() b: any) { return this.wb.saveTheme(b); }

  @Get('my/links') myLinks() { return this.wb.links(); }
  @Put('my/links') saveLinks(@Body() b: any) { return this.wb.saveLinks(b); }
}
