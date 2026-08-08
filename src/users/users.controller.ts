import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Раньше здесь было GET /users/:id/stats — id брался из URL, и любой
  // подставлял чужой (IDOR). Теперь id приходит только из проверенного токена.
  @Get('me/stats')
  @ApiOperation({ summary: 'Статистика профиля текущего пользователя' })
  getStats(@CurrentUser('id') userId: string) {
    return this.usersService.getStats(userId);
  }

  @Get('me/dashboard')
  @ApiOperation({ summary: 'Дашборд (профессии и уровни) текущего пользователя' })
  getDashboardData(@CurrentUser('id') userId: string) {
    return this.usersService.getDashboardData(userId);
  }
}
