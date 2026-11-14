import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { FollowUpService } from './follow-up.service';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { QueryFollowUpDto } from './dto/query-follow-up.dto';

@ApiTags('crm/follow-up')
@Controller('crm/follow-ups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get()
  @RequirePermission('crm.follow-up.view')
  findAll(@Query() query: QueryFollowUpDto) {
    return this.followUpService.findMany(query.businessType, query.businessId);
  }

  @Post()
  @RequirePermission('crm.follow-up.create')
  create(@Body() dto: CreateFollowUpDto) {
    return this.followUpService.create(dto);
  }
}
