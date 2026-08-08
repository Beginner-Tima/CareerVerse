import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProgressService } from './progress.service';
import { PrismaService } from '../prisma/prisma.service';

// Фабрика мока PrismaService — полный контроль над каждым delegate.
// $transaction интерактивный: получает колбэк и передаёт ему тот же мок в роли tx.
const mockPrismaService = () => ({
  level: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userProgress: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
});

const duplicateKeyError = () =>
  new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`userId`,`levelId`)',
    {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['userId', 'levelId'] },
    },
  );

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
    prisma = module.get(PrismaService) as unknown as ReturnType<
      typeof mockPrismaService
    >;

    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );
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

    const mockProgress = {
      id: 'progress-uuid',
      userId: dto.userId,
      levelId: dto.levelId,
      isCompleted: true,
    };
    prisma.userProgress.create.mockResolvedValue(mockProgress);
    prisma.user.update.mockResolvedValue({ ...mockUser, xp: 100, coins: 50 });

    const result = await service.completeLevel(dto);

    expect(result).toEqual({
      progress: mockProgress,
      reward: { xp: 100, coins: 50 },
      user: { id: mockUser.id, xp: 100, coins: 50 },
    });

    // Вся работа — внутри одной интерактивной транзакции
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  // ─── ДУБЛИКАТ ЛОВИТ УНИКАЛЬНЫЙ ИНДЕКС → ConflictException ───

  it('should throw ConflictException when the unique index rejects a duplicate', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.create.mockRejectedValue(duplicateKeyError());

    await expect(service.completeLevel(dto)).rejects.toThrow(ConflictException);
    await expect(service.completeLevel(dto)).rejects.toThrow(
      `User "${dto.userId}" has already completed level "${dto.levelId}"`,
    );

    // Награда не начисляется: update даже не дошёл до вызова
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // ─── ГОНКА: ПАРАЛЛЕЛЬНЫЕ ЗАПРОСЫ ───────────────────────────

  it('should award exactly once when 8 requests race on the same level', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);

    // Индекс пропускает первый INSERT, остальные отбивает P2002
    let inserts = 0;
    prisma.userProgress.create.mockImplementation(() => {
      inserts += 1;
      return inserts === 1
        ? Promise.resolve({ id: 'progress-uuid', ...dto, isCompleted: true })
        : Promise.reject(duplicateKeyError());
    });
    prisma.user.update.mockResolvedValue({ ...mockUser, xp: 100, coins: 50 });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.completeLevel(dto)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) =>
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictException,
        ),
      );
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

    expect(prisma.userProgress.create).not.toHaveBeenCalled();
  });

  // ─── ОТКАТ ТРАНЗАКЦИИ ПРИ ОШИБКЕ НАЧИСЛЕНИЯ ────────────────

  it('should propagate error if the reward update fails (DB rollback)', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.create.mockResolvedValue({ id: 'progress-uuid' });
    prisma.user.update.mockRejectedValue(
      new Error('Transaction failed: could not update user coins'),
    );

    await expect(service.completeLevel(dto)).rejects.toThrow(
      'Transaction failed: could not update user coins',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // ─── ПОРЯДОК ВЫЗОВОВ ───────────────────────────────────────

  it('should call checks in correct order: level → user → create → update', async () => {
    prisma.level.findUnique.mockResolvedValue(mockLevel);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userProgress.create.mockResolvedValue({ id: 'progress-uuid' });
    prisma.user.update.mockResolvedValue({ ...mockUser, xp: 100, coins: 50 });

    await service.completeLevel(dto);

    [
      prisma.level.findUnique,
      prisma.user.findUnique,
      prisma.userProgress.create,
      prisma.user.update,
    ].forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  });
});
