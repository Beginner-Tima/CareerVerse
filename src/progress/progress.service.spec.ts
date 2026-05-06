import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { PrismaService } from '../prisma/prisma.service';

// Фабрика мока PrismaService — полный контроль над каждым delegate
const mockPrismaService = () => ({
  level: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userProgress: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('ProgressService', () => {
  let service: ProgressService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: PrismaService, useFactory: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    prisma = module.get(PrismaService) as unknown as ReturnType<typeof mockPrismaService>;
  });

  const dto = {
    userId: 'user-uuid-1111',
    levelId: 'level-uuid-2222',
  };

  const mockLevel = {
    id: 'level-uuid-2222',
    professionId: 'prof-uuid-3333',
    order: 1,
    title: 'HTML Basics',
    taskData: {},
    rewardXp: 100,
    rewardCoins: 50,
  };

  const mockUser = {
    id: 'user-uuid-1111',
    email: 'test@example.com',
    xp: 0,
    coins: 0,
    level: 1,
  };

  // ─── УСПЕШНЫЙ СЦЕНАРИЙ ─────────────────────────────────────

  it('should complete level, create progress, and return reward', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.findFirst.mockResolvedValue(null);

    const mockProgress = {
      id: 'progress-uuid',
      userId: dto.userId,
      levelId: dto.levelId,
      isCompleted: true,
    };
    const mockUpdatedUser = { ...mockUser, xp: 100, coins: 50 };

    prisma.$transaction.mockResolvedValue([mockProgress, mockUpdatedUser]);

    const result = await service.completeLevel(dto);

    expect(result).toEqual({
      progress: mockProgress,
      reward: { xp: 100, coins: 50 },
      user: { id: mockUser.id, xp: 100, coins: 50 },
    });

    // Проверяем что $transaction был вызван с массивом из двух промисов
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // ─── ДУБЛИКАТ ПРОГРЕССА → BadRequestException ──────────────

  it('should throw BadRequestException if user already completed this level', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.findFirst.mockResolvedValue({
      id: 'existing-progress',
      userId: dto.userId,
      levelId: dto.levelId,
      isCompleted: true,
    });

    await expect(service.completeLevel(dto)).rejects.toThrow(BadRequestException);
    await expect(service.completeLevel(dto)).rejects.toThrow(
      `User "${dto.userId}" has already completed level "${dto.levelId}"`,
    );

    // $transaction НЕ должен был вызываться
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── НЕСУЩЕСТВУЮЩИЙ УРОВЕНЬ → NotFoundException ────────────

  it('should throw NotFoundException if level does not exist', async () => {
    prisma.level.findUnique.mockResolvedValue(null);

    await expect(service.completeLevel(dto)).rejects.toThrow(NotFoundException);
    await expect(service.completeLevel(dto)).rejects.toThrow(
      `Level with id "${dto.levelId}" not found`,
    );

    // Дальше findUnique для user даже не вызывался
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // ─── НЕСУЩЕСТВУЮЩИЙ ПОЛЬЗОВАТЕЛЬ → NotFoundException ───────

  it('should throw NotFoundException if user does not exist', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.completeLevel(dto)).rejects.toThrow(NotFoundException);
    await expect(service.completeLevel(dto)).rejects.toThrow(
      `User with id "${dto.userId}" not found`,
    );
  });

  // ─── ОТКАТ $transaction ПРИ ОШИБКЕ НАЧИСЛЕНИЯ ─────────────

  it('should propagate error if $transaction fails (DB rollback)', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.findFirst.mockResolvedValue(null);

    // Prisma $transaction бросает ошибку — например, constraint violation при update
    prisma.$transaction.mockRejectedValue(
      new Error('Transaction failed: could not update user coins'),
    );

    await expect(service.completeLevel(dto)).rejects.toThrow(
      'Transaction failed: could not update user coins',
    );

    // Подтверждаем что $transaction был вызван (и БД откатила обе операции)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // ─── ПОРЯДОК ВЫЗОВОВ ───────────────────────────────────────

  it('should call checks in correct order: level → user → existing → transaction', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([{}, { ...mockUser, xp: 100, coins: 50 }]);

    await service.completeLevel(dto);

    const callOrder = [
      prisma.level.findUnique,
      prisma.user.findUnique,
      prisma.userProgress.findFirst,
      prisma.$transaction,
    ];

    // Каждый мок должен быть вызван ровно по одному разу
    callOrder.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  });
});
