import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DemoApprovalService } from './demo-approval.service';
import { CreateDemoApprovalDto } from './dto/create-demo-approval.dto';

@ApiTags('workflow/demo-approval')
@Controller('demo-approvals')
export class DemoApprovalController {
  constructor(private readonly demoApprovalService: DemoApprovalService) {}

  @Get()
  @RequirePermission('workflow.demo-approval.view')
  findAll() {
    return this.demoApprovalService.findMany();
  }

  @Get(':id')
  @RequirePermission('workflow.demo-approval.view')
  findOne(@Param('id') id: string) {
    return this.demoApprovalService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('workflow.demo-approval.create')
  create(@Body() dto: CreateDemoApprovalDto) {
    return this.demoApprovalService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('workflow.demo-approval.create')
  submit(@Param('id') id: string) {
    return this.demoApprovalService.submit(id);
  }
}
