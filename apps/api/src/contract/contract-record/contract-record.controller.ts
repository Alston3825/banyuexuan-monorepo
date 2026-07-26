import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ContractRecordService } from './contract-record.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { SignContractDto } from './dto/sign-contract.dto';
import { SubmitContractDto } from './dto/submit-contract.dto';
import { VoidContractDto } from './dto/void-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';

@ApiTags('contract/record')
@Controller('contract/records')
export class ContractRecordController {
  constructor(private readonly contractRecordService: ContractRecordService) {}

  @Get()
  @RequirePermission('contract.record.view')
  findAll(@Query() query: QueryContractDto) {
    return this.contractRecordService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('contract.record.view')
  findOne(@Param('id') id: string) {
    return this.contractRecordService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('contract.record.create')
  create(@Body() dto: CreateContractDto) {
    return this.contractRecordService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('contract.record.update')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    const { version, ...data } = dto;
    return this.contractRecordService.update(id, data, version);
  }

  @Post(':id/sign')
  @RequirePermission('contract.record.sign')
  sign(@Param('id') id: string, @Body() dto: SignContractDto) {
    return this.contractRecordService.sign(id, dto.version);
  }

  @Post(':id/submit')
  @RequirePermission('contract.record.submit')
  submit(@Param('id') id: string, @Body() dto: SubmitContractDto) {
    return this.contractRecordService.submit(id, dto.version);
  }

  @Post(':id/void')
  @RequirePermission('contract.record.void')
  void(@Param('id') id: string, @Body() dto: VoidContractDto) {
    return this.contractRecordService.void(id, dto.voidReason, dto.version);
  }

  @Post(':id/renew')
  @RequirePermission('contract.record.renew')
  renew(@Param('id') id: string, @Body() dto: RenewContractDto) {
    return this.contractRecordService.renew(id, dto);
  }
}
