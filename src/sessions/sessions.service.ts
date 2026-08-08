import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Locale, Prisma, SessionStatus, TaskKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../ai/claude.service';
import { DialogueTurn, Learner, Signal } from '../ai/prompts';
import { CareerPlanDto, StartSessionDto, SubmitAnswerDto } from './dto/session.dto';

/**
 * Разговор длится столько, сколько нужно этому человеку, а не фиксированные три
 * вопроса. Ниже минимума профиль не собрать; выше максимума подросток устанет
 * и начнёт отвечать «норм» — тогда честнее остановиться и сказать, что видно.
 */
const CLARIFYING_MIN = 4;
const CLARIFYING_MAX = 10;

/**
 * Сколько раз подряд можно переспросить, если ответ ничего не дал. Дальше
 * человек явно не хочет говорить об этом — идём дальше, а не давим.
 */
const RETRY_LIMIT = 2;

/** Шагов рабочей пробы. Второй шаг вырастает из решения на первом. */
const TRIAL_ROUNDS = 2;

/**
 * Награда за прохождение. Считается так, чтобы после одного честного теста с
 * двумя шагами пробы хватало ровно на один разбор от наставника: 50 + 2×25 = 100.
 * Очки должны открывать следующий шаг, а не копиться годами.
 */
const REWARD_TEST_XP = 100;
const REWARD_TEST_COINS = 50;
const REWARD_TRIAL_XP = 50;
const REWARD_TRIAL_COINS = 25;
const MENTOR_COST_COINS = 100;
const XP_PER_LEVEL = 300;

/**
 * Первый вопрос один и тот же — он ничего не знает о человеке, генерировать его
 * моделью нечего. Всё, что дальше, рождается из предыдущего ответа.
 */
const OPENERS: Record<Locale, string> = {
  RU: 'Расскажи про что-нибудь, чем ты занимался в последний месяц и что тебя реально затянуло. Не обязательно про учёбу — игра, ремонт, спор, видео, что угодно. Что именно там было интересно?',
  KK: 'Соңғы айда айналысқан, шынымен қызықтырған бір нәрсе туралы айтып берші. Міндетті түрде оқу емес — ойын, жөндеу, айтыс, видео, кез келген нәрсе. Онда саған не қызық болды?',
};

const STATIC_OPENER_MODEL = 'static/opener';

interface StoredMatch {
  professionId: string;
  fit: number;
  because: string;
}

/** Что модель сказала про сам ответ — из него растут все решения о следующем шаге. */
interface AnswerVerdict {
  informative: boolean;
  enoughToMatch: boolean;
  confidence: number;
  missing: string;
}

