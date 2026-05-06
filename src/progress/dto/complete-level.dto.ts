import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CompleteLevelDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', description: 'UUID пользователя' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'b1ffcd00-0d1c-5fg9-cc7e-7cc0ce491b22', description: 'UUID уровня' })
  @IsUUID()
  levelId: string;
}

