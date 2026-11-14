import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CustomerServiceAgentService } from './customer-service-agent.service';
import { AskCustomerServiceDto } from './dto/ask-customer-service.dto';

@ApiTags('ai/customer-service-agent')
@Controller('ai/customer-service-agent')
export class CustomerServiceAgentController {
  constructor(private readonly customerServiceAgentService: CustomerServiceAgentService) {}

  @Post('ask')
  @RequirePermission('ai.customer-service-agent.ask')
  ask(@Body() dto: AskCustomerServiceDto) {
    return this.customerServiceAgentService.ask(dto);
  }
}
