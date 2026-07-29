import { Module } from '@nestjs/common';
import { AiGatewayClient } from './ai-gateway.client';

@Module({
  providers: [AiGatewayClient],
  exports: [AiGatewayClient],
})
export class AiGatewayModule {}
