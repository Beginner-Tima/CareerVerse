import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';

// Вся логика ИИ живёт в бэкенде: ключ модели не уходит на клиент,
// а фронт получает готовый API со Swagger и SSE.
@Module({
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class AiModule {}
