'use client';

import { useState } from 'react';
import { AiBadge } from './AiBadge';
import { requestPlan, type CareerPlanContent } from '../lib/api';

/**
 * «Что дальше» — то, чего результату не хватало: путь от школы до первой работы.
 * Бесплатно и без логина: брать очки за то, ради чего подросток пришёл, значило
 * бы гейтить главную ценность продукта.
 */
export function CareerPlan({
  sessionId,
  profession,
}: {
  sessionId: string;
  profession?: string;
}) {
  const [plan, setPlan] = useState<CareerPlanContent | null>(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestPlan(sessionId, context.trim() || undefined);
      setPlan(res.content);
      setDisclaimer(res.disclaimer);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-divider bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-ink">Что делать дальше</h2>
        <AiBadge />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        {profession
          ? `Что сделать в ближайший месяц, какие предметы ЕНТ и куда поступать, чтобы работать: ${profession.toLowerCase()}.`
          : 'Что сделать в ближайший месяц, какие предметы ЕНТ и куда поступать.'}
      </p>

      {!plan && (
        <div className="mt-4 space-y-3">
          {showContext ? (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="Например: живу в Шымкенте, по математике 4, уезжать из города не планирую."
              className="w-full resize-none rounded-2xl border border-divider bg-surface p-4 text-sm leading-relaxed text-ink outline-none transition placeholder:text-neutral-500 focus:border-accent"
            />
          ) : (
            <button
              onClick={() => setShowContext(true)}
              className="text-sm text-neutral-700 underline-offset-2 hover:text-ink hover:underline"
            >
              Рассказать о себе, чтобы план был точнее
            </button>
          )}

          <button
            onClick={load}
            disabled={busy}
            className="block rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:bg-accent-600 disabled:opacity-50"
          >
            {busy ? 'Собираю путь…' : 'Показать путь'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {plan && (
        <div className="mt-5 space-y-5 text-sm leading-relaxed">
          {/* Ближайший месяц идёт первым и выделен намеренно. Всё остальное в
              этом блоке — горизонт в годы: ЕНТ, вуз, первая работа. Подросток
              закроет вкладку, если между «сегодня» и «профессией» не окажется
              шага, который делается на этой неделе. */}
          <div className="rounded-xl border border-accent-300 bg-accent-100 p-4">
            <h3 className="text-xs uppercase tracking-widest text-accent-700">
              Ближайший месяц
            </h3>
            <ul className="mt-2.5 space-y-2 text-ink">
              {plan.nextMonth.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="shrink-0 text-accent-700/70 tabular-nums">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-accent-700">Предметы ЕНТ</h3>
            <p className="mt-1.5 text-ink">{plan.entSubjects.join(' · ')}</p>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-accent-700">Куда поступать</h3>
            <ul className="mt-2 space-y-2.5">
              {plan.universities.map((u, i) => (
                <li key={i} className="border-l-2 border-divider pl-3">
                  <p className="text-ink">
                    {u.name} <span className="text-neutral-600">· {u.city}</span>
                  </p>
                  <p className="text-neutral-700">{u.why}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-accent-700">
              Английский и IELTS
            </h3>
            <p className="mt-1.5 text-neutral-800">{plan.languages}</p>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-accent-700">
              Чтобы взяли на работу
            </h3>
            <ul className="mt-2 space-y-1.5 text-neutral-800">
              {plan.toGetHired.map((item, i) => (
                <li key={i}>— {item}</li>
              ))}
            </ul>
          </div>

          {/* Вузы — единственное место, где модель может уверенно соврать
              названием программы. Дисклеймер здесь не формальность. */}
          <p className="border-t border-divider pt-4 text-xs text-neutral-600">{disclaimer}</p>
        </div>
      )}
    </section>
  );
}
