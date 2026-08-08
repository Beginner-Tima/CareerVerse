import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteLevelInput } from './dto/complete-level.dto';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Начисляет награду за уровень ровно один раз.
   *
   * Раньше проверка «не проходил ли уже» стояла до и вне транзакции, а сама
   * транзакция была батчевым массивом — 8 параллельных запросов на один уровень
   * давали 7 начислений и 1400 XP вместо 200. Теперь единственный источник
   * истины — уникальный индекс @@unique([userId, levelId]) в БД: параллельные
   * запросы проигрывают его на INSERT и получают 409, а не награду.
   */
  async completeLevel(dto: CompleteLevelInput) {
    const { userId, levelId } = dto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const level = await tx.level.findUnique({ where: { id: levelId } });
        if (!level) {
          throw new NotFoundException(`Level with id "${levelId}" not found`);
        }

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new NotFoundException(`User with id "${userId}" not found`);
        }

        // Дубликат ловится не проверкой, а индексом: create бросит P2002.
        const progress = await tx.userProgress.create({
          data: { userId, levelId, isCompleted: true },
        });

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            xp: { increment: level.rewardXp },
            coins: { increment: level.rewardCoins },
          },
        });

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
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `User "${userId}" has already completed level "${levelId}"`,
        );
      }
      throw error;
    }
  }
}
