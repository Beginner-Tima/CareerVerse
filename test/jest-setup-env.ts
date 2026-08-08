import 'dotenv/config';

/**
 * Юнит- и e2e-тесты подменяют PrismaService моками, но модуль
 * src/prisma/prisma.service.ts проверяет DATABASE_URL уже на этапе импорта.
 * Подставляем заглушки, если переменных нет в .env, — тогда тесты
 * запускаются без реального PostgreSQL.
 */
process.env.DATABASE_URL ??=
  'postgresql://test:test@localhost:5432/careerverse_test?schema=public';
process.env.SUPABASE_JWT_SECRET ??= 'test-jwt-secret';
