import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('platform/department')
@Controller('platform/departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  @RequirePermission('platform.department.view')
  findAll() {
    return this.departmentService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.department.view')
  findOne(@Param('id') id: string) {
    return this.departmentService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.department.create')
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.department.update')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const { version, ...data } = dto;
    return this.departmentService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.department.delete')
  remove(@Param('id') id: string) {
    return this.departmentService.delete(id);
  }
}
