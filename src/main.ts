import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api');

  app.useGlobalFilters(new PrismaExceptionFilter());

  // Глобальная валидация DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // отрезает лишние поля
      forbidNonWhitelisted: true, // ошибка при наличии лишних полей
      transform: true,       // автоматически преобразует типы
    }),
  );

  // Swagger документация
  const config = new DocumentBuilder()
    .setTitle('CareerVerse API')
    .setDescription('Документация API для мобильного приложения CareerVerse')
    .setVersion('1.0')
    .addTag('professions', 'Управление профессиями')
    .addTag('progress', 'Прогресс пользователя')
    .addTag('users', 'Профили пользователей')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 Server running on http://localhost:${process.env.PORT ?? 3000}/api`);
  console.log(`📖 Swagger docs: http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}
bootstrap();

