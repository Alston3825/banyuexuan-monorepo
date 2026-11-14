import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ServicePackageService } from './service-package.service';
import { CreateServicePackageDto } from './dto/create-service-package.dto';
import { UpdateServicePackageDto } from './dto/update-service-package.dto';

@ApiTags('service/package')
@Controller('service/packages')
export class ServicePackageController {
  constructor(private readonly servicePackageService: ServicePackageService) {}

  @Get()
  @RequirePermission('service.package.view')
  findAll() {
    return this.servicePackageService.findMany();
  }

  @Get(':id')
  @RequirePermission('service.package.view')
  findOne(@Param('id') id: string) {
    return this.servicePackageService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('service.package.create')
  create(@Body() dto: CreateServicePackageDto) {
    return this.servicePackageService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('service.package.update')
  update(@Param('id') id: string, @Body() dto: UpdateServicePackageDto) {
    const { version, ...data } = dto;
    return this.servicePackageService.update(id, data, version);
  }
}
