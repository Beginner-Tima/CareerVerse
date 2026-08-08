'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  claimSession,
  getMe,
  login,
  register,
  type HistoryEntry,
  type MeResponse,
} from '../lib/api';
import { clearSession, saveSession, useAuth } from '../lib/auth';

const GRADES = [7, 8, 9, 10, 11];

function ProfileInner() {
  const router = useRouter();
  const params = useSearchParams();
  // На результат ведёт ссылка /me?claim=<id>: человек проходит тест без логина,
  // и аккаунт нужен ровно в тот момент, когда есть что сохранять.
  const pendingClaim = params.get('claim');

  const { token, ready } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [city, setCity] = useState('');
  const [code, setCode] = useState('');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    try {
      setMe(await getMe(t));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready && token) void load(token);
  }, [ready, token, load]);

  /** Сохраняет отложенное прохождение сразу после входа и ведёт обратно к нему. */
  const finishPendingClaim = useCallback(
    async (t: string) => {
      if (!pendingClaim) return;
      try {
        await claimSession(pendingClaim, t);
      } catch {
        // Уже сохранено или чужое — не повод ломать вход, результат покажет как есть.
      }
      router.push(`/result/${pendingClaim}`);
    },
    [pendingClaim, router],
  );

  async function doRegister() {
    if (name.trim().length < 2 || !grade) {
      setError('Нужно имя и класс — остальное по желанию.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await register({ name: name.trim(), grade, city: city.trim() || undefined });
      saveSession(res.token, res.user);
      setIssuedCode(res.loginCode);
      if (pendingClaim) await finishPendingClaim(res.token);
      else await load(res.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await login(code.trim());
      saveSession(res.token, res.user);
      if (pendingClaim) await finishPendingClaim(res.token);
      else await load(res.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="text-neutral-600">Секунду…</p>;

  // ─── Вошедший: профиль и история ───
  if (token && me) {
    return (
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-ink">{me.user.name}</h1>
          <p className="text-sm text-neutral-700">
            {me.user.grade} класс{me.user.city ? `, ${me.user.city}` : ''}
          </p>
        </header>

        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: 'очки', value: me.user.coins, accent: 'text-accent-700' },
            { label: 'XP', value: me.user.xp, accent: 'text-accent-700' },
            { label: 'уровень', value: me.user.level, accent: 'text-ink' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-divider bg-surface p-4 text-center"
            >
              <dd className={`text-2xl font-semibold ${stat.accent}`}>{stat.value}</dd>
              <dt className="mt-1 text-xs uppercase tracking-widest text-neutral-600">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>

        {issuedCode && (
          <section className="rounded-2xl border border-accent-300 bg-accent-100 p-5">
            <h2 className="text-sm font-medium text-accent-800">Твой код входа</h2>
            <p className="mt-2 font-mono text-2xl tracking-widest text-accent-900">
              {issuedCode}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-accent-800/80">
              Запиши его. Почту и телефон мы не спрашиваем, поэтому восстановить
              доступ без кода не сможем.
            </p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Мои прохождения</h2>
          {me.history.length === 0 ? (
            <p className="text-sm text-neutral-700">
              Пока ни одного.{' '}
              <Link href="/test" className="text-accent-700 underline-offset-2 hover:underline">
                Пройти пробу
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {me.history.map((entry: HistoryEntry) => (
                <li key={entry.sessionId}>
                  <Link
                    href={`/result/${entry.sessionId}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-divider bg-surface p-4 transition hover:bg-neutral-200"
                  >
                    <div>
                      <p className="text-ink">{entry.topProfession ?? 'Прохождение'}</p>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {entry.completedAt
                          ? new Date(entry.completedAt).toLocaleDateString('ru-KZ', {
                              day: 'numeric',
                              month: 'long',
                            })
                          : 'не закончено'}
                        {entry.hasMentorReview && ' · есть разбор наставника'}
                      </p>
                    </div>
                    <span aria-hidden className="text-neutral-500">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          onClick={() => {
            clearSession();
            setMe(null);
          }}
          className="text-sm text-neutral-600 underline-offset-2 hover:text-neutral-800 hover:underline"
        >
          Выйти
        </button>
      </div>
    );
  }

  // ─── Гость: регистрация или вход по коду ───
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-ink">
          {mode === 'register' ? 'Заведём аккаунт' : 'Вход по коду'}
        </h1>
        <p className="text-[15px] leading-relaxed text-neutral-700">
          {mode === 'register'
            ? 'Ни почты, ни пароля: тебе нет восемнадцати, и собирать твои контакты мы не хотим. Имя, класс и город — всё.'
            : 'Введи код, который выдали при регистрации.'}
        </p>
      </header>

      {pendingClaim && (
        <p className="rounded-2xl border border-accent-300 bg-accent-100 p-4 text-sm text-accent-800">
          Как только войдёшь, прохождение сохранится в профиль и очки начислятся.
        </p>
      )}

      {mode === 'register' ? (
        <div className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm text-neutral-800">Как тебя звать</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Можно просто имя"
              className="w-full rounded-2xl border border-divider bg-surface p-3.5 text-[15px] text-ink outline-none transition placeholder:text-neutral-500 focus:border-accent"
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm text-neutral-800">Класс</span>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  className={`rounded-xl border px-4 py-2 text-sm transition ${
                    grade === g
                      ? 'border-accent bg-accent-100 text-accent-700'
                      : 'border-divider text-neutral-800 hover:bg-neutral-200'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-neutral-800">Город — по желанию</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Нужен для советов про вузы и работу"
              className="w-full rounded-2xl border border-divider bg-surface p-3.5 text-[15px] text-ink outline-none transition placeholder:text-neutral-500 focus:border-accent"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            onClick={doRegister}
            disabled={busy}
            className="rounded-xl bg-accent px-6 py-3 font-medium text-page transition hover:bg-accent-600 disabled:opacity-50"
          >
            {busy ? 'Создаю…' : 'Готово'}
          </button>

          <button
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className="block text-sm text-neutral-600 underline-offset-2 hover:text-neutral-800 hover:underline"
          >
            У меня уже есть код входа
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm text-neutral-800">Код входа</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7WF-3RTM"
              className="w-full rounded-2xl border border-divider bg-surface p-3.5 font-mono text-lg tracking-widest text-ink outline-none transition placeholder:text-neutral-400 focus:border-accent"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            onClick={doLogin}
            disabled={busy}
            className="rounded-xl bg-accent px-6 py-3 font-medium text-page transition hover:bg-accent-600 disabled:opacity-50"
          >
            {busy ? 'Проверяю…' : 'Войти'}
          </button>

          <button
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className="block text-sm text-neutral-600 underline-offset-2 hover:text-neutral-800 hover:underline"
          >
            Кода нет — завести аккаунт
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      {/* useSearchParams требует границы Suspense — иначе весь маршрут
          выпадает в клиентский рендер целиком. */}
      <Suspense fallback={<p className="text-neutral-600">Секунду…</p>}>
        <ProfileInner />
      </Suspense>
    </main>
  );
}
