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
  MatchSchema,
  MatchResult,
} from './schemas';
import * as prompts from './prompts';
import { DialogueTurn, Signal } from './prompts';

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
  async assessAnswer(params: {
    locale: Locale;
    question: string;
    answer: string;
    signals: Signal[];
  }): Promise<AssessmentResult> {
    return this.parse(
      AssessmentSchema,
      prompts.SYSTEM_ASSESS(params.locale),
      prompts.userAssess(params),
      1024,
      'assess',
    );
  }

  /** Следующий вопрос — рождается из предыдущего ответа, а не из списка. */
  async nextClarifyingQuestion(params: {
    locale: Locale;
    dialogue: DialogueTurn[];
    signals: Signal[];
    askedCount: number;
    totalQuestions: number;
  }): Promise<ClarifyingQuestionResult> {
    return this.parse(
      ClarifyingQuestionSchema,
      prompts.SYSTEM_CLARIFY(params.locale),
      prompts.userClarify(params),
      512,
      'clarify',
    );
  }

  /** Сопоставление накопленного профиля с каталогом профессий. */
  async matchProfessions(params: {
    locale: Locale;
    catalog: { id: string; title: string; description: string }[];
    signals: Signal[];
    dialogue: DialogueTurn[];
  }): Promise<MatchResult> {
    return this.parse(
      MatchSchema,
      prompts.SYSTEM_MATCH(params.locale),
      prompts.userMatch(params),
      1024,
      'match',
    );
  }

  /** Рабочая проба профессии под конкретного подростка. */
  async generateTrial(params: {
    locale: Locale;
    professionTitle: string;
    professionDescription: string;
    signals: Signal[];
    dialogue: DialogueTurn[];
  }): Promise<TrialResult> {
    return this.parse(
      TrialSchema,
      prompts.SYSTEM_TRIAL(params.locale),
      prompts.userTrial(params),
      1500,
      'trial',
    );
  }

  /**
   * Письмо родителям — единственный длинный текст, поэтому идёт стримом:
   * на защите видно, как оно печатается, а не пустой экран на 20 секунд.
   */
  async *streamParentLetter(params: {
    locale: Locale;
    dialogue: DialogueTurn[];
    signals: Signal[];
    topProfessions: string[];
  }): AsyncGenerator<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: prompts.SYSTEM_PARENT_LETTER(params.locale),
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
