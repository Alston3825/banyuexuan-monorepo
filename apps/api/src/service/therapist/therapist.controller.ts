import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TherapistService } from './therapist.service';
import { CreateTherapistDto } from './dto/create-therapist.dto';
import { UpdateTherapistDto } from './dto/update-therapist.dto';
import { QueryTherapistDto } from './dto/query-therapist.dto';

@ApiTags('service/therapist')
@Controller('service/therapists')
export class TherapistController {
  constructor(private readonly therapistService: TherapistService) {}

  @Get()
  @RequirePermission('service.therapist.view')
  findAll(@Query() query: QueryTherapistDto) {
    return this.therapistService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('service.therapist.view')
  findOne(@Param('id') id: string) {
    return this.therapistService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('service.therapist.create')
  create(@Body() dto: CreateTherapistDto) {
    return this.therapistService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('service.therapist.update')
  update(@Param('id') id: string, @Body() dto: UpdateTherapistDto) {
    const { version, ...data } = dto;
    return this.therapistService.update(id, data, version);
  }
}
