import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaExceptionFilter } from '../src/prisma/prisma-exception.filter';

/**
 * E2E-тест для POST /api/progress/complete
 *
 * Стратегия: подменяем PrismaService целиком через overrideProvider,
 * чтобы не зависеть от реальной БД. Это позволяет тестировать
 * HTTP-слой (guard, validation pipe, status codes, JSON-структуру)
 * без PostgreSQL.
 */
describe('ProgressController (e2e)', () => {
  let app: INestApplication;

  const mockPrisma = {
    level: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    userProgress: { create: jest.fn() },
    // Интерактивная транзакция: колбэк получает тот же мок в роли tx
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(mockPrisma)),
    $connect: jest.fn(),
    // Prisma delegates, нужны чтобы AppModule не упал при инициализации
    profession: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };

  const TOKEN_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const bearer = (userId = TOKEN_USER_ID) =>
    `Bearer ${jwt.sign({ sub: userId, email: 'teen@example.kz', role: 'authenticated' }, process.env.SUPABASE_JWT_SECRET!, { expiresIn: '1h' })}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new PrismaExceptionFilter());
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

  const validDto = { levelId: 'b1ffcd00-0d1c-4fe9-8c7e-7cc0ce491b22' };

  // ─── 401: БЕЗ ТОКЕНА ───────────────────────────────────────

  it('POST /api/progress/complete — 401 without a token', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .send(validDto)
      .expect(401)
      .expect(() => {
        // До сервиса запрос не доходит вообще
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });
  });

  it('POST /api/progress/complete — 401 with a token signed by a foreign secret', () => {
    const forged = jwt.sign({ sub: TOKEN_USER_ID }, 'SUPABASE_JWT_SECRET');

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', `Bearer ${forged}`)
      .send(validDto)
      .expect(401);
  });

  // ─── 400: НЕВАЛИДНЫЙ UUID ──────────────────────────────────

  it('POST /api/progress/complete — 400 on invalid UUID', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer())
      .send({ levelId: 'not-a-uuid' })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toEqual(
          expect.arrayContaining([
            expect.stringContaining('levelId must be a UUID'),
          ]),
        );
      });
  });

  // ─── 400: ПУСТОЕ ТЕЛО ─────────────────────────────────────

  it('POST /api/progress/complete — 400 on empty body', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer())
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toBeInstanceOf(Array);
      });
  });

  // ─── 400: userId В ТЕЛЕ БОЛЬШЕ НЕ ПРИНИМАЕТСЯ ─────────────

  it('POST /api/progress/complete — 400 when userId is passed in the body', () => {
    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer())
      .send({ ...validDto, userId: 'c2ffcd00-0d1c-4fe9-8c7e-7cc0ce491b33' })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('userId')]),
        );
      });
  });

  // ─── 404: УРОВЕНЬ НЕ НАЙДЕН ───────────────────────────────

  it('POST /api/progress/complete — 404 when level not found', () => {
    mockPrisma.level.findUnique.mockResolvedValue(null);

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer())
      .send(validDto)
      .expect(404)
      .expect((res) => {
        expect(res.body.message).toContain(validDto.levelId);
      });
  });

  // ─── 409: ДУБЛИКАТ ОТБИТ УНИКАЛЬНЫМ ИНДЕКСОМ ───────────────

  it('POST /api/progress/complete — 409 when already completed', () => {
    mockPrisma.level.findUnique.mockResolvedValue({ id: validDto.levelId, rewardXp: 50, rewardCoins: 25 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: TOKEN_USER_ID });
    mockPrisma.userProgress.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`userId`,`levelId`)',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['userId', 'levelId'] } },
      ),
    );

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer())
      .send(validDto)
      .expect(409)
      .expect((res) => {
        expect(res.body.message).toContain('already completed');
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });
  });

  // ─── 200: УСПЕШНОЕ ЗАВЕРШЕНИЕ ──────────────────────────────

  it('POST /api/progress/complete — 200 with correct JSON structure on success', () => {
    const mockLevel = { id: validDto.levelId, rewardXp: 100, rewardCoins: 50 };
    const mockProgress = { id: 'prog-id', userId: TOKEN_USER_ID, levelId: validDto.levelId, isCompleted: true };
    const mockUpdatedUser = { id: TOKEN_USER_ID, xp: 100, coins: 50 };

    mockPrisma.level.findUnique.mockResolvedValue(mockLevel);
    mockPrisma.user.findUnique.mockResolvedValue({ id: TOKEN_USER_ID, xp: 0, coins: 0 });
    mockPrisma.userProgress.create.mockResolvedValue(mockProgress);
    mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer())
      .send(validDto)
      .expect(200)
      .expect((res) => {
        // Проверяем полную структуру ответа
        expect(res.body).toHaveProperty('progress');
        expect(res.body).toHaveProperty('reward');
        expect(res.body).toHaveProperty('user');

        expect(res.body.reward).toEqual({ xp: 100, coins: 50 });
        expect(res.body.user).toEqual({
          id: TOKEN_USER_ID,
          xp: 100,
          coins: 50,
        });
        expect(res.body.progress.isCompleted).toBe(true);
      });
  });

  // ─── userId БЕРЁТСЯ ИЗ ТОКЕНА, А НЕ ИЗ ЗАПРОСА ─────────────

  it('awards the user from the token, not anyone else', () => {
    const otherUserId = 'd3ffcd00-0d1c-4fe9-8c7e-7cc0ce491b44';

    mockPrisma.level.findUnique.mockResolvedValue({ id: validDto.levelId, rewardXp: 10, rewardCoins: 5 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: otherUserId });
    mockPrisma.userProgress.create.mockResolvedValue({ id: 'prog-id', isCompleted: true });
    mockPrisma.user.update.mockResolvedValue({ id: otherUserId, xp: 10, coins: 5 });

    return request(app.getHttpServer())
      .post('/api/progress/complete')
      .set('Authorization', bearer(otherUserId))
      .send(validDto)
      .expect(200)
      .expect(() => {
        expect(mockPrisma.userProgress.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ userId: otherUserId }),
          }),
        );
      });
  });
});
