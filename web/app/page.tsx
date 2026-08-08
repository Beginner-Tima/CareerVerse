'use client';

import Link from 'next/link';
import { useAuth } from './lib/auth';
import { useT } from './lib/i18n';

/**
 * Главное меню. Три пункта, и все три работают: серая кнопка «скоро» на защите
 * притягивает жюри сильнее рабочего экрана, поэтому магазина здесь нет.
 *
 * Хранятся ключи, а не подписи: язык переключается на лету, и захардкоженная
 * строка осталась бы русской посреди казахского экрана.
 */
const MENU = [
  { href: '/test', key: 'test', accent: true },
  { href: '/professions', key: 'catalog', accent: false },
  { href: '/me', key: 'me', accent: false },
] as const;

export default function Home() {
  const { user } = useAuth();
  const t = useT();

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-5 py-12">
      <section className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-emerald-400">CareerVerse</p>
        <h1 className="text-4xl font-semibold leading-tight text-zinc-100">
          {user?.name ? t('home.greeting', { name: user.name }) : t('home.titleA')}
          <br />
          {t('home.titleB')}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">{t('home.lead')}</p>
      </section>

      <nav className="grid gap-3 sm:grid-cols-2">
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`group rounded-2xl border p-5 transition ${
              item.accent
                ? 'border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] sm:col-span-2'
                : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                className={`text-lg font-medium ${
                  item.accent ? 'text-emerald-300' : 'text-zinc-100'
                }`}
              >
                {t(`home.${item.key}.title`)}
              </h2>
              <span
                aria-hidden
                className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"
              >
                →
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              {t(`home.${item.key}.lead`)}
            </p>
          </Link>
        ))}
      </nav>

      {user && (
        <p className="text-sm text-zinc-500">
          {t('home.stats', { coins: user.coins, xp: user.xp, level: user.level })}
        </p>
      )}
    </main>
  );
}
