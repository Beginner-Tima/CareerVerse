'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AiBadge } from './AiBadge';
import { ProfileBar } from './ProfileBar';
import { CareerPlan } from './CareerPlan';
import { MentorReview } from './MentorReview';
import {
  claimSession,
  getResult,
  humanError,
  streamParentLetter,
  type ResultResponse,
} from '../lib/api';
import { updateUser, useAuth } from '../lib/auth';
import { compareExpectation, recallExpectation } from '../lib/expectation';

const tenge = new Intl.NumberFormat('ru-KZ');

/**
 * Экран ожидания красится по исходу, а не по «хорошо/плохо»: разошлось — это
 * не ошибка и не провал, а ровно то, ради чего человек проходил тест. Зелёным
 * помечено только совпадение, жёлтым — сдвиг, «не знаю» остаётся нейтральным.
 */
const VERDICT_TONE = {
  unsure: {
    heading: 'Было «не знаю»',
    box: 'border-white/15 bg-white/[0.04]',
    title: 'text-zinc-100',
    note: 'Разговор и не спрашивал про профессии — он спрашивал про то, что тебе интересно. Название собралось из твоих ответов.',
  },
  confirmed: {
    heading: 'Совпало',
    box: 'border-emerald-500/30 bg-emerald-500/[0.06]',
    title: 'text-emerald-300',
    note: 'Это не эхо твоего же ответа: названная профессия модели не передавалась. Она пришла к ней сама — по тому, что было в разговоре.',
  },
  shifted: {
    heading: 'Почти совпало',
    box: 'border-amber-400/30 bg-amber-400/[0.06]',
    title: 'text-amber-200',
    note: 'Названное в начале модели не передавалось: она опиралась только на разговор. Почему первым оказалось другое — ниже, первым пунктом.',
  },
  diverged: {
    heading: 'Ожидание и результат разошлись',
    box: 'border-amber-400/30 bg-amber-400/[0.06]',
    title: 'text-amber-200',
    note: 'Названное в начале модели не передавалось: она опиралась только на разговор и про твой первый ответ ничего не знала. Почему получилось именно так — ниже, первым пунктом.',
  },
} as const;

