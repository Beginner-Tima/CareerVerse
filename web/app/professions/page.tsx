'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getProfessions, type Profession } from '../lib/api';

const tenge = new Intl.NumberFormat('ru-KZ');

/**
 * Каталог. Здесь ничего не генерируется моделью: это выгрузка рынка труда РК с
 * источником и датой — то, чем результат подпирается, когда его спрашивают
 * «а откуда цифра».
 */
export default function ProfessionsPage() {
  const [items, setItems] = useState<Profession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfessions()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-zinc-100">Каталог профессий</h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">
          Профессии, под которые собираются рабочие пробы. Зарплаты и вакансии — по
          данным рынка труда Казахстана, с источником и датой выгрузки.
        </p>
      </header>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!items && !error && <p className="text-zinc-500">Загружаю каталог…</p>}

      <ul className="space-y-3">
        {items?.map((p) => (
          <li key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium text-zinc-100">{p.title}</h2>
              {p.titleKk && <span className="text-sm text-zinc-500">{p.titleKk}</span>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{p.description}</p>

            {p.marketData && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-zinc-500">медианная зарплата</dt>
                  <dd className="text-zinc-200">
                    {p.marketData.medianSalaryKzt
                      ? `${tenge.format(p.marketData.medianSalaryKzt)} ₸`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">открытых вакансий</dt>
                  <dd className="text-zinc-200">{p.marketData.vacancyCount ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">спрос</dt>
                  <dd className="text-zinc-200">{p.marketData.demandTrend ?? '—'}</dd>
                </div>
                {p.marketData.regions && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-xs text-zinc-500">где искать</dt>
                    <dd className="text-zinc-200">{p.marketData.regions.join(', ')}</dd>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-3">
                  <dd className="text-xs text-zinc-500">Источник: {p.marketData.source}</dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ul>

      <Link
        href="/test"
        className="inline-block rounded-xl bg-emerald-500 px-6 py-3 font-medium text-emerald-950 transition hover:bg-emerald-400"
      >
        Попробовать себя
      </Link>
    </main>
  );
}
