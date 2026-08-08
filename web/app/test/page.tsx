'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AiBadge } from '../components/AiBadge';
import { ProfileBar } from '../components/ProfileBar';
import {
  startSession,
  submitAnswer,
  type Progress,
  type Signal,
  type Task,
  type TrialPayload,
} from '../lib/api';
import { rememberExpectation } from '../lib/expectation';
import { setUiLocale, useT } from '../lib/i18n';

interface Exchange {
  question: string;
  answer: string;
  feedback: string;
}

const GRADES = [7, 8, 9, 10, 11];

/**
 * Один ответ — это два вызова модели подряд, 8–15 секунд. Раньше всё это время
 * на кнопке висело «Читаю ответ…», и пауза читалась как зависание. Подписи
 * переключаются по тем же двум шагам, которые реально идут на сервере: сначала
 * разбор ответа, потом следующий вопрос. Ничего не имитируем — просто называем
 * вслух то, что и так происходит.
 */
const THINKING = ['test.thinking1', 'test.thinking2', 'test.thinking3'] as const;
const THINKING_TRIAL = [
  'test.thinkingTrial1',
  'test.thinkingTrial2',
  'test.thinkingTrial3',
] as const;
const THINKING_STEP_MS = 4000;

export default function TestPage() {
  const router = useRouter();
  const t = useT();
  const [started, setStarted] = useState(false);
  const [grade, setGrade] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [task, setTask] = useState<Task | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [profile, setProfile] = useState<Signal[]>([]);
  const [draft, setDraft] = useState('');
  const [expectation, setExpectation] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement | null>(null);

  /**
   * Экран дорастает вниз, а человек остаётся там, где отвечал, — и нового
   * вопроса просто не видит, пока не проскроллит сам. Ведём его сами.
   *
   * Целимся в разбор ответа, а не в сам вопрос: разбор встаёт под верх экрана,
   * следующий вопрос оказывается прямо под ним, и видно оба. Если прицелиться в
   * вопрос, разбор уедет вверх непрочитанным, а он и есть доказательство, что
   * модель ответ прочитала.
   *
   * На первом вопросе не трогаем: позади пусто, и прыжок читался бы как сбой.
   */
  useEffect(() => {
    if (history.length === 0) return;
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [history.length]);

  // Подписи идут вперёд, пока ждём сервер, и замирают на последней: досрочно
  // объявлять «готово» нельзя, а бесконечно крутить по кругу — врать про прогресс.
  // Счётчик сбрасывает тот, кто начинает ожидание, а не эффект: setState прямо в
  // теле эффекта тянет за собой лишний каскад рендеров.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(
      () => setThinkingStep((s) => Math.min(s + 1, THINKING.length - 1)),
      THINKING_STEP_MS,
    );
    return () => clearInterval(id);
  }, [busy]);

  async function begin(locale: 'RU' | 'KK') {
    if (!grade) {
      setError(t('test.grade.error'));
      return;
    }
    // Язык разговора выбирают здесь же, и он же становится языком оболочки:
    // казахский вопрос в русской рамке — это ровно то, что мы чиним. Обратное
    // тоже верно, «Начать на русском» вернёт русский интерфейс.
    setUiLocale(locale === 'KK' ? 'kk' : 'ru');
    setBusy(true);
    setError(null);
    try {
      const session = await startSession(locale, grade);
      // Ожидание кладём рядом с сессией в браузере и никуда не отправляем:
      // в промпте подбора оно превратилось бы в подсказку. См. lib/expectation.
      rememberExpectation(session.sessionId, expectation);
      setSessionId(session.sessionId);
      setTask(session.task);
      setProgress(session.progress);
      setStarted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Текст берётся аргументом, а не только из поля: кнопка «Не знаю» отправляет
   * ровно то же, что человек мог бы написать руками. Никакой отдельной ветки на
   * сервере у неё нет и быть не должно — «не знаю» разбирается тем же
   * механизмом, что и любой короткий ответ, и приводит к переспросу.
   */
  async function send(text: string = draft) {
    if (!task || text.trim().length === 0) return;
    setThinkingStep(0);
    setBusy(true);
    setError(null);
    const answered = task;
    try {
      const res = await submitAnswer(sessionId, text);
      setHistory((h) => [
        ...h,
        { question: answered.prompt, answer: text, feedback: res.assessment.feedback },
      ]);
      setProfile(res.profile);
      setProgress(res.progress);
      setDraft('');
      if (res.finished) {
        router.push(`/result/${sessionId}`);
      } else {
        setTask(res.task);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!started) {
    return (
      <main className="mx-auto max-w-2xl space-y-8 px-5 py-12">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight text-ink">
            {t('test.before')}
          </h1>
          <p className="text-[15px] leading-relaxed text-neutral-700">{t('test.intro')}</p>
        </div>

        <section className="space-y-3 rounded-2xl border border-divider bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">{t('test.grade.title')}</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{t('test.grade.note')}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className={`rounded-xl border px-4 py-2 text-sm transition ${
                  grade === g
                    ? 'border-accent bg-accent-100 text-accent-700'
                    : 'border-divider text-neutral-800 hover:bg-neutral-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        {/* Спрашиваем до первого вопроса и не показываем модели: в конце будет
            видно, куда человек шёл сам и куда его привели собственные ответы. */}
        <section className="space-y-3 rounded-2xl border border-divider bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">{t('test.expect.title')}</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{t('test.expect.note')}</p>
          <input
            value={expectation}
            onChange={(e) => setExpectation(e.target.value)}
            placeholder={t('test.expect.placeholder')}
            className="w-full rounded-xl border border-divider bg-surface px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-neutral-500 focus:border-accent"
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-divider bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-ink">{t('test.ai.title')}</h2>
            <AiBadge />
          </div>
          <p className="text-sm leading-relaxed text-neutral-700">{t('test.ai.note')}</p>
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            onClick={() => begin('RU')}
            className="rounded-xl bg-accent px-6 py-3 font-medium text-page transition hover:bg-accent-600 disabled:opacity-50"
          >
            {busy ? t('test.busy') : t('test.startRu')}
          </button>
          <button
            disabled={busy}
            onClick={() => begin('KK')}
            className="rounded-xl border border-divider px-6 py-3 font-medium text-ink transition hover:bg-neutral-200 disabled:opacity-50"
          >
            Қазақша бастау
          </button>
        </div>
      </main>
    );
  }

  const trial = task?.kind === 'PROFESSION_TRIAL' ? (task.payload as TrialPayload) : null;
  const isRetry =
    task?.kind === 'CLARIFYING_QUESTION' &&
    (task.payload as { retry?: boolean } | null)?.retry === true;

  // Счётчик считает не вопросы, а понятые черты: длина разговора заранее не
  // известна, и «вопрос 3 из 10» был бы обещанием, которого мы не давали.
  const understood = profile.length;
  const need = progress?.min ?? 4;

  return (
    <main className="mx-auto grid w-full max-w-[1520px] gap-10 px-6 py-10 sm:px-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-0">
      <div className="flex min-w-0 flex-col gap-8 lg:border-r-2 lg:border-divider lg:pr-12">
        {progress?.stage === 'trial' && (
          <p className="text-xs uppercase tracking-[0.1em] text-neutral-600">
            {t('test.progress.trial', {
              step: progress.trialStep ?? 1,
              total: progress.trialSteps,
            })}
          </p>
        )}

        {history.map((h, i) => {
          // Появление вешаем только на последний блок: он единственный новый.
          // Старые перерисовываются на каждый ответ, и анимируй их тоже — вся
          // история мигала бы заново после каждого шага.
          const last = i === history.length - 1;
          return (
            // Прошлые шаги приглушены, но остаются читаемыми: подросток должен
            // видеть, что вопрос вырос из его же ответа.
            <section
              key={i}
              className={`space-y-2.5 ${last ? 'enter-up opacity-90' : 'opacity-55'}`}
            >
              <div className="flex gap-3.5">
                <span className="pt-1 text-[13px] font-extrabold tabular-nums text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[22px] font-extrabold leading-tight tracking-[-0.015em] text-ink">
                  {h.question}
                </span>
              </div>
              <p className="ml-[34px] border-l-2 border-ink bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink">
                {h.answer}
              </p>
              <p
                ref={last ? feedbackRef : null}
                className="ml-[34px] border-l-2 border-accent pl-4 text-sm leading-relaxed text-neutral-700"
              >
                {h.feedback}
              </p>
            </section>
          );
        })}

        {task && (
          // Ключ по числу ответов, чтобы секция пересоздавалась на каждом шаге и
          // проигрывала появление заново: без него React переиспользует тот же
          // узел, класс остаётся на месте, и анимация играет ровно один раз.
          <section key={history.length} className="enter-up space-y-4">
            {trial && (
              <div className="space-y-3 rounded-2xl border border-accent-300 bg-accent-100 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-accent-700">
                    {trial.step === 2 ? t('test.trial.outcome') : t('test.trial.label')} ·{' '}
                    {trial.profession}
                  </p>
                  <AiBadge model={task.modelId} />
                </div>
                <h2 className="text-lg font-semibold text-ink">{trial.title}</h2>
                <p className="text-[15px] leading-relaxed text-neutral-800">{trial.scenario}</p>
                <ul className="space-y-1.5 border-t border-accent-300 pt-3 text-sm text-neutral-700">
                  {trial.materials.map((m, i) => (
                    <li key={i} className="leading-relaxed">
                      — {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3.5">
              <span className="pt-3 text-[13px] font-extrabold tabular-nums text-accent">
                {String(history.length + 1).padStart(2, '0')}
              </span>
              <h1 className="max-w-[24ch] text-[clamp(26px,3.4vw,40px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink">
                {task.prompt}
              </h1>
            </div>

            <div className="ml-[34px] space-y-3">
              {/* Переспрос показываем честно: человек должен понимать, что его
                  не поняли, а не думать, что вопрос повторился по ошибке. */}
              {isRetry && (
                <p className="border-l-2 border-accent bg-accent-100 px-4 py-3 text-[13px] text-accent-800">
                  {t('test.retry')}
                </p>
              )}

              {/*
                Пока ждём сервер, поле ввода уходит, а на его месте остаётся
                собственный ответ и три точки. Черновик до успеха не стирается,
                поэтому показать его здесь ничего не стоит: человек видит, что
                именно ушло, и не гадает, отправилось ли.
              */}
              {busy ? (
                <div className="space-y-4">
                  <p className="border-l-2 border-ink bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink">
                    {draft}
                  </p>
                  <div className="flex items-center gap-3" role="status">
                    <span className="dot size-2 rounded-full bg-accent" />
                    <span
                      className="dot size-2 rounded-full bg-accent"
                      style={{ animationDelay: '160ms' }}
                    />
                    <span
                      className="dot size-2 rounded-full bg-accent"
                      style={{ animationDelay: '320ms' }}
                    />
                    <span className="text-[12.5px] text-neutral-600">
                      {t((trial ? THINKING_TRIAL : THINKING)[thinkingStep])}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    // Ctrl+Enter вместо Enter: ответ свободный, и перевод строки
                    // внутри него — обычное дело, а не команда «отправить».
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send();
                    }}
                    rows={4}
                    placeholder={t('test.placeholder')}
                    className="w-full resize-none rounded-xl border border-divider bg-surface p-4 text-[15px] leading-relaxed text-ink outline-none transition placeholder:text-neutral-500 focus:border-accent"
                  />

                  {error && <p className="text-sm text-danger">{error}</p>}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => send()}
                      disabled={draft.trim().length === 0}
                      className="rounded-xl bg-accent px-6 py-3 font-medium text-page shadow-sm transition hover:bg-accent-600 disabled:opacity-40"
                    >
                      {t('test.answer')}
                    </button>
                    <button
                      onClick={() => send(t('test.dontKnow'))}
                      className="rounded-xl px-4 py-3 text-sm text-neutral-700 transition hover:bg-neutral-200"
                    >
                      {t('test.dontKnow')}
                    </button>
                    <span className="ml-auto text-[11.5px] text-neutral-600">
                      {t('test.hint')}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/*
        Правый рельс отвечает на единственный вопрос, который подросток задаёт
        себе посреди разговора: «сколько ещё?». Числа вопросов у нас нет и не
        будет, поэтому вместо прогресса показано понятое — оно растёт от ответов,
        а не от их количества.
      */}
      <aside className="flex flex-col gap-7 lg:pl-8">
        <div>
          <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.08em] text-neutral-600">
            <span>{t('test.rail.known')}</span>
            <span className="tabular-nums">
              {understood} / {need}+
            </span>
          </div>
          <div className="flex h-2.5 gap-[3px]">
            {Array.from({ length: Math.max(need, understood) }, (_, i) => (
              <span
                key={i}
                className={`flex-1 ${i < understood ? 'bg-accent' : 'bg-neutral-300'}`}
              />
            ))}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-700">
            {t('test.intro')}
          </p>
        </div>

        <div className="border-t-2 border-divider pt-5">
          <p className="mb-3.5 text-[11px] uppercase tracking-[0.08em] text-neutral-600">
            {t('test.rail.signals')}
          </p>
          {profile.length === 0 ? (
            <p className="text-[13px] text-neutral-600">{t('test.rail.none')}</p>
          ) : (
            <ProfileBar signals={profile} />
          )}
        </div>

        <p className="mt-auto bg-surface p-4 text-[12.5px] leading-relaxed text-neutral-700">
          {t('test.rail.note')}
        </p>
      </aside>
    </main>
  );
}
