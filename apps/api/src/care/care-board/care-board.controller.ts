import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareBoardService } from './care-board.service';
import { QueryCareBoardDto } from './dto/query-care-board.dto';

@ApiTags('care/board')
@Controller('care/board')
export class CareBoardController {
  constructor(private readonly careBoardService: CareBoardService) {}

  @Get()
  @RequirePermission('care.board.view')
  getBoard(@Query() query: QueryCareBoardDto) {
    return this.careBoardService.getBoard(query);
  }
}
