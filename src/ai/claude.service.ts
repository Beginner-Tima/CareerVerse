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
  MatchSchema,
  MatchResult,
  MentorReviewSchema,
  MentorReviewResult,
  NextStepsSchema,
  NextStepsResult,
} from './schemas';
import * as prompts from './prompts';
import { DialogueTurn, Learner, Signal } from './prompts';

// Haiku 4.5 — самая дешёвая из актуальных моделей ($1/$5 за млн токенов).
// На демо этого хватает; поднять до claude-sonnet-5 можно одной переменной .env.
const DEFAULT_MODEL = 'claude-haiku-4-5';

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  readonly model: string;

  // Грубый счётчик расхода: на хакатоне бюджет ключа маленький,
  // и полезно видеть в логах, во что обходится один прогон.
  private inputTokens = 0;
  private outputTokens = 0;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY не задан. Ключ берётся на console.anthropic.com → Settings → API keys.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
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
      1024,
      'assess',
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
      512,
      'clarify',
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
      512,
      'retry',
    );
  }

  /** Сопоставление накопленного профиля с каталогом профессий. */
  async matchProfessions(
    learner: Learner,
    params: {
      catalog: { id: string; title: string; description: string }[];
      signals: Signal[];
      dialogue: DialogueTurn[];
    },
  ): Promise<MatchResult> {
    return this.parse(
      MatchSchema,
      prompts.SYSTEM_MATCH(learner),
      prompts.userMatch(params),
      1024,
      'match',
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
      1500,
      'trial',
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
      1500,
      'trial-followup',
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
      2048,
      'mentor',
    );
  }

  /** Путь в профессию: ЕНТ, вузы РК, язык, что нужно для первой работы. */
  async nextSteps(
    learner: Learner,
    params: {
      professionTitle: string;
      professionDescription: string;
      signals: Signal[];
      context?: string | null;
    },
  ): Promise<NextStepsResult> {
    return this.parse(
      NextStepsSchema,
      prompts.SYSTEM_NEXT_STEPS(learner),
      prompts.userNextSteps(params),
      2048,
      'next-steps',
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
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: prompts.SYSTEM_PARENT_LETTER(learner),
      messages: [{ role: 'user', content: prompts.userParentLetter(params) }],
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
    this.track('parent-letter', final.usage);
  }

  private async parse<T>(
    schema: Parameters<typeof zodOutputFormat>[0],
    system: string,
    user: string,
    maxTokens: number,
    label: string,
  ): Promise<T> {
    try {
      const message = await this.client.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: zodOutputFormat(schema) },
      });

      this.track(label, message.usage);

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
      throw error;
    }
  }

  private track(label: string, usage: { input_tokens: number; output_tokens: number }) {
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
    this.logger.log(
      `${label}: +${usage.input_tokens} in / +${usage.output_tokens} out ` +
        `(за процесс: ${this.inputTokens} / ${this.outputTokens}, ~$${this.estimateUsd().toFixed(4)})`,
    );
  }

  /** Оценка по прайсу Haiku 4.5: $1 за млн входных, $5 за млн выходных. */
  private estimateUsd(): number {
    return (this.inputTokens / 1_000_000) * 1 + (this.outputTokens / 1_000_000) * 5;
  }
}
