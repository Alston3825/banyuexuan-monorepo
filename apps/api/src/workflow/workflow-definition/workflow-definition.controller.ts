import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { WorkflowDefinitionService } from './workflow-definition.service';

@ApiTags('workflow/definition')
@Controller('workflow/definitions')
export class WorkflowDefinitionController {
  constructor(private readonly workflowDefinitionService: WorkflowDefinitionService) {}

  @Get()
  @RequirePermission('workflow.instance.view')
  findAll() {
    return this.workflowDefinitionService.findMany();
  }
}
