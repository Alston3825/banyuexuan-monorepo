import { Module } from '@nestjs/common';
import { AiSuggestionController } from './ai-suggestion.controller';
import { AiSuggestionService } from './ai-suggestion.service';

@Module({
  controllers: [AiSuggestionController],
  providers: [AiSuggestionService],
  exports: [AiSuggestionService],
})
export class AiSuggestionModule {}
