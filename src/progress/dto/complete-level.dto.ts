import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CompleteLevelDto {
  @ApiProperty({
    example: 'b1ffcd00-0d1c-4fe9-8c7e-7cc0ce491b22',
    description: 'UUID уровня',
  })
  @IsUUID()
  levelId: string;
}

// userId в теле больше нет — он берётся из Bearer-токена.
// Тип для сервиса, где userId уже проверен guard'ом.
export interface CompleteLevelInput {
  userId: string;
  levelId: string;
}
