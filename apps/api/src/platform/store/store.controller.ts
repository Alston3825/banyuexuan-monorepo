import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CloseStoreDto } from './dto/close-store.dto';

@ApiTags('platform/store')
@Controller('platform/stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @RequirePermission('platform.store.view')
  findAll() {
    return this.storeService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.store.view')
  findOne(@Param('id') id: string) {
    return this.storeService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.store.create')
  create(@Body() dto: CreateStoreDto) {
    return this.storeService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.store.update')
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    const { version, ...data } = dto;
    return this.storeService.update(id, data, version);
  }

  /** 语义上是"作废关闭"而非物理删除：门店记录被永久保留，仅状态转为 CLOSED。 */
  @Delete(':id')
  @RequirePermission('platform.store.delete')
  close(@Param('id') id: string, @Body() dto: CloseStoreDto) {
    return this.storeService.close(id, dto.version);
  }
}
