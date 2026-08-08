'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

interface Exchange {
  question: string;
  answer: string;
  feedback: string;
}

const GRADES = [7, 8, 9, 10, 11];

export default function TestPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [grade, setGrade] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [task, setTask] = useState<Task | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [profile, setProfile] = useState<Signal[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin(locale: 'RU' | 'KK') {
    if (!grade) {
      setError('Выбери класс — от него зависит, насколько сложной будет проба.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await startSession(locale, grade);
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
            Прежде чем начать
          </h1>
          <p className="text-[15px] leading-relaxed text-zinc-400">
            Разговор займёт минут десять. Сколько будет вопросов — заранее неизвестно:
            он закончится, когда станет понятно, как ты думаешь.
          </p>
        </div>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-medium text-zinc-200">В каком ты классе?</h2>
          <p className="text-sm leading-relaxed text-zinc-400">
            Это не формальность: от класса зависит, насколько сложной будет рабочая
            проба и о чём вообще имеет смысл говорить.
          </p>
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

        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-200">Про твои ответы</h2>
            <AiBadge />
          </div>
          <p className="text-sm leading-relaxed text-zinc-400">
            Вопросы и разбор твоих ответов создаёт искусственный интеллект. Ответы
            сохраняются, чтобы собрать результат и письмо родителям. Это не диагноз и
            не приговор — повод для разговора. Нажимая «Начать», ты соглашаешься на
            обработку ответов моделью.
          </p>
        </section>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            onClick={() => begin('RU')}
            className="rounded-xl bg-emerald-500 px-6 py-3 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? 'Секунду…' : 'Начать на русском'}
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
            ? `Рабочая проба · шаг ${progress.trialStep ?? 1} из ${progress.trialSteps}`
            : `Вопрос ${progress.asked + 1} · разговор идёт, пока не станет понятно`}
        </p>
      )}

      <ProfileBar signals={profile} />

      {history.map((h, i) => (
        // Прошлые шаги приглушены, но остаются читаемыми: подросток должен
        // видеть, что вопрос вырос из его же ответа.
        <section key={i} className="space-y-3">
          <p className="text-[15px] leading-relaxed text-zinc-500">{h.question}</p>
          <p className="rounded-2xl bg-white/[0.06] px-4 py-3 text-[15px] leading-relaxed text-zinc-300">
            {h.answer}
          </p>
          <p className="border-l-2 border-emerald-500/40 pl-4 text-sm leading-relaxed text-zinc-400">
            {h.feedback}
          </p>
        </section>
      ))}

      {task && (
        <section className="space-y-4">
          {trial && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-widest text-emerald-400">
                  {trial.step === 2 ? 'Что вышло из твоего решения' : 'Рабочая проба'} ·{' '}
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
            <p className="text-xs text-amber-300/80">
              Спрошу то же самое, но иначе — из прошлого ответа я ничего не понял.
            </p>
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
            placeholder="Своими словами. Коротко — тоже нормально."
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[15px] leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
          />

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            onClick={send}
            disabled={busy || draft.trim().length === 0}
            className="rounded-xl bg-emerald-500 px-6 py-3 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? 'Читаю ответ…' : 'Ответить'}
          </button>
        </section>
      )}
    </main>
  );
}