export function ResultScreen({ sessionId }: { sessionId: string }) {
  const { token, user, refresh } = useAuth();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState('');
  const [letterState, setLetterState] = useState<'idle' | 'streaming' | 'done'>('idle');
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [expectation, setExpectation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abort = useRef<AbortController | null>(null);

  // Цепочка промисов, а не async-функция: состояние меняется только в
  // колбэках, поэтому вызов из эффекта не тянет каскад синхронных рендеров.
  const load = useCallback(
    () =>
      getResult(sessionId)
        .then((r) => {
          setResult(r);
          setClaimed(r.claimed);
          // localStorage есть только в браузере — читаем здесь, а не в рендере:
          // к этому моменту мы точно на клиенте.
          setExpectation(recallExpectation(sessionId));
          setError(null);
        })
        .catch((e: unknown) => setError(humanError(e)))
        .finally(() => setLoading(false)),
    [sessionId],
  );

  // Флаги ставит обработчик клика, а не тело эффекта: setState прямо в эффекте
  // тянет за собой лишний каскад рендеров.
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    return () => abort.current?.abort();
  }, [load]);

  const writeLetter = useCallback(async () => {
    setLetterState('streaming');
    setLetter('');
    abort.current = new AbortController();
    try {
      await streamParentLetter(sessionId, (chunk) => setLetter((t) => t + chunk), abort.current.signal);
      setLetterState('done');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(humanError(e));
        setLetterState('idle');
      }
    }
  }, [sessionId]);

  const claim = useCallback(async () => {
    if (!token) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await claimSession(sessionId, token);
      updateUser(res.user);
      setClaimed(true);
      await refresh();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setClaiming(false);
    }
  }, [sessionId, token, refresh]);

  // Раньше любой обрыв сети превращал экран результата в тупик: одна попытка,
  // ошибка на английском и никакого выхода, кроме перезагрузки страницы.
  // Прохождение при этом никуда не делось — оно лежит в базе за этой же ссылкой.
  if (error && !result) {
    return (
      <div className="space-y-4">
        <p className="text-rose-400">{error}</p>
        <p className="text-sm leading-relaxed text-zinc-400">
          Результат никуда не пропал — он сохранён за этой ссылкой.
        </p>
        <button
          onClick={retry}
          disabled={loading}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? 'Пробую…' : 'Попробовать ещё раз'}
        </button>
      </div>
    );
  }
  if (!result) return <p className="text-zinc-500">Собираем результат…</p>;

  const verdict = expectation
    ? compareExpectation(
        expectation,
        result.matches
          .map((m) => m.profession?.title)
          .filter((t): t is string => Boolean(t)),
      )
    : null;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-emerald-400">Результат пробы</p>
        <h1 className="text-3xl font-semibold text-zinc-100">Куда это смотрит</h1>
        <ProfileBar signals={result.profile} />
      </header>

      {/* Ожидание против результата. Работает в обе стороны: совпадение здесь —
          не пустой экран, а доказательство, что модель пришла туда же вслепую.
          Блока не будет, если человек не назвал профессию или открыл ссылку с
          другого устройства — ожидание живёт в localStorage, см. lib/expectation. */}
      {verdict && expectation && (
        <section className={`rounded-2xl border p-5 ${VERDICT_TONE[verdict.kind].box}`}>
          <h2 className={`text-lg font-medium ${VERDICT_TONE[verdict.kind].title}`}>
            {VERDICT_TONE[verdict.kind].heading}
          </h2>

          <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
            До теста — «{expectation}».{' '}
            {verdict.kind === 'unsure' && `Теперь есть с чего начать: ${verdict.top}.`}
            {verdict.kind === 'confirmed' && 'Разговор привёл ровно туда же.'}
            {verdict.kind === 'shifted' &&
              `В тройке это ${verdict.position}-е место, а первым разговор поставил ${verdict.top}.`}
            {verdict.kind === 'diverged' && `Разговор привёл к другому: ${verdict.top}.`}
          </p>

          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {VERDICT_TONE[verdict.kind].note}
          </p>
        </section>
      )}

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
                {/* Пустые ячейки не показываем: выгрузка собрана не по всему
                    каталогу, и прочерк рядом с заполненным соседом читается как
                    поломка, а не как «данных нет». */}
                {m.labourMarket.vacancyCount != null && (
                  <div>
                    <dt className="text-xs text-zinc-500">открытых вакансий</dt>
                    <dd className="text-zinc-200">{m.labourMarket.vacancyCount}</dd>
                  </div>
                )}
                {m.labourMarket.demandTrend && (
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs text-zinc-500">спрос</dt>
                    <dd className="text-zinc-200">{m.labourMarket.demandTrend}</dd>
                  </div>
                )}
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

            {/* Отсутствие цифр показываем прямо. Выгрузка собрана не по всему
                каталогу, и промолчать здесь — значит оставить пустое место там,
                где у соседней профессии стоит зарплата: выглядит как баг, а на
                деле это единственный честный вариант. Придумать медиану под
                подписью «enbek.kz» нельзя. */}
            {!m.labourMarket && (
              <p className="mt-4 border-t border-white/5 pt-4 text-xs leading-relaxed text-zinc-500">
                Данных рынка труда по этой профессии у нас пока нет — выгрузка
                собрана не по всем направлениям, а придумывать цифры мы не стали.
              </p>
            )}
          </li>
        ))}
      </ol>

      {/* Проба вынесена из теста: разговор заканчивается результатом, а работу
          руками человек пробует по своему выбору — уже зная, что ему подобрали. */}
      {!result.trial.done && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5">
          <h2 className="text-lg font-medium text-emerald-300">
            {result.trial.answered > 0 ? 'Проба не закончена' : 'А каково это на самом деле?'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            {result.matches[0]?.profession?.title
              ? `Пять минут настоящей работы: ${result.matches[0].profession.title.toLowerCase()}. `
              : 'Пять минут настоящей работы. '}
            Не викторина — реальная ситуация, где надо принять решение и объяснить его.
            Всё нужное будет дано на экране.
          </p>
          <Link
            href={`/trial/${sessionId}`}
            className="mt-4 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
          >
            {result.trial.answered > 0 ? 'Продолжить пробу' : 'Попробовать'}
          </Link>
          <p className="mt-3 text-xs text-zinc-500">
            Займёт пару минут и даст ещё {result.trial.rewardCoins} очков — как раз на
            разбор от наставника.
          </p>
        </section>
      )}

      {/* Раньше результат был тупиком: человек дочитывал и закрывал вкладку.
          Дальше — что с этим делать, и только потом всё остальное. */}
      <CareerPlan sessionId={sessionId} profession={result.matches[0]?.profession?.title} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-medium text-zinc-100">
          {claimed ? 'Прохождение сохранено' : 'Сохрани результат и получи очки'}
        </h2>
        {claimed ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Оно лежит в{' '}
            <Link href="/me" className="text-emerald-400 underline-offset-2 hover:underline">
              твоём профиле
            </Link>{' '}
            — вернёшься к нему в любой момент.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {result.reward.xp} XP и {result.reward.coins} очков за пройденную пробу.
              Очков хватит на разбор от наставника — он стоит {result.reward.mentorCost}.
            </p>
            {token ? (
              <button
                onClick={claim}
                disabled={claiming}
                className="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {claiming ? 'Сохраняю…' : `Сохранить как ${user?.name ?? 'я'}`}
              </button>
            ) : (
              <Link
                href={`/me?claim=${sessionId}`}
                className="mt-4 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
              >
                Завести аккаунт и сохранить
              </Link>
            )}
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              Ни почты, ни пароля не спросим — только имя, класс и город.
            </p>
          </>
        )}
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </section>

      <MentorReview
        sessionId={sessionId}
        claimed={claimed}
        trialDone={result.trial.answered > 0}
        cost={result.reward.mentorCost}
      />

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
