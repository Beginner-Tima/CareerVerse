'use client';

import Link from 'next/link';
import { useAuth } from './lib/auth';
import { useT } from './lib/i18n';

/**
 * Три цифры под плакатом. Смысл строки в том, что каждая проверяема, поэтому
 * первая — настоящая длина каталога (96 в prisma/catalog.ts плюс шесть
 * проработанных в seed.ts), а не круглое число для красоты. Если каталог
 * вырастет, а эта цифра нет — соврём мелко, но соврём.
 *
 * Вторая цифра — главное обещание продукта: тест начинается без единого поля о
 * себе. Она обязана оставаться нулём, иначе экран согласия и вся аргументация
 * про конверсию рассыпаются.
 */
const STATS = [
  { n: '102', key: 'professions' },
  { n: '0', key: 'fields' },
  { n: '2', key: 'langs' },
] as const;

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
    <main className="mx-auto w-full max-w-[1520px] px-6 py-14 sm:px-12 sm:py-20">
      <p className="mb-7 text-xs uppercase tracking-[0.14em] text-accent">{t('home.kicker')}</p>

      {/*
        Плакатный кегль сжимается вместе с экраном через clamp, а не ломается на
        брейкпоинте: заголовок здесь единственный элемент первого экрана, и
        отдать ему четыре разных размера дешевле, чем городить варианты вёрстки.
      */}
      <h1 className="max-w-[17ch] text-[clamp(44px,9vw,104px)] font-extrabold leading-[0.9] tracking-[-0.045em] text-ink">
        {user?.name ? t('home.greeting', { name: user.name }) : t('home.titleA')}
        <br />
        {t('home.titleB')}
      </h1>

      <p className="mt-7 max-w-[58ch] text-[17px] leading-relaxed text-neutral-800 sm:text-[19px]">
        {t('home.lead')}
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Link
          href="/test"
          className="rounded-xl bg-accent px-6 py-3.5 text-[17px] font-semibold text-page shadow-sm transition hover:bg-accent-600"
        >
          {t('home.cta.start')}
        </Link>
        <Link
          href="/professions"
          className="rounded-xl bg-surface px-5 py-3 text-[15px] font-medium text-ink transition hover:bg-neutral-200"
        >
          {t('home.cta.catalog')}
        </Link>
      </div>

      <div className="mt-16 grid gap-8 border-t-2 border-ink pt-6 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.key} className="flex flex-col gap-2">
            <span className="text-[52px] font-extrabold leading-none tabular-nums text-ink">
              {s.n}
            </span>
            <span className="text-[13px] leading-snug text-neutral-700">
              {t(`home.stat.${s.key}`)}
            </span>
          </div>
        ))}
      </div>

      <nav className="mt-16 grid gap-3 sm:grid-cols-2">
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`group rounded-2xl border p-5 transition hover:shadow-sm ${
              item.accent
                ? 'border-accent-300 bg-accent-100 hover:border-accent sm:col-span-2'
                : 'border-divider bg-surface hover:border-ink'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                className={`text-lg font-semibold transition group-hover:text-accent ${
                  item.accent ? 'text-accent-800' : 'text-ink'
                }`}
              >
                {t(`home.${item.key}.title`)}
              </h2>
              <span
                aria-hidden
                className="text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-accent"
              >
                →
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">
              {t(`home.${item.key}.lead`)}
            </p>
          </Link>
        ))}
      </nav>

      {user && (
        <p className="mt-10 text-sm text-neutral-600">
          {t('home.stats', { coins: user.coins, xp: user.xp, level: user.level })}
        </p>
      )}
    </main>
  );
}
