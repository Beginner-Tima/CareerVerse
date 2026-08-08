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
  // Первые два поля идут до выводов намеренно: модель сначала признаёт, что
  // ответ пустой, и только потом пишет summary. В обратном порядке она сначала
  // сочиняет содержательный пересказ, а потом уже не может назвать его пустым.
  informative: z
    .boolean()
    .describe(
      'Есть ли в ответе хоть что-то конкретное о самом человеке. ' +
        '«Не знаю», «норм», «всё нравится», одно слово, ответ не по вопросу — false',
    ),
  missing: z
    .string()
    .describe(
      'Если informative=false — чего именно не хватило, чтобы понять человека. ' +
        'Если informative=true — пустая строка',
    ),
  summary: z.string().describe('Одно предложение: что этот ответ говорит о человеке'),
  feedback: z
    .string()
    .describe('Обратная связь подростку на «ты», 2-3 предложения, без оценок и баллов'),
  signals: z
    .array(SignalSchema)
    .describe('От 1 до 4 сигналов интереса. Если ответ пустой — пустой массив, не выдумывай'),
  enoughToMatch: z
    .boolean()
    .describe(
      'Хватает ли всего накопленного, чтобы честно подобрать профессию, ' +
        'или человек всё ещё раскрыт с одной стороны',
    ),
  confidence: z
    .number()
    .describe('Насколько ты уверен в профиле интересов прямо сейчас, от 0 до 1'),
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

/**
 * Схема подбора собирается под конкретный каталог: `professionId` — перечисление
 * реальных id, а не просто строка.
 *
 * Пока профессий было шесть, хватало просьбы в описании поля. На сотне
 * вариантов просьба перестаёт быть гарантией: достаточно перепутать букву в id,
 * чтобы фильтр в sessions.service отбросил вариант, а при невезении — все три,
 * и подросток увидит «не удалось подобрать профессию» ровно в тот момент, ради
 * которого проходил тест.
 *
 * Но гарантии здесь всё равно нет, и важно понимать почему. SDK не отправляет
 * `enum` в API: при сборке JSON Schema поле становится обычной строкой, а
 * список допустимых значений дописывается в её описание (проверено на выводе
 * `zodOutputFormat`). То есть перечисление работает как подсказка модели прямо
 * у поля — заметно сильнее общей фразы «бери из каталога», — а сходимость
 * проверяется уже после ответа, на клиенте. Настоящий предохранитель по-прежнему
 * один: фильтр по каталогу в sessions.service.
 */
export const matchSchema = (professionIds: readonly string[]) =>
  z.object({
    matches: z
      .array(
        z.object({
          professionId:
            professionIds.length > 0
              ? z
                  .enum(professionIds as [string, ...string[]])
                  .describe('id профессии строго из переданного каталога')
              : z.string().describe('id профессии строго из переданного каталога'),
          fit: z.number().describe('Насколько подходит, от 0 до 1'),
          because: z
            .string()
            .describe('Одно предложение подростку: почему именно это, со ссылкой на его ответы'),
        }),
      )
      .describe('Три профессии, от самой подходящей к менее'),
  });
export type MatchResult = z.infer<ReturnType<typeof matchSchema>>;

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

// Второй шаг пробы. Ценен именно тем, что вырастает из решения подростка:
// это самое наглядное доказательство адаптивности — сценарий меняется от того,
// что человек выбрал, а не переключается на следующий пункт списка.
export const TrialFollowUpSchema = z.object({
  reaction: z
    .string()
    .describe('Что произошло из-за его решения, 1-2 предложения — без похвалы и оценок'),
  task: z.string().describe('Что теперь нужно сделать в изменившейся ситуации'),
  materials: z
    .array(z.string())
    .describe('Новые вводные: что изменилось в цифрах, репликах, обстоятельствах'),
  successLooksLike: z.string().describe('По какому признаку видно, что человек справился'),
});
export type TrialFollowUpResult = z.infer<typeof TrialFollowUpSchema>;

// Разбор от наставника — то, на что тратятся очки. Структурой, а не сплошным
// текстом: экран разбирает по полям, и модели труднее уплыть в общие слова.
export const MentorReviewSchema = z.object({
  didWell: z.string().describe('Что у человека получилось в пробе, со ссылкой на его слова'),
  gaps: z
    .string()
    .describe('Чего не хватило — прямо, но без обесценивания. Это подросток, а не кандидат'),
  monthPlan: z
    .array(z.string())
    .describe('3-4 конкретных шага на ближайший месяц, выполнимых в Казахстане'),
  closing: z.string().describe('Одно предложение на «ты», с которым хочется продолжить'),
});
export type MentorReviewResult = z.infer<typeof MentorReviewSchema>;

// «Что дальше» после результата: путь от школы до первой работы в профессии.
export const NextStepsSchema = z.object({
  entSubjects: z
    .array(z.string())
    .describe('Профильные предметы ЕНТ для этого направления'),
  universities: z
    .array(
      z.object({
        name: z.string().describe('Только реально существующие вузы и колледжи РК'),
        city: z.string(),
        why: z.string().describe('Чем это место подходит именно под эту профессию'),
      }),
    )
    .describe('2-4 варианта. Не уверен, что программа существует — не называй её'),
  languages: z
    .string()
    .describe('Нужен ли английский и IELTS в этой профессии и зачем именно — честно'),
  toGetHired: z
    .array(z.string())
    .describe('Что реально спрашивают на входе в профессию в РК: навыки, портфолио, практика'),
  nextMonth: z
    .array(z.string())
    .describe(
      '3-4 шага на ближайшие 30 дней, каждый — законченное действие, которое ' +
        'можно сделать бесплатно и не выходя из своего города: что открыть, ' +
        'куда написать, кого спросить, что собрать. Не «изучи основы», а ' +
        '«пройди бесплатный курс X на Y и выложи получившееся»',
    ),
});
export type NextStepsResult = z.infer<typeof NextStepsSchema>;
