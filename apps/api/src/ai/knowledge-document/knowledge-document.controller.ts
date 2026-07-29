import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { KnowledgeDocumentService } from './knowledge-document.service';
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto';
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto';

@ApiTags('ai/knowledge-document')
@Controller('ai/knowledge-documents')
export class KnowledgeDocumentController {
  constructor(private readonly knowledgeDocumentService: KnowledgeDocumentService) {}

  @Get()
  @RequirePermission('ai.knowledge-document.view')
  findAll() {
    return this.knowledgeDocumentService.findMany();
  }

  @Get(':id')
  @RequirePermission('ai.knowledge-document.view')
  findOne(@Param('id') id: string) {
    return this.knowledgeDocumentService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('ai.knowledge-document.create')
  create(@Body() dto: CreateKnowledgeDocumentDto) {
    return this.knowledgeDocumentService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('ai.knowledge-document.update')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDocumentDto) {
    return this.knowledgeDocumentService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('ai.knowledge-document.delete')
  delete(@Param('id') id: string) {
    return this.knowledgeDocumentService.delete(id);
  }
}
