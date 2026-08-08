import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StartSessionDto {
  @ApiPropertyOptional({ enum: Locale, default: Locale.RU })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @ApiPropertyOptional({
    description:
      'Класс, 7-11. Не формальность: под него калибруются примеры и сложность рабочей пробы.',
    minimum: 7,
    maximum: 11,
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(11)
  grade?: number;

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

export class CareerPlanDto {
  @ApiPropertyOptional({
    description:
      'Что человек сам добавил о себе: город, оценки, обстоятельства. План пересобирается под этот контекст.',
    example: 'Живу в Шымкенте, по математике 4, из дома уезжать не планирую.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;
}
