import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateProfessionDto {
  @ApiPropertyOptional({ example: 'Backend Developer', description: 'Новое название профессии' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ example: 'Серверная разработка', description: 'Новое описание профессии' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;
}

