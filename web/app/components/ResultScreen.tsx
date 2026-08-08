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
import { rememberFace } from '../lib/face';
import { useT } from '../lib/i18n';
import { topTraitOf } from './TraitAvatar';

const tenge = new Intl.NumberFormat('ru-KZ');

/**
 * Экран ожидания красится по исходу, а не по «хорошо/плохо»: разошлось — это
 * не ошибка и не провал, а ровно то, ради чего человек проходил тест. Зелёным
 * помечено только совпадение, жёлтым — сдвиг, «не знаю» остаётся нейтральным.
 */
const VERDICT_TONE = {
  unsure: {
    heading: 'Было «не знаю»',
    box: 'border-divider bg-surface',
    title: 'text-ink',
    note: 'Разговор и не спрашивал про профессии — он спрашивал про то, что тебе интересно. Название собралось из твоих ответов.',
  },
  confirmed: {
    heading: 'Совпало',
    box: 'border-accent-300 bg-accent-100',
    title: 'text-accent-700',
    note: 'Это не эхо твоего же ответа: названная профессия модели не передавалась. Она пришла к ней сама — по тому, что было в разговоре.',
  },
  shifted: {
    heading: 'Почти совпало',
    box: 'border-neutral-400 bg-neutral-100',
    title: 'text-ink',
    note: 'Названное в начале модели не передавалось: она опиралась только на разговор. Почему первым оказалось другое — ниже, первым пунктом.',
  },
  diverged: {
    heading: 'Ожидание и результат разошлись',
    box: 'border-neutral-400 bg-neutral-100',
    title: 'text-ink',
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
  // Начисление показываем всплывающей плашкой: цифры в шапке меняются молча, и
  // без этого момент, ради которого человек жал кнопку, проходит незамеченным.
  // Само начисление тут ни при чём — оно как считалось на сервере, так и
  // считается, здесь только его видно.
  const [burst, setBurst] = useState<{ xp: number; coins: number } | null>(null);
  const [expectation, setExpectation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const t = useT();

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
          // Тем же заходом запоминаем сильнейшую черту: по ней шапка на всех
          // остальных экранах покажет тот же знак, что и здесь.
          rememberFace(topTraitOf(r.profile));
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
      const gained = result?.reward;
      if (gained) {
        setBurst({ xp: gained.xp, coins: gained.coins });
        // Столько же длится сама анимация — плашка снимается ровно тогда, когда
        // догорела, и не остаётся в разметке невидимым мусором.
        setTimeout(() => setBurst(null), 1800);
      }
      await refresh();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setClaiming(false);
    }
  }, [sessionId, token, refresh, result]);

  // Раньше любой обрыв сети превращал экран результата в тупик: одна попытка,
  // ошибка на английском и никакого выхода, кроме перезагрузки страницы.
  // Прохождение при этом никуда не делось — оно лежит в базе за этой же ссылкой.
  if (error && !result) {
    return (
      <div className="space-y-4">
        <p className="text-danger">{error}</p>
        <p className="text-sm leading-relaxed text-neutral-700">
          Результат никуда не пропал — он сохранён за этой ссылкой.
        </p>
        <button
          onClick={retry}
          disabled={loading}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:bg-accent-600 disabled:opacity-50"
        >
          {loading ? 'Пробую…' : 'Попробовать ещё раз'}
        </button>
      </div>
    );
  }
  // Подбор идёт секундами, и одна строчка на пустом экране читается как
  // зависание. Скелет показывает форму того, что появится, — три карточки,
  // столько модель и просят вернуть, — и подпись остаётся на месте.
  if (!result) {
    return (
      <div className="space-y-10" aria-busy="true">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-accent-700">
            {t('result.kicker')}
          </p>
          <div className="h-8 w-56 animate-pulse rounded-lg bg-neutral-300" />
        </header>

        <ol className="space-y-4">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="space-y-3 rounded-2xl border border-divider bg-surface p-5"
            >
              <div className="h-5 w-1/2 animate-pulse rounded bg-neutral-300" />
              <div className="h-4 w-full animate-pulse rounded bg-neutral-300" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-neutral-300" />
            </li>
          ))}
        </ol>

        <p className="text-sm text-neutral-600">{t('result.loading')}</p>
      </div>
    );
  }

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
        <p className="text-xs uppercase tracking-widest text-accent-700">Результат пробы</p>
        <h1 className="text-3xl font-semibold text-ink">{t('result.title')}</h1>
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

          <p className="mt-3 text-[15px] leading-relaxed text-ink">
            До теста — «{expectation}».{' '}
            {verdict.kind === 'unsure' && `Теперь есть с чего начать: ${verdict.top}.`}
            {verdict.kind === 'confirmed' && 'Разговор привёл ровно туда же.'}
            {verdict.kind === 'shifted' &&
              `В тройке это ${verdict.position}-е место, а первым разговор поставил ${verdict.top}.`}
            {verdict.kind === 'diverged' && `Разговор привёл к другому: ${verdict.top}.`}
          </p>

          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            {VERDICT_TONE[verdict.kind].note}
          </p>
        </section>
      )}

      <ol className="space-y-4">
        {result.matches.map((m, i) => (
          // Карточки выезжают по очереди, а не разом: список ранжированный, и
          // задержка проговаривает порядок — первое совпадение появляется
          // первым. Шаг маленький, вся тройка на месте меньше чем за полсекунды.
          <li
            key={m.profession?.id ?? i}
            className="enter-up rounded-2xl border border-divider bg-surface p-5"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-medium text-ink">
                {i + 1}. {m.profession?.title}
              </h2>
              <span className="shrink-0 text-sm text-accent-700">
                {Math.round(m.fit * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-800">{m.because}</p>

            {m.labourMarket && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-divider pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-neutral-600">{t('result.market.salary')}</dt>
                  <dd className="text-ink">
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
                    <dt className="text-xs text-neutral-600">открытых вакансий</dt>
                    <dd className="text-ink">{m.labourMarket.vacancyCount}</dd>
                  </div>
                )}
                {m.labourMarket.demandTrend && (
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs text-neutral-600">спрос</dt>
                    <dd className="text-ink">{m.labourMarket.demandTrend}</dd>
                  </div>
                )}
                {m.labourMarket.regions && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-xs text-neutral-600">{t('result.market.where')}</dt>
                    <dd className="text-ink">{m.labourMarket.regions.join(', ')}</dd>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-3">
                  <dd className="text-xs text-neutral-600">
                    {t('result.market.source', { source: m.labourMarket.source })}
                  </dd>
                </div>
              </dl>
            )}

            {/* Отсутствие цифр показываем прямо. Выгрузка собрана не по всему
                каталогу, и промолчать здесь — значит оставить пустое место там,
                где у соседней профессии стоит зарплата: выглядит как баг, а на
                деле это единственный честный вариант. Придумать медиану под
                подписью «enbek.kz» нельзя. */}
            {!m.labourMarket && (
              <p className="mt-4 border-t border-divider pt-4 text-xs leading-relaxed text-neutral-600">
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
        <section className="rounded-2xl border border-accent-300 bg-accent-100 p-5">
          <h2 className="text-lg font-medium text-accent-700">
            {result.trial.answered > 0 ? 'Проба не закончена' : 'А каково это на самом деле?'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-800">
            {result.matches[0]?.profession?.title
              ? `Пять минут настоящей работы: ${result.matches[0].profession.title.toLowerCase()}. `
              : 'Пять минут настоящей работы. '}
            Не викторина — реальная ситуация, где надо принять решение и объяснить его.
            Всё нужное будет дано на экране.
          </p>
          <Link
            href={`/trial/${sessionId}`}
            className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:bg-accent-600"
          >
            {result.trial.answered > 0 ? 'Продолжить пробу' : 'Попробовать'}
          </Link>
          <p className="mt-3 text-xs text-neutral-600">
            Займёт пару минут и даст ещё {result.trial.rewardCoins} очков — как раз на
            разбор от наставника.
          </p>
        </section>
      )}

      {/* Раньше результат был тупиком: человек дочитывал и закрывал вкладку.
          Дальше — что с этим делать, и только потом всё остальное. */}
      <CareerPlan sessionId={sessionId} profession={result.matches[0]?.profession?.title} />

      <section className="relative rounded-2xl border border-divider bg-surface p-5">
        {burst && (
          <span
            role="status"
            className="float-away pointer-events-none absolute right-5 top-5 rounded-full bg-accent-200 px-3 py-1 text-sm font-medium text-accent-700"
          >
            +{burst.xp} XP · +{burst.coins} очков
          </span>
        )}
        <h2 className="text-lg font-medium text-ink">
          {claimed ? 'Прохождение сохранено' : 'Сохрани результат и получи очки'}
        </h2>
        {claimed ? (
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            Оно лежит в{' '}
            <Link href="/me" className="text-accent-700 underline-offset-2 hover:underline">
              твоём профиле
            </Link>{' '}
            — вернёшься к нему в любой момент.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">
              {result.reward.xp} XP и {result.reward.coins} очков за пройденную пробу.
              Очков хватит на разбор от наставника — он стоит {result.reward.mentorCost}.
            </p>
            {token ? (
              <button
                onClick={claim}
                disabled={claiming}
                className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:bg-accent-600 disabled:opacity-50"
              >
                {claiming ? 'Сохраняю…' : `Сохранить как ${user?.name ?? 'я'}`}
              </button>
            ) : (
              <Link
                href={`/me?claim=${sessionId}`}
                className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:bg-accent-600"
              >
                Завести аккаунт и сохранить
              </Link>
            )}
            <p className="mt-3 text-xs leading-relaxed text-neutral-600">
              Ни почты, ни пароля не спросим — только имя, класс и город.
            </p>
          </>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>

      <MentorReview
        sessionId={sessionId}
        claimed={claimed}
        trialDone={result.trial.answered > 0}
        cost={result.reward.mentorCost}
      />

      <section className="rounded-2xl border border-divider bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-ink">Письмо родителям</h2>
          <AiBadge />
        </div>
        <p className="mt-2 text-sm text-neutral-700">
          Разговор с родителями — самая тяжёлая часть выбора. Это письмо можно показать им.
        </p>

        {letterState === 'idle' ? (
          <button
            onClick={writeLetter}
            className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:bg-accent-600"
          >
            Написать письмо
          </button>
        ) : (
          <article className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {letter}
            {letterState === 'streaming' && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-accent align-middle" />
            )}
          </article>
        )}
      </section>

      <p className="border-t border-divider pt-6 text-xs leading-relaxed text-neutral-600">
        {result.disclaimer}
      </p>
    </div>
  );
}
