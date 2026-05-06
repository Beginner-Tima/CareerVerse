import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E-тест для POST /api/progress/complete
 *
 * Стратегия: подменяем PrismaService целиком через overrideProvider,
 * чтобы не зависеть от реальной БД. Это позволяет тестировать
 * HTTP-слой (validation pipe, status codes, JSON-структуру)
 * без PostgreSQL.
 */
describe('ProgressController (e2e)', () => {
  let app: INestApplication;

  const mockPrisma = {
    level: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    userProgress: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
    $connect: jest.fn(),
    // Prisma delegates, нужны чтобы AppModule не упал при инициализации
    profession: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validDto = {
    userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    levelId: 'b1ffcd00-0d1c-4fe9-8c7e-7cc0ce491b22',
  };

  // ─── 400: НЕВАЛИДНЫЙ UUID ──────────────────────────────────

  it('POST /api/progress/complete — 400 on invalid UUID', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send({ userId: 'not-a-uuid', levelId: 'also-not-uuid' })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toEqual(
          expect.arrayContaining([
            expect.stringContaining('userId must be a UUID'),
          ]),
        );
      });
  });

  // ─── 400: ПУСТОЕ ТЕЛО ─────────────────────────────────────

  it('POST /api/progress/complete — 400 on empty body', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toBeInstanceOf(Array);
        expect(res.body.message.length).toBeGreaterThanOrEqual(2);
      });
  });

  // ─── 400: ЛИШНИЕ ПОЛЯ (forbidNonWhitelisted) ──────────────

  it('POST /api/progress/complete — 400 on extra fields', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send({ ...validDto, hackerField: 'inject' })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toEqual(
          expect.arrayContaining([
            expect.stringContaining('hackerField'),
          ]),
        );
      });
  });

  // ─── 404: УРОВЕНЬ НЕ НАЙДЕН ───────────────────────────────

  it('POST /api/progress/complete — 404 when level not found', () => {
    mockPrisma.level.findUnique.mockResolvedValue(null);

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send(validDto)
      .expect(404)
      .expect((res) => {
        expect(res.body.message).toContain(validDto.levelId);
      });
  });

  // ─── 400: ДУБЛИКАТ ПРОГРЕССА ───────────────────────────────

  it('POST /api/progress/complete — 400 when already completed', () => {
    mockPrisma.level.findUnique.mockResolvedValue({ id: validDto.levelId, rewardXp: 50, rewardCoins: 25 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: validDto.userId });
    mockPrisma.userProgress.findFirst.mockResolvedValue({ id: 'existing' });

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send(validDto)
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain('already completed');
      });
  });

  // ─── 200: УСПЕШНОЕ ЗАВЕРШЕНИЕ ──────────────────────────────

  it('POST /api/progress/complete — 200 with correct JSON structure on success', () => {
    const mockLevel = { id: validDto.levelId, rewardXp: 100, rewardCoins: 50 };
    const mockProgress = { id: 'prog-id', userId: validDto.userId, levelId: validDto.levelId, isCompleted: true };
    const mockUpdatedUser = { id: validDto.userId, xp: 100, coins: 50 };

    mockPrisma.level.findUnique.mockResolvedValue(mockLevel);
    mockPrisma.user.findUnique.mockResolvedValue({ id: validDto.userId, xp: 0, coins: 0 });
    mockPrisma.userProgress.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockResolvedValue([mockProgress, mockUpdatedUser]);

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send(validDto)
      .expect(200)
      .expect((res) => {
        // Проверяем полную структуру ответа
        expect(res.body).toHaveProperty('progress');
        expect(res.body).toHaveProperty('reward');
        expect(res.body).toHaveProperty('user');

        expect(res.body.reward).toEqual({ xp: 100, coins: 50 });
        expect(res.body.user).toEqual({
          id: validDto.userId,
          xp: 100,
          coins: 50,
        });
        expect(res.body.progress.isCompleted).toBe(true);
      });
  });
});
