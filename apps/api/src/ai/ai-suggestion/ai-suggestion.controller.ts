import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AiSuggestionService } from './ai-suggestion.service';
import { QueryAiSuggestionDto } from './dto/query-ai-suggestion.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('ai/suggestion')
@Controller('ai/suggestions')
export class AiSuggestionController {
  constructor(private readonly aiSuggestionService: AiSuggestionService) {}

  @Get()
  @RequirePermission('ai.suggestion.view')
  findAll(@Query() query: QueryAiSuggestionDto) {
    return this.aiSuggestionService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('ai.suggestion.view')
  findOne(@Param('id') id: string) {
    return this.aiSuggestionService.findOneOrThrow(id);
  }

  @Post(':id/accept')
  @RequirePermission('ai.suggestion.accept')
  accept(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.aiSuggestionService.accept(id, dto.version);
  }

  @Post(':id/dismiss')
  @RequirePermission('ai.suggestion.dismiss')
  dismiss(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.aiSuggestionService.dismiss(id, dto.version);
  }
}
