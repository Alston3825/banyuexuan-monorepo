import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class CommissionAllocationInputDto {
  @ApiProperty() @IsString() employeeProfileId: string;
  @ApiProperty({ description: '如"销售"/"主管"/"店长"/"第一服务人"' }) @IsString() roleLabel: string;
  @ApiProperty({ description: '万分比，0-10000 代表 0.00%-100.00%' }) @IsInt() @Min(1) @Max(10000) basisPoints: number;
}
