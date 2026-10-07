import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SaveWorkflowDefinitionDto, WorkflowDefinitionService } from './workflow-definition.service';

@ApiTags('workflow/definition')
@Controller('workflow/definitions')
export class WorkflowDefinitionController {
  constructor(private readonly workflowDefinitionService: WorkflowDefinitionService) {}

  @Get()
  @RequirePermission('workflow.instance.view')
  findAll() {
    return this.workflowDefinitionService.findMany();
  }

  /** 审批流程设置页：每类单据的当前流程（含已停用的）。 */
  @Get('settings')
  @RequirePermission('workflow.definition.view')
  settings() {
    return this.workflowDefinitionService.listForSettings();
  }

  /** 修改某类单据的审批流程（节点 / 审批人 / 会签或签 / 处理时限 / 启停）。 */
  @Put(':code')
  @RequirePermission('workflow.definition.update')
  save(@Param('code') code: string, @Body() dto: SaveWorkflowDefinitionDto) {
    return this.workflowDefinitionService.save(code, dto);
  }
}
