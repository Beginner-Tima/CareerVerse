import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Locale } from '@prisma/client';
import {
  AssessmentSchema,
  AssessmentResult,
  ClarifyingQuestionSchema,
  ClarifyingQuestionResult,
  TrialSchema,
  TrialResult,
  TrialFollowUpSchema,
  TrialFollowUpResult,
  matchSchema,
  MatchResult,
  MentorReviewSchema,
  MentorReviewResult,
  NextStepsSchema,
  NextStepsResult,
} from './schemas';
import * as prompts from './prompts';
import { DialogueTurn, Learner, Signal } from './prompts';

// Haiku 4.5 — самая дешёвая из актуальных моделей ($1/$5 за млн токенов).
// На русском её хватает; на казахском — нет, см. ниже.
const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * На казахском Haiku пишет ломано: «Білмеймін деген сөйлеу нәтиже бермесе,
 * сөндіктен ойлан да көр» — это не язык, это набор слов. Проверено живым
 * прогоном 08.08.2026. Для KK берём модель посильнее; 74% выпускников сдают
 * ЕНТ на казахском, и демо на ломаном языке — худшее, что можно показать жюри.
 */
const DEFAULT_MODEL_KK = 'claude-sonnet-5';

/**
 * Модели, которые ещё принимают `temperature`.
 *
 * У Sonnet 5 и всего поколения Opus 4.7+ параметры сэмплирования из API убраны:
 * ненулевая `temperature` возвращает 400. Казахская ветка идёт на Sonnet 5,
 * поэтому детерминированный подбор включается только там, где параметр
 * поддерживается. На казахском разброс вариантов остаётся — это хуже, чем
 * повторяемый результат, и несравнимо лучше, чем пятисотка в тот самый момент,
 * когда на экране должны появиться профессии.
 */
const SAMPLING_SUPPORTED = new Set(['claude-haiku-4-5']);

// $ за миллион токенов, [вход, выход]. У Sonnet 5 сейчас вводная цена $2/$10,
// она действует до 31.08.2026 — после этого станет $3/$15.
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-5': [2, 10],
  'claude-opus-5': [5, 25],
};

/**
 * Казахский текст занимает заметно больше токенов, чем русский, и первая же
 * проба на нём оборвала JSON посреди строки — ответ не влез в лимит и
 * прохождение упало пятисоткой. Лимиты подняты с запасом на язык.
 */
