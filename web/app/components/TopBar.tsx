'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useFace } from '../lib/face';
import { setUiLocale, useT } from '../lib/i18n';
import { TraitAvatar } from './TraitAvatar';

/**
 * Шапка на всех экранах: слева выход на главное меню, справа профиль.
 * Раньше приложение было одним экраном без выхода — попав в тест, человек
 * не мог вернуться никуда, кроме как перезагрузив страницу.
 */
export function TopBar() {
  const pathname = usePathname();
  const { user, ready, refresh } = useAuth();
  const face = useFace();
  const t = useT();

  // Очки меняются на других экранах (сохранил прохождение, купил разбор) —
  // при каждом переходе спрашиваем сервер, а не верим локальной копии.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  return (
    <header className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
        <Link
          href="/"
          className="group flex items-center gap-2 text-sm font-medium text-zinc-300 transition hover:text-zinc-100"
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 transition group-hover:bg-emerald-500/25"
          >
            ◆
          </span>
          CareerVerse
        </Link>

        <div className="flex items-center gap-2">
          {/* Переключатель языка держим в шапке, а не только на входе в тест:
              язык выбирают не один раз в жизни, а в тот момент, когда стало
              неудобно читать. Кнопка называет тот язык, на который переключит,
              а не текущий — «ҚАЗ» на русском экране означает «сделать
              казахским», и это единственное прочтение без инструкции. */}
          <button
            onClick={() => setUiLocale(t.locale === 'kk' ? 'ru' : 'kk')}
            title={t('topbar.switchLang')}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            {t.locale === 'kk' ? 'РУС' : 'ҚАЗ'}
          </button>

          {!ready ? (
            <span className="h-8 w-24 animate-pulse rounded-full bg-white/5" />
          ) : user ? (
            <Link
              href="/me"
              className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-3 pr-1.5 text-sm transition hover:bg-white/[0.07]"
            >
              <span
                className="flex items-center gap-1.5 text-amber-300"
                title={t('topbar.points')}
              >
                <span aria-hidden>●</span>
                {user.coins}
              </span>
              {/* Знак черты, если тест уже пройден, иначе первая буква имени.
                  До первого прохождения показывать нечего — черты берутся из
                  ответов, а их ещё не было. */}
              {face ? (
                <TraitAvatar trait={face} size="sm" />
              ) : (
                <span className="grid size-7 place-items-center rounded-full bg-emerald-500/20 text-xs font-medium text-emerald-300">
                  {(user.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          ) : (
            <Link
              href="/me"
              className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-zinc-300 transition hover:bg-white/5"
            >
              {t('topbar.signin')}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
