import { Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareAbnormalityAgentService } from './care-abnormality-agent.service';

@ApiTags('ai/care-abnormality-agent')
@Controller('ai/care-abnormality-agent')
export class CareAbnormalityAgentController {
  constructor(private readonly careAbnormalityAgentService: CareAbnormalityAgentService) {}

  @Post(':abnormalityId/suggest')
  @RequirePermission('ai.care-abnormality-agent.suggest')
  suggest(@Param('abnormalityId') abnormalityId: string) {
    return this.careAbnormalityAgentService.suggest(abnormalityId);
  }
}
