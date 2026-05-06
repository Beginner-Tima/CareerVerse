import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProfessionDto {
  @ApiProperty({ example: 'Frontend Developer', description: 'Название профессии' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Разработка веб-интерфейсов', description: 'Описание профессии' })
  @IsString()
  @IsNotEmpty()
  description: string;
}
