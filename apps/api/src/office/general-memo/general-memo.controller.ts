import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GeneralMemoService } from './general-memo.service';
import { CreateGeneralMemoDto } from './dto/create-general-memo.dto';
import { QueryGeneralMemoDto } from './dto/query-general-memo.dto';
import { CancelGeneralMemoDto } from './dto/cancel-general-memo.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('office/general-memo')
@Controller('office/general-memos')
export class GeneralMemoController {
  constructor(private readonly generalMemoService: GeneralMemoService) {}

  @Get()
  @RequirePermission('office.general-memo.view')
  findAll(@Query() query: QueryGeneralMemoDto) {
    return this.generalMemoService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('office.general-memo.view')
  findOne(@Param('id') id: string) {
    return this.generalMemoService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('office.general-memo.create')
  create(@Body() dto: CreateGeneralMemoDto) {
    return this.generalMemoService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('office.general-memo.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.generalMemoService.submit(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('office.general-memo.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelGeneralMemoDto) {
    return this.generalMemoService.cancel(id, dto.cancelReason, dto.version);
  }
}
