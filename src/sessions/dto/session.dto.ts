import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StartSessionDto {
  @ApiPropertyOptional({ enum: Locale, default: Locale.RU })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @ApiProperty({
    description:
      'Согласие на обработку ответов моделью. Требование закона РК № 230-VIII об ИИ (с 18.01.2026).',
    example: true,
  })
  @IsBoolean()
  consentAccepted: boolean;
}

export class SubmitAnswerDto {
  @ApiProperty({
    description: 'Свободный ответ подростка. Ключа ответов у теста нет — оценивает модель.',
    example: 'Мне нравится разбираться, почему в игре тормозит сервер, а не рисовать картинки.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}
