'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AiBadge } from '../../components/AiBadge';
import {
  startTrial,
  submitAnswer,
  type Progress,
  type Task,
  type TrialPayload,
} from '../../lib/api';

/**
 * Рабочая проба живёт на своём экране, а не внутри теста.
 *
 * Разговор отвечает на вопрос «куда смотреть» и заканчивается результатом.
 * Сюда человек приходит сам, уже увидев результат, — если захотел проверить,
 * каково это на самом деле. Так тест короче, а в пробу идут те, кому интересно.
 */
export default function TrialPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [task, setTask] = useState<Task | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // React в разработке монтирует компонент дважды — без этого проба
  // запрашивалась бы двумя запросами подряд.
  const started = useRef(false);

  useEffect(() => {
    if (!sessionId || started.current) return;
    started.current = true;
    startTrial(sessionId)
      .then((res) => {
        setTask(res.task);
        setProgress(res.progress);
      })
      .catch((e: Error) => setError(e.message));
  }, [sessionId]);

  const send = useCallback(async () => {
    if (!task || draft.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitAnswer(sessionId, draft);
      setDraft('');
      setProgress(res.progress);
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
  }, [task, draft, sessionId, router]);

  const trial = task?.kind === 'PROFESSION_TRIAL' ? (task.payload as TrialPayload) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-12">
      {progress && (
        <p className="text-xs uppercase tracking-widest text-neutral-600">
          Рабочая проба · шаг {progress.trialStep ?? 1} из {progress.trialSteps}
        </p>
      )}

      {!task && !error && (
        <p className="text-neutral-600">Собираю пробу под твой результат…</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {trial && task && (
        <>
          <section className="space-y-3 rounded-2xl border border-accent-200 bg-accent-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-accent-700">
                {trial.step === 2 ? 'Что вышло из твоего решения' : 'Ситуация'} ·{' '}
                {trial.profession}
              </p>
              <AiBadge model={task.modelId} />
            </div>
            <h1 className="text-lg font-medium text-ink">{trial.title}</h1>
            <p className="text-[15px] leading-relaxed text-neutral-800">{trial.scenario}</p>
            <ul className="space-y-1.5 border-t border-accent-200 pt-3 text-sm text-neutral-700">
              {trial.materials.map((m, i) => (
                <li key={i} className="leading-relaxed">
                  — {m}
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[17px] leading-relaxed text-ink">{task.prompt}</p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            rows={6}
            placeholder="Своими словами. Всё, что нужно для решения, есть выше."
            className="w-full resize-none rounded-2xl border border-divider bg-surface p-4 text-[15px] leading-relaxed text-ink outline-none transition placeholder:text-neutral-500 focus:border-accent disabled:opacity-50"
          />

          <button
            onClick={send}
            disabled={busy || draft.trim().length === 0}
            className="rounded-xl bg-accent px-6 py-3 font-medium text-page transition hover:bg-accent-600 disabled:opacity-40"
          >
            {busy ? 'Смотрю, что вышло…' : 'Ответить'}
          </button>
        </>
      )}
    </main>
  );
}
