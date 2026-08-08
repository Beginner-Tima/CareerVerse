'use client';

import { useState } from 'react';
import { AiBadge } from './AiBadge';
import { requestMentorReview, type MentorReviewContent } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Единственное, на что тратятся очки. Не доступ к пробам других профессий:
 * платить за то, чтобы школьник узнал о другой работе, — педагогически кривая
 * механика, и на защите об это спотыкаются первым делом.
 */
export function MentorReview({
  sessionId,
  claimed,
  trialDone,
  cost,
}: {
  sessionId: string;
  claimed: boolean;
  trialDone: boolean;
  cost: number;
}) {
  const { token, user, refresh } = useAuth();
  const [review, setReview] = useState<MentorReviewContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const affordable = (user?.coins ?? 0) >= cost;

  async function buy() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await requestMentorReview(sessionId, token);
      setReview(res.content);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-zinc-100">Разбор от наставника</h2>
        <AiBadge />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Подробный разбор твоей рабочей пробы: что получилось, чего не хватило и что
        делать в ближайший месяц. Стоит {cost} очков.
      </p>

      {!review && (
        <div className="mt-4">
          {!trialDone ? (
            <p className="text-sm text-zinc-500">
              Разбирать пока нечего: наставник смотрит на то, как ты решал рабочую пробу.
              Пройди её — и возвращайся.
            </p>
          ) : !claimed ? (
            <p className="text-sm text-zinc-500">
              Сначала сохрани прохождение — разбор делается по своему результату.
            </p>
          ) : !affordable ? (
            <p className="text-sm text-zinc-500">
              У тебя {user?.coins ?? 0} из {cost} очков. Пройди ещё одну пробу — их
              хватит.
            </p>
          ) : (
            <button
              onClick={buy}
              disabled={busy}
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              {busy ? 'Наставник читает твою пробу…' : `Разобрать за ${cost} очков`}
            </button>
          )}
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </div>
      )}

      {review && (
        <div className="mt-5 space-y-4 text-sm leading-relaxed">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">Получилось</h3>
            <p className="mt-1.5 text-zinc-200">{review.didWell}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-amber-400">Не хватило</h3>
            <p className="mt-1.5 text-zinc-200">{review.gaps}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-emerald-400">
              План на месяц
            </h3>
            <ol className="mt-2 space-y-1.5 text-zinc-300">
              {review.monthPlan.map((step, i) => (
                <li key={i}>
                  {i + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
          <p className="border-t border-white/5 pt-4 text-zinc-300">{review.closing}</p>
        </div>
      )}
    </section>
  );
}
