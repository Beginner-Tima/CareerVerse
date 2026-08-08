import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

/**
 * Точка входа для serverless на Vercel. От `main.ts` отличается тем, что порт
 * никто не слушает: Vercel сам вызывает express-обработчик на каждый запрос.
 *
 * Приложение поднимается один раз на инстанс и переживает последующие запросы —
 * иначе каждый вызов платил бы полный старт Nest плюс подключение к базе.
 */
let cached: express.Express | null = null;
let booting: Promise<express.Express> | null = null;

async function bootstrap(): Promise<express.Express> {
  const server = express();
  const app = configureApp(
    await NestFactory.create(AppModule, new ExpressAdapter(server), {
      // На Vercel логи и так собираются платформой, а болтливый старт
      // растягивает холодный запуск.
      logger: ['error', 'warn'],
    }),
  );
  await app.init();
  cached = server;
  return server;
}

export default async function handler(req: express.Request, res: express.Response) {
  if (!cached) {
    // Параллельные запросы в холодный инстанс не должны поднимать Nest дважды.
    booting ??= bootstrap();
    await booting;
  }
  return cached!(req, res);
}
