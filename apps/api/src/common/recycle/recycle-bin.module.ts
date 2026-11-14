import { Module } from '@nestjs/common';
import { CareArchiveModule } from '../../care/care-archive.module';
import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinService } from './recycle-bin.service';

@Module({
  imports: [CareArchiveModule],
  controllers: [RecycleBinController],
  providers: [RecycleBinService],
  exports: [RecycleBinService],
})
export class RecycleBinModule {}
