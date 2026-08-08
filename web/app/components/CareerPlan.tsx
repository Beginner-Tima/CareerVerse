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
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-zinc-100">Что делать дальше</h2>
        <AiBadge />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {profession
          ? `Какие предметы ЕНТ, куда поступать и что нужно, чтобы работать: ${profession.toLowerCase()}.`
          : 'Какие предметы ЕНТ, куда поступать и что нужно для первой работы.'}
      </p>

      {!plan && (
        <div className="mt-4 space-y-3">
          {showContext ? (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="Например: живу в Шымкенте, по математике 4, уезжать из города не планирую."
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50"
            />
          ) : (
            <button
              onClick={() => setShowContext(true)}
              className="text-sm text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
            >
              Рассказать о себе, чтобы план был точнее
            </button>
          )}

          <button
            onClick={load}
            disabled={busy}
            className="block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? 'Собираю путь…' : 'Показать путь'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {plan && (
        <div className="mt-5 space-y-5 text-sm leading-relaxed">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">Предметы ЕНТ</h3>
            <p className="mt-1.5 text-zinc-200">{plan.entSubjects.join(' · ')}</p>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">Куда поступать</h3>
            <ul className="mt-2 space-y-2.5">
              {plan.universities.map((u, i) => (
                <li key={i} className="border-l-2 border-white/10 pl-3">
                  <p className="text-zinc-200">
                    {u.name} <span className="text-zinc-500">· {u.city}</span>
                  </p>
                  <p className="text-zinc-400">{u.why}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">
              Английский и IELTS
            </h3>
            <p className="mt-1.5 text-zinc-300">{plan.languages}</p>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">
              Чтобы взяли на работу
            </h3>
            <ul className="mt-2 space-y-1.5 text-zinc-300">
              {plan.toGetHired.map((item, i) => (
                <li key={i}>— {item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">
              В ближайший месяц
            </h3>
            <ul className="mt-2 space-y-1.5 text-zinc-300">
              {plan.nextMonth.map((item, i) => (
                <li key={i}>— {item}</li>
              ))}
            </ul>
          </div>

          {/* Вузы — единственное место, где модель может уверенно соврать
              названием программы. Дисклеймер здесь не формальность. */}
          <p className="border-t border-white/5 pt-4 text-xs text-zinc-500">{disclaimer}</p>
        </div>
      )}
    </section>
  );
}
