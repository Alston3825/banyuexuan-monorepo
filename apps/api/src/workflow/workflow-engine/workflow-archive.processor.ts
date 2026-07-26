import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WorkflowEngineService } from './workflow-engine.service';
import { WORKFLOW_ARCHIVE_QUEUE } from '../../queue/queue.constants';

@Processor(WORKFLOW_ARCHIVE_QUEUE)
export class WorkflowArchiveProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowArchiveProcessor.name);

  constructor(private readonly workflowEngineService: WorkflowEngineService) {
    super();
  }

  async process(job: Job<{ instanceId: string }>): Promise<void> {
    await this.workflowEngineService.archive(job.data.instanceId);
    this.logger.log(`自动归档工作流实例 ${job.data.instanceId}`);
  }
}
