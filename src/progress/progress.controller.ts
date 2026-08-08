import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { CompleteLevelDto } from './dto/complete-level.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('progress')
@ApiBearerAuth()
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
        user: { id: 'uuid', xp: 350, coins: 150 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Ошибка валидации (неверный UUID).' })
  @ApiResponse({ status: 401, description: 'Нет или невалиден Bearer-токен.' })
  @ApiResponse({ status: 404, description: 'Пользователь или уровень не найдены.' })
  @ApiResponse({ status: 409, description: 'Уровень уже пройден — награда не начисляется дважды.' })
  completeLevel(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteLevelDto,
  ) {
    // userId из токена, а не из тела запроса: иначе любой начисляет очки кому угодно.
    return this.progressService.completeLevel({ userId, levelId: dto.levelId });
  }
}
