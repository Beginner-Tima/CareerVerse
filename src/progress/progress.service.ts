import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteLevelDto } from './dto/complete-level.dto';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async completeLevel(dto: CompleteLevelDto) {
    const { userId, levelId } = dto;

    // 1. Проверяем, что уровень существует
    const level = await this.prisma.level.findUnique({
      where: { id: levelId },
    });
    if (!level) {
      throw new NotFoundException(`Level with id "${levelId}" not found`);
    }

    // 2. Проверяем, что пользователь существует
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    // 3. Проверяем, не проходил ли пользователь этот уровень ранее
    const existing = await this.prisma.userProgress.findFirst({
      where: { userId, levelId },
    });
    if (existing) {
      throw new BadRequestException(
        `User "${userId}" has already completed level "${levelId}"`,
      );
    }

    // 4. Атомарно создаём запись прогресса и начисляем награду пользователю
    const [progress, updatedUser] = await this.prisma.$transaction([
      this.prisma.userProgress.create({
        data: {
          userId,
          levelId,
          isCompleted: true,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          xp: { increment: level.rewardXp },
          coins: { increment: level.rewardCoins },
        },
      }),
    ]);

    return {
      progress,
      reward: {
        xp: level.rewardXp,
        coins: level.rewardCoins,
      },
      user: {
        id: updatedUser.id,
        xp: updatedUser.xp,
        coins: updatedUser.coins,
      },
    };
  }
}
