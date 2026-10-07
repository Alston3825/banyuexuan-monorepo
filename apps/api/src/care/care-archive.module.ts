import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai/ai-gateway/ai-gateway.module';
import { CareAssessmentController } from './care-assessment/care-assessment.controller';
import { CareAssessmentService } from './care-assessment/care-assessment.service';
import { CareDailyController } from './care-daily/care-daily.controller';
import { CareDailyService } from './care-daily/care-daily.service';
import { CareMedicationController } from './care-medication/care-medication.controller';
import { CareMedicationService } from './care-medication/care-medication.service';
import { CarePlanVersionController } from './care-plan-version/care-plan-version.controller';
import { CarePlanVersionService, CareServiceLogService } from './care-plan-version/care-plan-version.service';
import { CareStatsController } from './care-stats/care-stats.controller';
import { CareStatsService } from './care-stats/care-stats.service';
import { CareDocumentController } from './care-document/care-document.controller';
import { CareDocumentExtractionService } from './care-document/care-document-extraction.service';
import { CareDocumentService } from './care-document/care-document.service';
import { CareStorageService } from './care-document/care-storage.service';
import { CareConfirmPublicService } from './care-signature/care-confirm-public.service';
import { CareSignatureController, MySignatureController, PublicCareConfirmController } from './care-signature/care-signature.controller';
import { CareSignatureService } from './care-signature/care-signature.service';

/** 护理档案（母婴档案下的纸质资料留档 + 单次评估表）：资料上传/识别、四张评估表。 */
@Module({
  imports: [AiGatewayModule],
  controllers: [MySignatureController, CareSignatureController, PublicCareConfirmController, CareDocumentController, CareAssessmentController, CareDailyController, CareMedicationController, CarePlanVersionController, CareStatsController],
  providers: [CareSignatureService, CareConfirmPublicService, CareStorageService, CareDocumentExtractionService, CareDocumentService, CareAssessmentService, CareDailyService, CareMedicationService, CarePlanVersionService, CareServiceLogService, CareStatsService],
  exports: [CareStorageService],
})
export class CareArchiveModule {}
