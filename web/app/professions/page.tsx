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
        <h1 className="text-3xl font-semibold text-ink">Каталог профессий</h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-neutral-700">
          Профессии, под которые собираются рабочие пробы. Зарплаты — по данным рынка
          труда Казахстана, с источником и датой выгрузки. Они есть не у всех: где
          цифру не удалось собрать поимённо, её нет и на экране.
        </p>
      </header>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!items && !error && (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="space-y-3 rounded-2xl border border-divider bg-surface p-5"
            >
              <div className="h-5 w-2/5 animate-pulse rounded bg-neutral-300" />
              <div className="h-4 w-full animate-pulse rounded bg-neutral-300" />
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3">
        {items?.map((p) => (
          <li key={p.id} className="rounded-2xl border border-divider bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium text-ink">{p.title}</h2>
              {p.titleKk && <span className="text-sm text-neutral-600">{p.titleKk}</span>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-800">{p.description}</p>

            {p.marketData && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-divider pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-neutral-600">медианная зарплата</dt>
                  <dd className="text-ink">
                    {p.marketData.medianSalaryKzt
                      ? `${tenge.format(p.marketData.medianSalaryKzt)} ₸`
                      : '—'}
                  </dd>
                </div>
                {/* Прочерк рядом с заполненной зарплатой читается как поломка,
                    а не как «данных нет»: у профессий из широкого каталога этих
                    двух полей нет вовсе. Экран результата прячет их так же. */}
                {p.marketData.vacancyCount != null && (
                  <div>
                    <dt className="text-xs text-neutral-600">открытых вакансий</dt>
                    <dd className="text-ink">{p.marketData.vacancyCount}</dd>
                  </div>
                )}
                {p.marketData.demandTrend && (
                  <div>
                    <dt className="text-xs text-neutral-600">спрос</dt>
                    <dd className="text-ink">{p.marketData.demandTrend}</dd>
                  </div>
                )}
                {p.marketData.regions && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-xs text-neutral-600">где искать</dt>
                    <dd className="text-ink">{p.marketData.regions.join(', ')}</dd>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-3">
                  <dd className="text-xs text-neutral-600">Источник: {p.marketData.source}</dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ul>

      <Link
        href="/test"
        className="inline-block rounded-xl bg-accent px-6 py-3 font-medium text-page transition hover:bg-accent-600"
      >
        Попробовать себя
      </Link>
    </main>
  );
}
