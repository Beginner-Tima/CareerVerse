import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL environment variable is required for Prisma client initialization.',
  );
}

const logger = new Logger('PrismaService');

// Supabase отдаёт сертификат своего частного CA («Supabase Intermediate 2021 CA»),
// системному хранилищу доверенных корней он неизвестен. Новый драйвер pg трактует
// sslmode=require как verify-full и рвёт соединение — поэтому TLS настраиваем здесь
// явно, а не через параметры строки подключения.
function tlsConfig() {
  const ca = process.env.SUPABASE_CA_CERT;
  if (ca) {
    // Правильный режим: шифрование + проверка сертификата по CA Supabase.
    // Сертификат берётся в дашборде: Project Settings → Database → SSL configuration.
    return { ca, rejectUnauthorized: true };
  }
  if (/pooler\.supabase\.com|supabase\.co/.test(connectionString!)) {
    logger.warn(
      'SUPABASE_CA_CERT не задан: соединение с базой шифруется, но сертификат сервера не проверяется. ' +
        'Для продакшена скачайте CA в дашборде Supabase и положите его в SUPABASE_CA_CERT.',
    );
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/**
 * В serverless каждый инстанс держит свой пул, а инстансов может быть много.
 * Supavisor в transaction mode (порт 6543) рассчитан именно на это, но пул на
 * стороне приложения должен быть маленьким, иначе лимит соединений выедается
 * холодными стартами.
 */
const poolMax = Number(
  process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 1 : 10),
);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString,
        ssl: tlsConfig(),
        max: poolMax,
        // Долгие SSE-ответы не должны держать соединение к базе.
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 15_000,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
