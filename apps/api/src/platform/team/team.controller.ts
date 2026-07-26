import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@ApiTags('platform/team')
@Controller('platform/teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @RequirePermission('platform.team.view')
  findAll() {
    return this.teamService.findMany();
  }

  @Get(':id')
  @RequirePermission('platform.team.view')
  findOne(@Param('id') id: string) {
    return this.teamService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('platform.team.create')
  create(@Body() dto: CreateTeamDto) {
    return this.teamService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.team.update')
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    const { version, ...data } = dto;
    return this.teamService.update(id, data, version);
  }

  @Delete(':id')
  @RequirePermission('platform.team.delete')
  remove(@Param('id') id: string) {
    return this.teamService.delete(id);
  }
}
