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

  async function send() {
    if (!task || draft.trim().length === 0) return;
    setThinkingStep(0);
    setBusy(true);
    setError(null);
    const answered = task;
    try {
      const res = await submitAnswer(sessionId, draft);
      setHistory((h) => [
        ...h,
        { question: answered.prompt, answer: draft, feedback: res.assessment.feedback },
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
          <h1 className="text-3xl font-semibold leading-tight text-zinc-100">
            {t('test.before')}
          </h1>
          <p className="text-[15px] leading-relaxed text-zinc-400">{t('test.intro')}</p>
        </div>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-medium text-zinc-200">{t('test.grade.title')}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{t('test.grade.note')}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className={`rounded-xl border px-4 py-2 text-sm transition ${
                  grade === g
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/10 text-zinc-300 hover:bg-white/5'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        {/* Спрашиваем до первого вопроса и не показываем модели: в конце будет
            видно, куда человек шёл сам и куда его привели собственные ответы. */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-medium text-zinc-200">{t('test.expect.title')}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{t('test.expect.note')}</p>
          <input
            value={expectation}
            onChange={(e) => setExpectation(e.target.value)}
            placeholder={t('test.expect.placeholder')}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50"
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-200">{t('test.ai.title')}</h2>
            <AiBadge />
          </div>
          <p className="text-sm leading-relaxed text-zinc-400">{t('test.ai.note')}</p>
        </section>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            onClick={() => begin('RU')}
            className="rounded-xl bg-emerald-500 px-6 py-3 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? t('test.busy') : t('test.startRu')}
          </button>
          <button
            disabled={busy}
            onClick={() => begin('KK')}
            className="rounded-xl border border-white/15 px-6 py-3 font-medium text-zinc-200 transition hover:bg-white/5 disabled:opacity-50"
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

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-12">
      {progress && (
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          {progress.stage === 'trial'
            ? t('test.progress.trial', {
                step: progress.trialStep ?? 1,
                total: progress.trialSteps,
              })
            : t('test.progress.question', { n: progress.asked + 1 })}
        </p>
      )}

      <ProfileBar signals={profile} />

      {history.map((h, i) => {
        // Появление вешаем только на последний блок: он единственный новый.
        // Старые перерисовываются на каждый ответ, и анимируй их тоже — вся
        // история мигала бы заново после каждого шага.
        const last = i === history.length - 1;
        return (
          // Прошлые шаги приглушены, но остаются читаемыми: подросток должен
          // видеть, что вопрос вырос из его же ответа.
          <section key={i} className={`space-y-3${last ? ' enter-up' : ''}`}>
            <p className="text-[15px] leading-relaxed text-zinc-500">{h.question}</p>
            <p className="rounded-2xl bg-white/[0.06] px-4 py-3 text-[15px] leading-relaxed text-zinc-300">
              {h.answer}
            </p>
            <p
              ref={last ? feedbackRef : null}
              className="border-l-2 border-emerald-500/40 pl-4 text-sm leading-relaxed text-zinc-400"
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
        <section key={history.length} className="space-y-4 enter-up">
          {trial && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-widest text-emerald-400">
                  {trial.step === 2 ? t('test.trial.outcome') : t('test.trial.label')} ·{' '}
                  {trial.profession}
                </p>
                <AiBadge model={task.modelId} />
              </div>
              <h2 className="text-lg font-medium text-zinc-100">{trial.title}</h2>
              <p className="text-[15px] leading-relaxed text-zinc-300">{trial.scenario}</p>
              <ul className="space-y-1.5 border-t border-emerald-500/15 pt-3 text-sm text-zinc-400">
                {trial.materials.map((m, i) => (
                  <li key={i} className="leading-relaxed">
                    — {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Переспрос показываем честно: человек должен понимать, что его не
              поняли, а не думать, что вопрос повторился по ошибке. */}
          {isRetry && (
            <p className="text-xs text-amber-300/80">{t('test.retry')}</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[17px] leading-relaxed text-zinc-100">{task.prompt}</p>
            {!trial && task.generatedByAi && <AiBadge model={task.modelId} />}
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            rows={5}
            placeholder={t('test.placeholder')}
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[15px] leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
          />

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            onClick={send}
            disabled={busy || draft.trim().length === 0}
            className="rounded-xl bg-emerald-500 px-6 py-3 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? t((trial ? THINKING_TRIAL : THINKING)[thinkingStep]) : t('test.answer')}
          </button>
        </section>
      )}
    </main>
  );
}
