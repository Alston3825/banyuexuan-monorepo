import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CareOutreachTemplateItemDto } from './care-outreach-template-item.dto';

export class CreateCareOutreachTemplateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;

  @ApiProperty({ type: [CareOutreachTemplateItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CareOutreachTemplateItemDto)
  items: CareOutreachTemplateItemDto[];
}
