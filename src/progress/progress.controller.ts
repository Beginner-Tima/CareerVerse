import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { CompleteLevelDto } from './dto/complete-level.dto';

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Завершить уровень и получить награду' })
  @ApiResponse({ 
    status: 200, 
    description: 'Уровень успешно завершен, награда начислена.',
    schema: {
      example: {
        progress: { id: 'uuid', userId: 'uuid', levelId: 'uuid', isCompleted: true },
        reward: { xp: 100, coins: 50 },
        user: { id: 'uuid', xp: 350, coins: 150 }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Ошибка валидации (неверный UUID) или уровень уже был пройден.' })
  @ApiResponse({ status: 404, description: 'Пользователь или уровень не найдены.' })
  completeLevel(@Body() dto: CompleteLevelDto) {
    return this.progressService.completeLevel(dto);
  }
}

