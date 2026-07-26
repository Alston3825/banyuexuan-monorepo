import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

export class AdvanceStageDto {
  @ApiProperty({ enum: ['QUOTED', 'WON'] })
  @IsIn(['QUOTED', 'WON'])
  targetStage: 'QUOTED' | 'WON';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
