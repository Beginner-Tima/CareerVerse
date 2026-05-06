import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = () => ({
  user: {
    findUnique: jest.fn(),
  },
  profession: {
    findMany: jest.fn(),
  },
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useFactory: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService) as unknown as ReturnType<typeof mockPrismaService>;
  });

  const userId = 'user-uuid-1111';

  // ─── ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН ──────────────────────────────

  it('should throw NotFoundException if user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getStats(userId)).rejects.toThrow(NotFoundException);
    // profession.findMany не должен вызываться если юзера нет
    expect(prisma.profession.findMany).not.toHaveBeenCalled();
  });

  // ─── ПОЛЬЗОВАТЕЛЬ БЕЗ ПРОГРЕССА ──────────────────────────

  it('should return empty completedProfessions when user has no progress', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'test@mail.com',
      xp: 0,
      coins: 0,
      level: 1,
      progress: [],
    });

    prisma.profession.findMany.mockResolvedValue([
      {
        id: 'prof-1',
        title: 'Frontend',
        description: 'desc',
        levels: [{ id: 'lvl-1' }, { id: 'lvl-2' }],
      },
    ]);

    const result = await service.getStats(userId);

    expect(result).toEqual({
      id: userId,
      email: 'test@mail.com',
      xp: 0,
      coins: 0,
      level: 1,
      completedLevelsCount: 0,
      completedProfessions: [],
    });
  });

  // ─── ЧАСТИЧНОЕ ПРОХОЖДЕНИЕ — ПРОФЕССИЯ НЕ ЗАВЕРШЕНА ──────

  it('should NOT mark profession as completed if only some levels are done', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'test@mail.com',
      xp: 100,
      coins: 50,
      level: 2,
      progress: [{ levelId: 'lvl-1' }], // только 1 из 3
    });

    prisma.profession.findMany.mockResolvedValue([
      {
        id: 'prof-1',
        title: 'Frontend',
        description: 'desc',
        levels: [{ id: 'lvl-1' }, { id: 'lvl-2' }, { id: 'lvl-3' }],
      },
    ]);

    const result = await service.getStats(userId);

    expect(result.completedLevelsCount).toBe(1);
    expect(result.completedProfessions).toEqual([]);
  });

  // ─── ВСЕ УРОВНИ ПРОЙДЕНЫ — ПРОФЕССИЯ ЗАВЕРШЕНА ───────────

  it('should mark profession as completed when ALL levels are done', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'test@mail.com',
      xp: 300,
      coins: 150,
      level: 3,
      progress: [{ levelId: 'lvl-1' }, { levelId: 'lvl-2' }],
    });

    prisma.profession.findMany.mockResolvedValue([
      {
        id: 'prof-1',
        title: 'Frontend',
        description: 'Web UI development',
        levels: [{ id: 'lvl-1' }, { id: 'lvl-2' }],
      },
    ]);

    const result = await service.getStats(userId);

    expect(result.completedProfessions).toEqual([
      {
        id: 'prof-1',
        title: 'Frontend',
        description: 'Web UI development',
        totalLevels: 2,
      },
    ]);
    expect(result.completedLevelsCount).toBe(2);
  });

  // ─── НЕСКОЛЬКО ПРОФЕССИЙ: ОДНА ЗАВЕРШЕНА, ДРУГАЯ НЕТ ─────

  it('should correctly filter across multiple professions', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'test@mail.com',
      xp: 500,
      coins: 250,
      level: 5,
      progress: [
        { levelId: 'fe-1' },
        { levelId: 'fe-2' },
        { levelId: 'be-1' },
        // be-2 NOT completed
      ],
    });

    prisma.profession.findMany.mockResolvedValue([
      {
        id: 'prof-fe',
        title: 'Frontend',
        description: 'fe desc',
        levels: [{ id: 'fe-1' }, { id: 'fe-2' }], // все пройдены
      },
      {
        id: 'prof-be',
        title: 'Backend',
        description: 'be desc',
        levels: [{ id: 'be-1' }, { id: 'be-2' }], // 1 из 2
      },
    ]);

    const result = await service.getStats(userId);

    expect(result.completedProfessions).toHaveLength(1);
    expect(result.completedProfessions[0].title).toBe('Frontend');
    expect(result.completedLevelsCount).toBe(3);
  });

  // ─── ПРОФЕССИЯ БЕЗ УРОВНЕЙ НЕ СЧИТАЕТСЯ ЗАВЕРШЁННОЙ ─────

  it('should NOT mark profession without levels as completed', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'test@mail.com',
      xp: 0,
      coins: 0,
      level: 1,
      progress: [],
    });

    prisma.profession.findMany.mockResolvedValue([
      {
        id: 'empty-prof',
        title: 'Empty Profession',
        description: 'no levels',
        levels: [], // пустой массив — levels.length === 0
      },
    ]);

    const result = await service.getStats(userId);

    expect(result.completedProfessions).toEqual([]);
  });
});
