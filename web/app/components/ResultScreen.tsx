'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AiBadge } from './AiBadge';
import { ProfileBar } from './ProfileBar';
import { getResult, streamParentLetter, type ResultResponse } from '../lib/api';

const tenge = new Intl.NumberFormat('ru-KZ');

export function ResultScreen({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState('');
  const [letterState, setLetterState] = useState<'idle' | 'streaming' | 'done'>('idle');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    getResult(sessionId).then(setResult).catch((e: Error) => setError(e.message));
    return () => abort.current?.abort();
  }, [sessionId]);

  const writeLetter = useCallback(async () => {
    setLetterState('streaming');
    setLetter('');
    abort.current = new AbortController();
    try {
      await streamParentLetter(sessionId, (chunk) => setLetter((t) => t + chunk), abort.current.signal);
      setLetterState('done');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        setLetterState('idle');
      }
    }
  }, [sessionId]);

  if (error) return <p className="text-rose-400">{error}</p>;
  if (!result) return <p className="text-zinc-500">Собираем результат…</p>;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-emerald-400">Результат пробы</p>
        <h1 className="text-3xl font-semibold text-zinc-100">
          Куда это смотрит
        </h1>
        <ProfileBar signals={result.profile} />
      </header>

      <ol className="space-y-4">
        {result.matches.map((m, i) => (
          <li
            key={m.profession?.id ?? i}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-medium text-zinc-100">
                {i + 1}. {m.profession?.title}
              </h2>
              <span className="shrink-0 text-sm text-emerald-400">
                {Math.round(m.fit * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{m.because}</p>

            {m.labourMarket && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-zinc-500">медианная зарплата</dt>
                  <dd className="text-zinc-200">
                    {m.labourMarket.medianSalaryKzt
                      ? `${tenge.format(m.labourMarket.medianSalaryKzt)} ₸`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">открытых вакансий</dt>
                  <dd className="text-zinc-200">{m.labourMarket.vacancyCount ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">спрос</dt>
                  <dd className="text-zinc-200">{m.labourMarket.demandTrend ?? '—'}</dd>
                </div>
                {m.labourMarket.regions && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-xs text-zinc-500">где искать</dt>
                    <dd className="text-zinc-200">{m.labourMarket.regions.join(', ')}</dd>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-3">
                  <dd className="text-xs text-zinc-500">Источник: {m.labourMarket.source}</dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-zinc-100">Письмо родителям</h2>
          <AiBadge />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Разговор с родителями — самая тяжёлая часть выбора. Это письмо можно показать им.
        </p>

        {letterState === 'idle' ? (
          <button
            onClick={writeLetter}
            className="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
          >
            Написать письмо
          </button>
        ) : (
          <article className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-200">
            {letter}
            {letterState === 'streaming' && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-emerald-400 align-middle" />
            )}
          </article>
        )}
      </section>

      <p className="border-t border-white/5 pt-6 text-xs leading-relaxed text-zinc-500">
        {result.disclaimer}
      </p>
    </div>
  );
}
