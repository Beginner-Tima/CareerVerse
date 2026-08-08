import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Locale, Prisma, SessionStatus, TaskKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../ai/claude.service';
import { DialogueTurn, Signal } from '../ai/prompts';
import { StartSessionDto, SubmitAnswerDto } from './dto/session.dto';

/** Сколько свободных вопросов задаём до того, как перейти к рабочей пробе. */
const CLARIFYING_ROUNDS = 3;

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

type SessionWithRelations = Prisma.SessionGetPayload<{
  include: {
    interestProfile: true;
    parentLetter: true;
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
      task: this.viewTask(session.tasks[0]),
      disclaimer: this.disclaimer(locale),
    };
  }

  /**
   * Принимает свободный ответ, разбирает его моделью и рождает следующий шаг:
   * ещё один уточняющий вопрос, рабочую пробу профессии или финал.
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

    const signals = this.signalsOf(session.interestProfile?.traits);
    const dialogue = this.dialogueOf(session.tasks);

    const assessment = await this.claude.assessAnswer({
      locale: session.locale,
      question: current.prompt,
      answer: dto.text,
      signals,
    });

    const merged = this.mergeSignals(signals, assessment.signals);

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
          modelId: this.claude.model,
        },
      });
      await tx.interestProfile.update({
        where: { sessionId: session.id },
        data: {
          traits: merged as unknown as Prisma.InputJsonValue,
          confidence: Math.min(1, dialogue.length * 0.2 + 0.2),
        },
      });
    });

    const answeredDialogue: DialogueTurn[] = [
      ...dialogue,
      { question: current.prompt, answer: dto.text },
    ];

    const next = await this.buildNextStep(session, answeredDialogue, merged, current);

    return {
      assessment: { summary: assessment.summary, feedback: assessment.feedback },
      profile: merged,
      task: next.task,
      finished: next.finished,
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
    for await (const chunk of this.claude.streamParentLetter({
      locale: session.locale,
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

  // ─── Внутреннее ────────────────────────────────────────────

  /** Решает, что дальше: ещё вопрос, проба профессии или финал. */
  private async buildNextStep(
    session: SessionWithRelations,
    dialogue: DialogueTurn[],
    signals: Signal[],
    current: SessionWithRelations['tasks'][number],
  ) {
    const nextOrder = current.order + 1;

    if (dialogue.length < CLARIFYING_ROUNDS) {
      const question = await this.claude.nextClarifyingQuestion({
        locale: session.locale,
        dialogue,
        signals,
        askedCount: dialogue.length,
        totalQuestions: CLARIFYING_ROUNDS,
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
      return { task: this.viewTask(task), finished: false };
    }

    if (current.kind === TaskKind.CLARIFYING_QUESTION) {
      return {
        task: await this.createTrialTask(session, dialogue, signals, nextOrder),
        finished: false,
      };
    }

    // Проба пройдена — прохождение закончено.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { status: SessionStatus.COMPLETED, completedAt: new Date() },
    });
    return { task: null, finished: true };
  }

  /** Подбирает профессии под профиль и генерирует рабочую пробу под первую. */
  private async createTrialTask(
    session: SessionWithRelations,
    dialogue: DialogueTurn[],
    signals: Signal[],
    order: number,
  ) {
    const catalog = await this.prisma.profession.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, title: true, description: true },
    });

    const { matches } = await this.claude.matchProfessions({
      locale: session.locale,
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

    const trial = await this.claude.generateTrial({
      locale: session.locale,
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

  private async loadSession(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        interestProfile: true,
        parentLetter: true,
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

  private dialogueOf(tasks: SessionWithRelations['tasks']): DialogueTurn[] {
    return tasks
      .filter((t) => t.answer !== null)
      .map((t) => ({ question: t.prompt, answer: t.answer!.text }));
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
}
