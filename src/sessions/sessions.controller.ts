import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { SessionsService } from './sessions.service';
import { StartSessionDto, SubmitAnswerDto } from './dto/session.dto';
import { Public } from '../auth/public.decorator';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  // Прохождение открыто без логина: жюри должно открыть демо по ссылке с телефона.
  // Начисление XP и профиль пользователя — за токеном, это разные вещи.
  @Public()
  @Post()
  @ApiOperation({ summary: 'Начать прохождение и получить первый вопрос' })
  @ApiResponse({ status: 201, description: 'Сессия создана, первый вопрос выдан.' })
  @ApiResponse({ status: 400, description: 'Нет согласия на обработку ответов моделью.' })
  start(@Body() dto: StartSessionDto) {
    return this.sessions.start(dto);
  }

  @Public()
  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Отправить свободный ответ и получить следующий шаг' })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  @ApiResponse({ status: 200, description: 'Разбор ответа и следующий вопрос или проба.' })
  @ApiResponse({ status: 409, description: 'Сессия завершена или нет открытого вопроса.' })
  @ApiResponse({ status: 503, description: 'Модель недоступна.' })
  submitAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.sessions.submitAnswer(id, dto);
  }

  @Public()
  @Get(':id/result')
  @ApiOperation({ summary: 'Результат: профиль, профессии и данные рынка труда РК' })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  result(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.result(id);
  }

  @Public()
  @Sse(':id/parent-letter')
  @ApiOperation({
    summary: 'Письмо родителям, потоком (SSE)',
    description:
      'События text содержат куски текста по мере генерации, done — признак конца.',
  })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  parentLetter(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    const stream = this.sessions.streamParentLetter(id);

    return new Observable<MessageEvent>((subscriber) => {
      let cancelled = false;

      // Пока модель думает над первым словом, поток молчит секунд десять.
      // Мобильный оператор или конференционный Wi-Fi успевают счесть такое
      // соединение мёртвым и закрыть его. Пульс это предотвращает; фронт
      // игнорирует пакеты без text и done, поэтому менять его не нужно.
      const heartbeat = setInterval(() => {
        if (!cancelled) subscriber.next({ data: { ping: true } } as MessageEvent);
      }, 5000);

      void (async () => {
        try {
          for await (const chunk of stream) {
            if (cancelled) return;
            subscriber.next({ data: { text: chunk } } as MessageEvent);
          }
          subscriber.next({ data: { done: true } } as MessageEvent);
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();

      // Читатель закрыл вкладку — не дописываем письмо в пустоту.
      return () => {
        cancelled = true;
        clearInterval(heartbeat);
        void stream.return(undefined);
      };
    });
  }
}
