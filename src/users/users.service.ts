import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string) {
    // 1. Загружаем пользователя со всеми записями прогресса
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        progress: {
          where: { isCompleted: true },
          select: { levelId: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    // 2. Загружаем все профессии вместе с их уровнями
    const professions = await this.prisma.profession.findMany({
      include: {
        levels: {
          select: { id: true },
        },
      },
    });

    // 3. Формируем сет пройденных levelId для быстрого поиска
    const completedLevelIds = new Set(
      user.progress.map((p) => p.levelId),
    );

    // 4. Профессия считается завершённой, если ВСЕ её уровни пройдены
    const completedProfessions = professions
      .filter(
        (profession) =>
          profession.levels.length > 0 &&
          profession.levels.every((level) => completedLevelIds.has(level.id)),
      )
      .map((profession) => ({
        id: profession.id,
        title: profession.title,
        description: profession.description,
        totalLevels: profession.levels.length,
      }));

    return {
      id: user.id,
      email: user.email,
      xp: user.xp,
      coins: user.coins,
      level: user.level,
      completedLevelsCount: completedLevelIds.size,
      completedProfessions,
    };
  }

  async getDashboardData(userId: string) {
    // 1. Проверяем, существует ли пользователь
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    // 2. Получаем профессии, считаем общее количество уровней 
    // и подтягиваем информацию о пройденных уровнях для конкретного пользователя.
    const professions = await this.prisma.profession.findMany({
      include: {
        _count: {
          select: { levels: true },
        },
        levels: {
          select: {
            progress: {
              where: {
                userId: userId,
                isCompleted: true,
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: {
        title: 'asc', // Сортируем по названию, так как отдельного поля order у профессий нет
      },
    });

    // 3. Формируем сырые данные о прогрессе
    const stats = professions.map((prof) => {
      const totalLevels = prof._count.levels;
      // Если у уровня есть связанная запись progress, значит он пройден
      const completedLevels = prof.levels.filter((level) => level.progress.length > 0).length;

      return {
        id: prof.id,
        title: prof.title,
        description: prof.description,
        totalLevels,
        completedLevels,
      };
    });

    // 4. Применяем логику блокировки (isLocked)
    // Первая профессия всегда доступна. Последующие доступны только если
    // в предыдущей профессии пройден хотя бы 1 уровень.
    return stats.map((prof, index) => {
      let isLocked = false;
      if (index > 0) {
        const previousProf = stats[index - 1];
        if (previousProf.completedLevels === 0) {
          isLocked = true;
        }
      }

      return {
        ...prof,
        isLocked,
      };
    });
  }
}