const MAX_TOKENS = {
  assess: 2000,
  clarify: 1000,
  retry: 1000,
  match: 2000,
  trial: 3000,
  followUp: 3000,
  mentor: 3000,
  nextSteps: 3000,
  letter: 3000,
} as const;

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  readonly model: string;
  private readonly modelKk: string;

  // Грубый счётчик расхода: на хакатоне бюджет ключа маленький,
  // и полезно видеть в логах, во что обходится один прогон.
  private inputTokens = 0;
  private outputTokens = 0;
  private spentUsd = 0;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY не задан. Ключ берётся на console.anthropic.com → Settings → API keys.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    this.modelKk = process.env.ANTHROPIC_MODEL_KK || DEFAULT_MODEL_KK;
  }

  /**
   * Какой моделью говорить на этом языке. Модель пишется в БД к каждому
   * заданию — маркировка ИИ-контента должна называть настоящую модель.
   */
  modelFor(locale: Locale): string {
    return locale === Locale.KK ? this.modelKk : this.model;
  }

  /** Разбор свободного ответа: обратная связь подростку + сигналы интересов. */
  async assessAnswer(
    learner: Learner,
    params: {
      question: string;
      answer: string;
      signals: Signal[];
    },
  ): Promise<AssessmentResult> {
    return this.parse(
      AssessmentSchema,
      prompts.SYSTEM_ASSESS(learner),
      prompts.userAssess(params),
      MAX_TOKENS.assess,
      'assess',
      learner.locale,
    );
  }

  /** Следующий вопрос — рождается из предыдущего ответа, а не из списка. */
  async nextClarifyingQuestion(
    learner: Learner,
    params: {
      dialogue: DialogueTurn[];
      signals: Signal[];
      askedCount: number;
      minQuestions: number;
      maxQuestions: number;
    },
  ): Promise<ClarifyingQuestionResult> {
    return this.parse(
      ClarifyingQuestionSchema,
      prompts.SYSTEM_CLARIFY(learner),
      prompts.userClarify(params),
      MAX_TOKENS.clarify,
      'clarify',
      learner.locale,
    );
  }

  /**
   * Тот же вопрос другими словами. Отдельный вызов, а не ветка в clarify:
   * переспрос — это про «спросить понятнее», а не про «двигаться дальше»,
   * и промпты у них противоположные.
   */
  async retryQuestion(
    learner: Learner,
    params: { question: string; answer: string; missing: string },
  ): Promise<ClarifyingQuestionResult> {
    return this.parse(
      ClarifyingQuestionSchema,
      prompts.SYSTEM_RETRY(learner),
      prompts.userRetry(params),
      MAX_TOKENS.retry,
      'retry',
      learner.locale,
    );
  }

  /**
   * Сопоставление накопленного профиля с каталогом профессий.
   *
   * Единственный вызов с `temperature: 0`. Два одинаковых прогона давали разный
   * первый вариант (Backend 0.89 / Агроинженер 0.89): для вопроса «что тебе
   * подходит» разброс — это не творчество, а несерьёзность, и на защите он
   * означает, что показанный результат нельзя повторить. Остальные промпты
   * пишут текст человеку, там разнообразие уместно.
   *
   * Фактически срабатывает на русском: на казахском модель — Sonnet 5, а он
   * `temperature` больше не принимает (см. SAMPLING_SUPPORTED). Демо на
   * казахском по-прежнему стоит прогнать заранее.
   */
  async matchProfessions(
    learner: Learner,
    params: {
      catalog: { id: string; title: string; description: string }[];
      signals: Signal[];
      dialogue: DialogueTurn[];
    },
  ): Promise<MatchResult> {
    return this.parse(
      matchSchema(params.catalog.map((p) => p.id)),
      prompts.SYSTEM_MATCH(learner),
      prompts.userMatch(params),
      MAX_TOKENS.match,
      'match',
      learner.locale,
      0,
    );
  }

  /** Рабочая проба профессии под конкретного подростка. */
  async generateTrial(
    learner: Learner,
    params: {
      professionTitle: string;
      professionDescription: string;
      signals: Signal[];
      dialogue: DialogueTurn[];
    },
  ): Promise<TrialResult> {
    return this.parse(
      TrialSchema,
      prompts.SYSTEM_TRIAL(learner),
      prompts.userTrial(params),
      MAX_TOKENS.trial,
      'trial',
      learner.locale,
    );
  }

  /** Второй шаг пробы: ситуация меняется из-за решения самого подростка. */
  async generateTrialFollowUp(
    learner: Learner,
    params: {
      professionTitle: string;
      trialTitle: string;
      scenario: string;
      task: string;
      answer: string;
    },
  ): Promise<TrialFollowUpResult> {
    return this.parse(
      TrialFollowUpSchema,
      prompts.SYSTEM_TRIAL_FOLLOWUP(learner),
      prompts.userTrialFollowUp(params),
      MAX_TOKENS.followUp,
      'trial-followup',
      learner.locale,
    );
  }

  /** Разбор пробы наставником — то, на что тратятся заработанные очки. */
  async mentorReview(
    learner: Learner,
    params: {
      professionTitle: string;
      dialogue: DialogueTurn[];
      signals: Signal[];
    },
  ): Promise<MentorReviewResult> {
    return this.parse(
      MentorReviewSchema,
      prompts.SYSTEM_MENTOR(learner),
      prompts.userMentor(params),
      MAX_TOKENS.mentor,
      'mentor',
      learner.locale,
    );
  }

  /** Путь в профессию: ЕНТ, вузы РК, язык, что нужно для первой работы. */
  async nextSteps(
    learner: Learner,
    params: {
      professionTitle: string;
      professionDescription: string;
      signals: Signal[];
      today: string;
      context?: string | null;
    },
  ): Promise<NextStepsResult> {
    return this.parse(
      NextStepsSchema,
      prompts.SYSTEM_NEXT_STEPS(learner),
      prompts.userNextSteps(params),
      MAX_TOKENS.nextSteps,
      'next-steps',
      learner.locale,
    );
  }

  /**
   * Письмо родителям — единственный длинный текст, поэтому идёт стримом:
   * на защите видно, как оно печатается, а не пустой экран на 20 секунд.
   */
  async *streamParentLetter(
    learner: Learner,
    params: {
      dialogue: DialogueTurn[];
      signals: Signal[];
      topProfessions: string[];
    },
  ): AsyncGenerator<string> {
    const model = this.modelFor(learner.locale);
    const stream = this.client.messages.stream({
      model,
      max_tokens: MAX_TOKENS.letter,
      system: prompts.SYSTEM_PARENT_LETTER(learner),
      messages: [
        {
          role: 'user',
          content: prompts.userParentLetter(params) + prompts.languageTail(learner.locale),
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    this.track('parent-letter', model, final.usage);
  }

  private async parse<T>(
    schema: Parameters<typeof zodOutputFormat>[0],
    system: string,
    user: string,
    maxTokens: number,
    label: string,
    locale?: Locale,
    temperature?: number,
  ): Promise<T> {
    const model = this.modelFor(locale ?? Locale.RU);
    // Просьба о повторяемости выполняется там, где модель это умеет, и молча
    // игнорируется там, где параметра больше нет, — см. SAMPLING_SUPPORTED.
    const sampling =
      temperature !== undefined && SAMPLING_SUPPORTED.has(model)
        ? { temperature }
        : {};

    try {
      const message = await this.client.messages.parse({
        model,
        max_tokens: maxTokens,
        system,
        ...sampling,
        // Sonnet 5 думает по умолчанию, а max_tokens покрывает размышления
        // вместе с ответом — с включённым мышлением JSON обрывался на середине.
        // Здесь нужен структурированный вывод, а не рассуждения вслух.
        thinking: { type: 'disabled' },
        // Требование языка повторяется в самом конце: описания полей схемы
        // написаны по-русски и тянут ответ в русский, даже когда просили казахский.
        messages: [
          { role: 'user', content: user + prompts.languageTail(locale ?? Locale.RU) },
        ],
        output_config: { format: zodOutputFormat(schema) },
      });

      this.track(label, model, message.usage);

      if (message.stop_reason === 'refusal') {
        throw new ServiceUnavailableException(
          'Модель отказалась отвечать на этот ввод. Попробуй переформулировать.',
        );
      }
      if (!message.parsed_output) {
        throw new ServiceUnavailableException(
          `Модель вернула ответ не по схеме (${label}, stop_reason=${message.stop_reason}).`,
        );
      }

      return message.parsed_output as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Claude API ${error.status} на ${label}: ${error.message}`);
        throw new ServiceUnavailableException(
          'Сервис ИИ временно недоступен, попробуй ещё раз через минуту.',
        );
      }
      // Схему SDK проверяет на клиенте — в том числе перечисление id профессий,
      // которое в API не уходит (см. matchSchema). Несошедшийся ответ должен
      // выглядеть как «модель ответила не по схеме», а не как пятисотка без
      // объяснений: у вызывающего кода на этот случай есть понятный текст.
      if (error instanceof Error && error.name.includes('Zod')) {
        this.logger.error(`Ответ не прошёл схему на ${label}: ${error.message}`);
        throw new ServiceUnavailableException(
          `Модель вернула ответ не по схеме (${label}). Попробуй ещё раз.`,
        );
      }
      throw error;
    }
  }

  private track(
    label: string,
    model: string,
    usage: { input_tokens: number; output_tokens: number },
  ) {
    const [inPrice, outPrice] = PRICES[model] ?? PRICES[DEFAULT_MODEL];
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
    this.spentUsd +=
      (usage.input_tokens / 1_000_000) * inPrice +
      (usage.output_tokens / 1_000_000) * outPrice;

    this.logger.log(
      `${label} (${model}): +${usage.input_tokens} in / +${usage.output_tokens} out ` +
        `(за процесс: ${this.inputTokens} / ${this.outputTokens}, ~$${this.spentUsd.toFixed(4)})`,
    );
  }
}
