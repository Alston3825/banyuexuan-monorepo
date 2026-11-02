import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai/ai-gateway/ai-gateway.module';
import { CareArchiveModule } from '../care/care-archive.module';
import { SatisfactionController } from './satisfaction.controller';
import { SatisfactionExtractionService } from './satisfaction-extraction.service';
import { SatisfactionService } from './satisfaction.service';

/** 满意度调查：纸质《客户满意度调查表 一/二/三》拍照识别录入 + 评分统计 + 意见汇总。 */
@Module({
  imports: [AiGatewayModule, CareArchiveModule],
  controllers: [SatisfactionController],
  providers: [SatisfactionService, SatisfactionExtractionService],
})
export class SatisfactionModule {}
