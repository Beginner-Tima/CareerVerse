import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Как обращаться. Настоящее имя не требуется и не проверяется.',
    example: 'Тамир',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @ApiProperty({ description: 'Класс, 7-11', minimum: 7, maximum: 11, example: 11 })
  @IsInt()
  @Min(7)
  @Max(11)
  grade: number;

  @ApiPropertyOptional({ description: 'Город — нужен для советов про вузы и работу', example: 'Алматы' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'Код входа, выданный при регистрации. Заменяет пару логин-пароль.',
    example: 'K7WF-3RTM',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/, {
    message: 'Код входа выглядит как K7WF-3RTM: восемь символов и дефис.',
  })
  code: string;
}
