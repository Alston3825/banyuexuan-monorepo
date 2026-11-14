import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class QueryWorkflowInstanceDto {
  @ApiProperty() @IsString() businessType: string;
  @ApiProperty() @IsString() businessId: string;
}
