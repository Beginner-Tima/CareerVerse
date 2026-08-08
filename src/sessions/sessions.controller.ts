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
import { CareerPlanDto, StartSessionDto, SubmitAnswerDto } from './dto/session.dto';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

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

  // Проба не входит в тест: разговор заканчивается результатом, а сюда человек
  // приходит сам, с экрана результата, если захотел попробовать работу руками.
  @Public()
  @Post(':id/trial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Начать рабочую пробу по подобранной профессии',
    description:
      'Возвращает первый шаг пробы. Если проба уже идёт — отдаёт текущий шаг, а не создаёт новый.',
  })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  @ApiResponse({ status: 200, description: 'Проба началась, первый шаг выдан.' })
  @ApiResponse({ status: 409, description: 'Разговор не пройден или проба уже завершена.' })
  startTrial(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.startTrial(id);
  }

  // Единственный роут прохождения за токеном — и осознанно: это уже не «пройти
  // тест», а «положить результат себе в аккаунт и получить за него очки».
  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Сохранить прохождение в аккаунт и получить награду',
    description:
      'Тест проходится без логина. Аккаунт предлагается после результата, сессия привязывается задним числом. Начисление одноразовое.',
  })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  @ApiResponse({ status: 200, description: 'Сессия привязана, награда начислена.' })
  @ApiResponse({ status: 409, description: 'Прохождение не закончено или уже сохранено.' })
  claim(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.sessions.claim(id, userId);
  }

  @Post(':id/mentor-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Разбор рабочей пробы наставником — за очки',
    description: 'Списывает очки со счёта и разбирает пробу по ответам самого подростка.',
  })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  @ApiResponse({ status: 200, description: 'Разбор готов (или уже был куплен раньше).' })
  @ApiResponse({ status: 403, description: 'Прохождение принадлежит другому аккаунту.' })
  @ApiResponse({ status: 409, description: 'Не хватает очков или проба не пройдена.' })
  mentorReview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.sessions.mentorReview(id, userId);
  }

  // План бесплатен и открыт: брать плату за то, ради чего подросток пришёл,
  // было бы странно, а требовать логин — потерять половину людей на результате.
  @Public()
  @Post(':id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Что делать дальше: ЕНТ, вузы РК, язык, путь к первой работе',
    description: 'Можно дописать контекст о себе — план пересоберётся под него.',
  })
  @ApiParam({ name: 'id', description: 'UUID сессии' })
  plan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CareerPlanDto) {
    return this.sessions.careerPlan(id, dto);
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
