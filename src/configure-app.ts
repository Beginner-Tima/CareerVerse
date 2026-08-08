import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';

/**
 * Настройка приложения, общая для локального запуска (`src/main.ts`) и для
 * serverless-функции на Vercel (`src/vercel.ts`). Держим её в одном месте:
 * разошедшиеся конфигурации — верный способ получить прод, который ведёт себя
 * не так, как локальная разработка.
 */
export function configureApp(app: INestApplication) {
  // На проде фронт живёт на своём домене. Список берётся из CORS_ORIGINS
  // (через запятую); пустое значение означает «разрешить всем» и годится
  // только для локальной разработки.
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors(
    origins.length > 0
      ? { origin: origins, credentials: false }
      : { origin: true, credentials: false },
  );

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // отрезает лишние поля
      forbidNonWhitelisted: true, // ошибка при наличии лишних полей
      transform: true, // автоматически преобразует типы
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('CareerVerse API')
    .setDescription('Адаптивный профориентационный тест: вопросы, рабочие пробы, письмо родителям')
    .setVersion('1.0')
    .addTag('sessions', 'Адаптивный тест: вопросы, пробы, письмо родителям')
    .addTag('professions', 'Каталог профессий')
    .addTag('progress', 'Прогресс пользователя')
    .addTag('users', 'Профили пользователей')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  return app;
}