type SessionWithRelations = Prisma.SessionGetPayload<{
  include: {
    interestProfile: true;
    parentLetter: true;
    mentorReview: true;
    careerPlan: true;
    tasks: { include: { answer: { include: { assessment: true } } } };
  };
}>;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Старт прохождения. Логина нет: жюри открывает демо по ссылке. */
  async start(dto: StartSessionDto) {
    if (!dto.consentAccepted) {
      throw new BadRequestException(
        'Без согласия на обработку ответов моделью тест начать нельзя.',
      );
    }

    const locale = dto.locale ?? Locale.RU;

    const session = await this.prisma.session.create({
      data: {
        locale,
        grade: dto.grade ?? null,
        consentAcceptedAt: new Date(),
        interestProfile: { create: { traits: [] } },
        tasks: {
          create: {
            kind: TaskKind.CLARIFYING_QUESTION,
            order: 0,
            prompt: OPENERS[locale],
            modelId: STATIC_OPENER_MODEL,
          },
        },
      },
      include: { tasks: true },
    });

    return {
      sessionId: session.id,
      locale: session.locale,
      grade: session.grade,
      task: this.viewTask(session.tasks[0]),
      progress: { asked: 0, min: CLARIFYING_MIN, max: CLARIFYING_MAX, stage: 'questions' },
      disclaimer: this.disclaimer(locale),
    };
  }

  /**
   * Принимает свободный ответ, разбирает его моделью и рождает следующий шаг:
   * ещё один вопрос, переспрос того же самого, шаг рабочей пробы или финал.
   */
  async submitAnswer(sessionId: string, dto: SubmitAnswerDto) {
    const session = await this.loadSession(sessionId);

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new ConflictException('Эта сессия уже завершена.');
    }

    const current = session.tasks.find((t) => t.answer === null);
    if (!current) {
      throw new ConflictException('Нет вопроса, который ждёт ответа.');
    }

    const learner = this.learnerOf(session);
    const signals = this.signalsOf(session.interestProfile?.traits);
    const dialogue = this.dialogueOf(session.tasks);

    const assessment = await this.claude.assessAnswer(learner, {
      question: current.prompt,
      answer: dto.text,
      signals,
    });

    // Пустой ответ не должен двигать профиль: раньше уверенность считалась как
    // «количество вопросов × 0.2» и росла от «не знаю» ровно так же, как от
    // развёрнутого рассказа. Теперь её называет модель, глядя на содержание.
    const merged = this.mergeSignals(signals, assessment.signals);
    const verdict: AnswerVerdict = {
      informative: assessment.informative,
      enoughToMatch: assessment.enoughToMatch,
      confidence: assessment.confidence,
      missing: assessment.missing,
    };

    await this.prisma.$transaction(async (tx) => {
      const answer = await tx.answer.create({
        data: { taskInstanceId: current.id, text: dto.text },
      });
      await tx.assessment.create({
        data: {
          answerId: answer.id,
          summary: assessment.summary,
          feedback: assessment.feedback,
          signals: assessment.signals as unknown as Prisma.InputJsonValue,
          scores: verdict as unknown as Prisma.InputJsonValue,
          modelId: this.claude.model,
        },
      });
      await tx.interestProfile.update({
        where: { sessionId: session.id },
        data: {
          traits: merged as unknown as Prisma.InputJsonValue,
          confidence: assessment.confidence,
        },
      });
    });

    const answeredDialogue: DialogueTurn[] = [
      ...dialogue,
      { question: current.prompt, answer: dto.text },
    ];

    const next = await this.buildNextStep({
      session,
      learner,
      dialogue: answeredDialogue,
      signals: merged,
      current,
      answerText: dto.text,
      verdict,
    });

    return {
      assessment: { summary: assessment.summary, feedback: assessment.feedback },
      profile: merged,
      task: next.task,
      finished: next.finished,
      progress: next.progress,
      generatedByAi: true,
    };
  }

  /** Результат прохождения: профиль, подобранные профессии и рынок труда РК. */
  async result(sessionId: string) {
    const session = await this.loadSession(sessionId);
    const matches = this.matchesOf(session.interestProfile?.topProfessions);

    if (matches.length === 0) {
      throw new ConflictException(
        'Профессии ещё не подобраны — сначала пройди вопросы и рабочую пробу.',
      );
    }

    const professions = await this.prisma.profession.findMany({
      where: { id: { in: matches.map((m) => m.professionId) } },
      include: { marketData: true },
    });

    return {
      sessionId: session.id,
      status: session.status,
      grade: session.grade,
      claimed: session.claimedAt !== null,
      reward: this.rewardFor(session),
      profile: this.signalsOf(session.interestProfile?.traits),
      confidence: session.interestProfile?.confidence ?? 0,
      matches: matches.map((m) => {
        const profession = professions.find((p) => p.id === m.professionId);
        return {
          fit: m.fit,
          because: m.because,
          profession: profession && {
            id: profession.id,
            title: profession.title,
            titleKk: profession.titleKk,
            description: profession.description,
          },
          labourMarket: profession?.marketData && {
            medianSalaryKzt: profession.marketData.medianSalaryKzt,
            vacancyCount: profession.marketData.vacancyCount,
            demandTrend: profession.marketData.demandTrend,
            regions: profession.marketData.regions,
            source: profession.marketData.source,
            collectedAt: profession.marketData.collectedAt,
          },
        };
      }),
      dialogue: this.dialogueOf(session.tasks),
      disclaimer: this.disclaimer(session.locale),
    };
  }

  /**
   * Письмо родителям. Отдаётся кусками — на защите видно, как оно печатается.
   * Готовый текст сохраняем, чтобы второй раз не платить за генерацию.
   */
  async *streamParentLetter(sessionId: string): AsyncGenerator<string> {
    const session = await this.loadSession(sessionId);

    if (session.parentLetter) {
      yield session.parentLetter.content;
      return;
    }

    const matches = this.matchesOf(session.interestProfile?.topProfessions);
    if (matches.length === 0) {
      throw new ConflictException('Письмо можно собрать только после рабочей пробы.');
    }

    const professions = await this.prisma.profession.findMany({
      where: { id: { in: matches.map((m) => m.professionId) } },
      select: { id: true, title: true },
    });

    const chunks: string[] = [];
    for await (const chunk of this.claude.streamParentLetter(this.learnerOf(session), {
      dialogue: this.dialogueOf(session.tasks),
      signals: this.signalsOf(session.interestProfile?.traits),
      topProfessions: matches
        .map((m) => professions.find((p) => p.id === m.professionId)?.title)
        .filter((t): t is string => Boolean(t)),
    })) {
      chunks.push(chunk);
      yield chunk;
    }

    await this.prisma.parentLetter.create({
      data: {
        sessionId: session.id,
        locale: session.locale,
        content: chunks.join(''),
        modelId: this.claude.model,
      },
    });
  }

  /**
   * Привязывает уже пройденный тест к аккаунту и начисляет награду.
   *
   * Тест проходят без логина — иначе жюри упрётся в форму на первом же экране.
   * Аккаунт предлагается после результата, и сессия привязывается задним числом.
   * Начисление одноразовое, и защищает его не проверка, а сам UPDATE: условие
   * `userId IS NULL` живёт внутри запроса, поэтому два параллельных «сохранить»
   * дают одно начисление и один 409 — та же механика, что у наград за уровень.
   */
  async claim(sessionId: string, userId: string) {
    const session = await this.loadSession(sessionId);

    if (session.status !== SessionStatus.COMPLETED) {
      throw new ConflictException(
        'Сохранить можно только законченное прохождение — дойди до конца пробы.',
      );
    }
    if (session.userId && session.userId !== userId) {
      throw new ForbiddenException('Это прохождение уже сохранено другим аккаунтом.');
    }

    const reward = this.rewardFor(session);

    return this.prisma.$transaction(async (tx) => {
      const bound = await tx.session.updateMany({
        where: { id: sessionId, userId: null, claimedAt: null },
        data: { userId, claimedAt: new Date() },
      });
      if (bound.count === 0) {
        throw new ConflictException('Это прохождение уже сохранено.');
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: {
          xp: { increment: reward.xp },
          coins: { increment: reward.coins },
        },
      });

      // User.level до сих пор не менялся нигде — теперь он растёт от XP.
      const level = Math.floor(user.xp / XP_PER_LEVEL) + 1;
      const withLevel =
        level === user.level
          ? user
          : await tx.user.update({ where: { id: userId }, data: { level } });

      return {
        reward,
        user: {
          id: withLevel.id,
          name: withLevel.name,
          xp: withLevel.xp,
          coins: withLevel.coins,
          level: withLevel.level,
        },
      };
    });
  }

  /**
   * Разбор пробы наставником — единственное, на что тратятся очки.
   *
   * Очки списываются до генерации: иначе два одновременных нажатия дали бы два
   * разбора по цене одного. Если модель упала — деньги возвращаем, счёт человека
   * не должен страдать от нашей недоступности.
   */
  async mentorReview(sessionId: string, userId: string) {
    const session = await this.loadSession(sessionId);

    if (session.userId !== userId) {
      throw new ForbiddenException(
        'Разбор доступен только по своему прохождению — сначала сохрани его.',
      );
    }
    if (session.mentorReview) {
      return {
        content: session.mentorReview.content,
        costCoins: session.mentorReview.costCoins,
        alreadyPaid: true,
        generatedByAi: true,
      };
    }

    const trial = this.lastTrialTask(session);
    if (!trial) {
      throw new ConflictException('Разбирать пока нечего — рабочая проба не пройдена.');
    }

    const charged = await this.prisma.user.updateMany({
      where: { id: userId, coins: { gte: MENTOR_COST_COINS } },
      data: { coins: { decrement: MENTOR_COST_COINS } },
    });
    if (charged.count === 0) {
      throw new ConflictException(
        `На разбор нужно ${MENTOR_COST_COINS} очков — пройди ещё одну пробу.`,
      );
    }

    try {
      const professionTitle = this.professionTitleOf(trial);
      const review = await this.claude.mentorReview(this.learnerOf(session), {
        professionTitle,
        dialogue: this.dialogueOf(session.tasks),
        signals: this.signalsOf(session.interestProfile?.traits),
      });

      const saved = await this.prisma.mentorReview.create({
        data: {
          sessionId: session.id,
          userId,
          content: review as unknown as Prisma.InputJsonValue,
          costCoins: MENTOR_COST_COINS,
          modelId: this.claude.model,
        },
      });

      return {
        content: saved.content,
        costCoins: saved.costCoins,
        alreadyPaid: false,
        generatedByAi: true,
      };
    } catch (error) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { coins: { increment: MENTOR_COST_COINS } },
      });
      throw error;
    }
  }

  /**
   * Что делать дальше: ЕНТ, вузы РК, язык, путь к первой работе. Бесплатно и без
   * логина — брать плату за то, ради чего подросток пришёл, было бы странно.
   * Человек может дописать о себе контекст, тогда план пересобирается под него.
   */
  async careerPlan(sessionId: string, dto: CareerPlanDto) {
    const session = await this.loadSession(sessionId);
    const context = dto.context?.trim() || null;

    if (session.careerPlan && session.careerPlan.context === context) {
      return {
        content: session.careerPlan.content,
        context: session.careerPlan.context,
        generatedByAi: true,
        disclaimer: this.planDisclaimer(session.locale),
      };
    }

    const matches = this.matchesOf(session.interestProfile?.topProfessions);
    if (matches.length === 0) {
      throw new ConflictException('План можно собрать только после рабочей пробы.');
    }

    const profession = await this.prisma.profession.findUnique({
      where: { id: matches[0].professionId },
    });
    if (!profession) {
      throw new NotFoundException('Профессия из подбора больше не найдена в каталоге.');
    }

    const plan = await this.claude.nextSteps(this.learnerOf(session), {
      professionTitle: profession.title,
      professionDescription: profession.description,
      signals: this.signalsOf(session.interestProfile?.traits),
      context,
    });

    const content = plan as unknown as Prisma.InputJsonValue;
    const saved = await this.prisma.careerPlan.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        professionId: profession.id,
        context,
        content,
        modelId: this.claude.model,
      },
      update: { professionId: profession.id, context, content, modelId: this.claude.model },
    });

    return {
      content: saved.content,
      context: saved.context,
      generatedByAi: true,
      disclaimer: this.planDisclaimer(session.locale),
    };
  }

  // ─── Внутреннее ────────────────────────────────────────────

  /** Решает, что дальше: переспрос, ещё вопрос, шаг пробы или финал. */
  private async buildNextStep(params: {
    session: SessionWithRelations;
    learner: Learner;
    dialogue: DialogueTurn[];
    signals: Signal[];
    current: SessionWithRelations['tasks'][number];
    answerText: string;
    verdict: AnswerVerdict;
  }) {
    const { session, learner, dialogue, signals, current, answerText, verdict } = params;
    const nextOrder = current.order + 1;

    if (current.kind === TaskKind.PROFESSION_TRIAL) {
      const answeredTrials = this.answeredTrials(session).length + 1;

      if (answeredTrials < TRIAL_ROUNDS) {
        const task = await this.createTrialFollowUp(
          session,
          learner,
          current,
          answerText,
          nextOrder,
        );
        return {
          task,
          finished: false,
          progress: this.progressView(session, { stage: 'trial', trialStep: answeredTrials + 1 }),
        };
      }

      await this.prisma.session.update({
        where: { id: session.id },
        data: { status: SessionStatus.COMPLETED, completedAt: new Date() },
      });
      return {
        task: null,
        finished: true,
        progress: this.progressView(session, { stage: 'done' }),
      };
    }

    const answers = this.clarifyingVerdicts(session);
    const asked = answers.length + 1;
    const informative = answers.filter((v) => v.informative).length + (verdict.informative ? 1 : 0);
    const retriesInARow = verdict.informative ? 0 : this.trailingRetries(session) + 1;

    // Ответ ничего не дал — спрашиваем то же самое, но понятнее. Такой вопрос
    // не приближает к пробе: иначе отписками можно было бы «пройти» тест.
    if (!verdict.informative && retriesInARow <= RETRY_LIMIT && asked < CLARIFYING_MAX) {
      const retry = await this.claude.retryQuestion(learner, {
        question: current.prompt,
        answer: answerText,
        missing: verdict.missing,
      });

      const task = await this.prisma.taskInstance.create({
        data: {
          sessionId: session.id,
          kind: TaskKind.CLARIFYING_QUESTION,
          order: nextOrder,
          prompt: retry.question,
          payload: { rationale: retry.rationale, retry: true },
          modelId: this.claude.model,
        },
      });
      return {
        task: this.viewTask(task),
        finished: false,
        progress: this.progressView(session, { stage: 'questions', asked, informative }),
      };
    }

    const enough = informative >= CLARIFYING_MIN && verdict.enoughToMatch;
    const exhausted = asked >= CLARIFYING_MAX;

    if (!enough && !exhausted) {
      const question = await this.claude.nextClarifyingQuestion(learner, {
        dialogue,
        signals,
        askedCount: asked,
        minQuestions: CLARIFYING_MIN,
        maxQuestions: CLARIFYING_MAX,
      });

      const task = await this.prisma.taskInstance.create({
        data: {
          sessionId: session.id,
          kind: TaskKind.CLARIFYING_QUESTION,
          order: nextOrder,
          prompt: question.question,
          payload: { rationale: question.rationale },
          modelId: this.claude.model,
        },
      });
      return {
        task: this.viewTask(task),
        finished: false,
        progress: this.progressView(session, { stage: 'questions', asked, informative }),
      };
    }

    return {
      task: await this.createTrialTask(session, learner, dialogue, signals, nextOrder),
      finished: false,
      progress: this.progressView(session, { stage: 'trial', trialStep: 1 }),
    };
  }

  /** Подбирает профессии под профиль и генерирует рабочую пробу под первую. */
  private async createTrialTask(
    session: SessionWithRelations,
    learner: Learner,
    dialogue: DialogueTurn[],
    signals: Signal[],
    order: number,
  ) {
    const catalog = await this.prisma.profession.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, title: true, description: true },
    });

    const { matches } = await this.claude.matchProfessions(learner, {
      catalog,
      signals,
      dialogue,
    });

    // Модель просили брать id из каталога, но проверяем — вдруг придумала свой.
    const valid = matches.filter((m) => catalog.some((p) => p.id === m.professionId));
    if (valid.length === 0) {
      throw new ConflictException(
        'Не удалось подобрать профессию из каталога — попробуй пройти тест ещё раз.',
      );
    }

    const top = valid[0];
    const profession = catalog.find((p) => p.id === top.professionId)!;

    const trial = await this.claude.generateTrial(learner, {
      professionTitle: profession.title,
      professionDescription: profession.description,
      signals,
      dialogue,
    });

    const [task] = await this.prisma.$transaction([
      this.prisma.taskInstance.create({
        data: {
          sessionId: session.id,
          kind: TaskKind.PROFESSION_TRIAL,
          order,
          professionId: profession.id,
          prompt: trial.task,
          payload: {
            title: trial.title,
            scenario: trial.scenario,
            materials: trial.materials,
            successLooksLike: trial.successLooksLike,
            profession: profession.title,
            step: 1,
            totalSteps: TRIAL_ROUNDS,
          },
          modelId: this.claude.model,
        },
      }),
      this.prisma.interestProfile.update({
        where: { sessionId: session.id },
        data: { topProfessions: valid as unknown as Prisma.InputJsonValue },
      }),
    ]);

    return this.viewTask(task);
  }

  /**
   * Второй шаг пробы. Ситуация меняется от решения самого подростка — это и есть
   * то, чего не умеет тест с готовыми вариантами ответов.
   */
  private async createTrialFollowUp(
    session: SessionWithRelations,
    learner: Learner,
    trialTask: SessionWithRelations['tasks'][number],
    answerText: string,
    order: number,
  ) {
    const payload = (trialTask.payload ?? {}) as Record<string, unknown>;

    const followUp = await this.claude.generateTrialFollowUp(learner, {
      professionTitle: this.professionTitleOf(trialTask),
      trialTitle: String(payload.title ?? 'Рабочая проба'),
      scenario: String(payload.scenario ?? ''),
      task: trialTask.prompt,
      answer: answerText,
    });

    const task = await this.prisma.taskInstance.create({
      data: {
        sessionId: session.id,
        kind: TaskKind.PROFESSION_TRIAL,
        order,
        professionId: trialTask.professionId,
        prompt: followUp.task,
        payload: {
          title: String(payload.title ?? 'Рабочая проба'),
          scenario: followUp.reaction,
          materials: followUp.materials,
          successLooksLike: followUp.successLooksLike,
          profession: this.professionTitleOf(trialTask),
          step: 2,
          totalSteps: TRIAL_ROUNDS,
        },
        modelId: this.claude.model,
      },
    });

    return this.viewTask(task);
  }

  private async loadSession(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        interestProfile: true,
        parentLetter: true,
        mentorReview: true,
        careerPlan: true,
        tasks: {
          orderBy: { order: 'asc' },
          include: { answer: { include: { assessment: true } } },
        },
      },
    });
    if (!session) {
      throw new NotFoundException(`Сессия "${id}" не найдена.`);
    }
    return session;
  }

  private learnerOf(session: SessionWithRelations): Learner {
    return { locale: session.locale, grade: session.grade };
  }

  private viewTask(task: {
    id: string;
    kind: TaskKind;
    order: number;
    prompt: string;
    payload: Prisma.JsonValue | null;
    modelId: string;
  }) {
    return {
      id: task.id,
      kind: task.kind,
      order: task.order,
      prompt: task.prompt,
      payload: task.payload,
      // Маркировка сгенерированного контента — требование закона РК № 230-VIII.
      generatedByAi: task.modelId !== STATIC_OPENER_MODEL,
      modelId: task.modelId,
    };
  }

  /**
   * Что показывать в шкале. Общего числа вопросов заранее нет и быть не может:
   * разговор кончается тогда, когда модель говорит, что уже поняла человека.
   */
  private progressView(
    session: SessionWithRelations,
    state: { stage: string; asked?: number; informative?: number; trialStep?: number },
  ) {
    return {
      stage: state.stage,
      asked: state.asked ?? this.clarifyingVerdicts(session).length,
      informative: state.informative,
      min: CLARIFYING_MIN,
      max: CLARIFYING_MAX,
      trialStep: state.trialStep,
      trialSteps: TRIAL_ROUNDS,
    };
  }

  private dialogueOf(tasks: SessionWithRelations['tasks']): DialogueTurn[] {
    return tasks
      .filter((t) => t.answer !== null)
      .map((t) => ({ question: t.prompt, answer: t.answer!.text }));
  }

  /** Вердикты модели по отвеченным вопросам, в порядке разговора. */
  private clarifyingVerdicts(session: SessionWithRelations): AnswerVerdict[] {
    return session.tasks
      .filter((t) => t.kind === TaskKind.CLARIFYING_QUESTION && t.answer?.assessment)
      .map((t) => this.verdictOf(t.answer!.assessment!.scores));
  }

  private answeredTrials(session: SessionWithRelations) {
    return session.tasks.filter(
      (t) => t.kind === TaskKind.PROFESSION_TRIAL && t.answer !== null,
    );
  }

  private lastTrialTask(session: SessionWithRelations) {
    return [...session.tasks].reverse().find((t) => t.kind === TaskKind.PROFESSION_TRIAL);
  }

  /** Сколько неинформативных ответов идёт подряд в самом хвосте разговора. */
  private trailingRetries(session: SessionWithRelations): number {
    let count = 0;
    for (const verdict of [...this.clarifyingVerdicts(session)].reverse()) {
      if (verdict.informative) break;
      count += 1;
    }
    return count;
  }

  private verdictOf(scores: Prisma.JsonValue | null): AnswerVerdict {
    const value = (scores ?? {}) as Record<string, unknown>;
    return {
      // Старые прохождения писались без вердикта — считаем их содержательными,
      // иначе история задним числом станет сплошными отписками.
      informative: value.informative !== false,
      enoughToMatch: value.enoughToMatch === true,
      confidence: typeof value.confidence === 'number' ? value.confidence : 0,
      missing: typeof value.missing === 'string' ? value.missing : '',
    };
  }

  private professionTitleOf(task: SessionWithRelations['tasks'][number]): string {
    const payload = (task.payload ?? {}) as Record<string, unknown>;
    return String(payload.profession ?? 'выбранная профессия');
  }

  /** Награда считается из того, что человек реально сделал, а не из факта входа. */
  private rewardFor(session: SessionWithRelations) {
    const trials = this.answeredTrials(session).length;
    return {
      xp: REWARD_TEST_XP + trials * REWARD_TRIAL_XP,
      coins: REWARD_TEST_COINS + trials * REWARD_TRIAL_COINS,
      mentorCost: MENTOR_COST_COINS,
    };
  }

  private signalsOf(traits: Prisma.JsonValue | undefined): Signal[] {
    return Array.isArray(traits) ? (traits as unknown as Signal[]) : [];
  }

  private matchesOf(value: Prisma.JsonValue | null | undefined): StoredMatch[] {
    return Array.isArray(value) ? (value as unknown as StoredMatch[]) : [];
  }

  /** Одна черта — одна запись: держим самое яркое проявление и его цитату. */
  private mergeSignals(existing: Signal[], incoming: Signal[]): Signal[] {
    const byTrait = new Map(existing.map((s) => [s.trait, s]));
    for (const signal of incoming) {
      const previous = byTrait.get(signal.trait);
      if (!previous || signal.weight >= previous.weight) {
        byTrait.set(signal.trait, signal);
      }
    }
    return [...byTrait.values()].sort((a, b) => b.weight - a.weight);
  }

  private disclaimer(locale: Locale) {
    return locale === Locale.KK
      ? 'Сұрақтар мен бағалауды жасанды интеллект жасайды. Бұл — диагноз емес, әңгімеге себеп.'
      : 'Вопросы и разбор ответов создаёт искусственный интеллект. Это не диагноз, а повод для разговора.';
  }

  private planDisclaimer(locale: Locale) {
    return locale === Locale.KK
      ? 'Оқу орындары мен талаптарды жасанды интеллект жинады. Түсер алдында ресми сайттан тексер.'
      : 'Список вузов и требований собран искусственным интеллектом. Перед подачей документов проверь на официальном сайте — программы меняются.';
  }
}
