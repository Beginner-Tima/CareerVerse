import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id/stats')
  @ApiOperation({ summary: 'Получить полную статистику профиля пользователя' })
  @ApiParam({ name: 'id', description: 'UUID пользователя' })
  getStats(@Param('id') id: string) {
    return this.usersService.getStats(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Получить данные дашборда (профессии и уровни) для пользователя' })
  @ApiParam({ name: 'id', description: 'UUID пользователя' })
  getDashboardData(@Param('id') id: string) {
    return this.usersService.getDashboardData(id);
  }
}

