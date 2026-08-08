import { z } from 'zod';

/**
 * Схемы ответов модели. Через structured outputs API гарантирует валидный JSON —
 * парсить руками и ловить сломанный JSON на сцене не нужно.
 *
 * Ограничение structured outputs: minLength/maximum и подобные constraint'ы
 * не поддерживаются, поэтому длину просим текстом в промпте.
 */

// Сигнал интереса, извлечённый из свободного ответа. Из них копится InterestProfile.
export const SignalSchema = z.object({
  trait: z
    .string()
    .describe('Короткий код черты: systems-thinking, care-for-people, hands-on, ...'),
  weight: z.number().describe('Насколько ярко проявилось, от 0 до 1'),
  evidence: z.string().describe('Цитата или пересказ из ответа подростка'),
});

export const AssessmentSchema = z.object({
  summary: z.string().describe('Одно предложение: что этот ответ говорит о человеке'),
  feedback: z
    .string()
    .describe('Обратная связь подростку на «ты», 2-3 предложения, без оценок и баллов'),
  signals: z.array(SignalSchema).describe('От 1 до 4 сигналов интереса'),
});
export type AssessmentResult = z.infer<typeof AssessmentSchema>;

export const ClarifyingQuestionSchema = z.object({
  question: z
    .string()
    .describe('Следующий вопрос подростку — рождается из его предыдущего ответа'),
  rationale: z
    .string()
    .describe('Зачем этот вопрос: какую гипотезу об интересах он проверяет'),
});
export type ClarifyingQuestionResult = z.infer<typeof ClarifyingQuestionSchema>;

export const MatchSchema = z.object({
  matches: z
    .array(
      z.object({
        professionId: z.string().describe('id профессии строго из переданного каталога'),
        fit: z.number().describe('Насколько подходит, от 0 до 1'),
        because: z
          .string()
          .describe('Одно предложение подростку: почему именно это, со ссылкой на его ответы'),
      }),
    )
    .describe('Три профессии, от самой подходящей к менее'),
});
export type MatchResult = z.infer<typeof MatchSchema>;

export const TrialSchema = z.object({
  title: z.string().describe('Название пробы, 3-6 слов'),
  scenario: z
    .string()
    .describe('Рабочая ситуация из практики этой профессии, 2-4 предложения'),
  task: z.string().describe('Что конкретно нужно сделать подростку прямо сейчас'),
  materials: z
    .array(z.string())
    .describe('Вводные данные: цифры, реплики заказчика, фрагменты — то, с чем работают'),
  successLooksLike: z
    .string()
    .describe('По какому признаку видно, что человек справился — для оценки ответа'),
});
export type TrialResult = z.infer<typeof TrialSchema>;
