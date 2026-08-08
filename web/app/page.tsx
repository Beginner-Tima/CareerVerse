'use client';

import Link from 'next/link';
import { useAuth } from './lib/auth';

/**
 * Главное меню. Три пункта, и все три работают: серая кнопка «скоро» на защите
 * притягивает жюри сильнее рабочего экрана, поэтому магазина здесь нет.
 */
const MENU = [
  {
    href: '/test',
    title: 'Пройти пробу',
    lead: 'Разговор без вариантов ответа и кусок настоящей работы в конце',
    accent: true,
  },
  {
    href: '/professions',
    title: 'Каталог профессий',
    lead: 'Чем занимаются, сколько платят и где есть вакансии в Казахстане',
    accent: false,
  },
  {
    href: '/me',
    title: 'Мои прохождения',
    lead: 'Результаты, очки и разборы от наставника',
    accent: false,
  },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-5 py-12">
      <section className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-emerald-400">CareerVerse</p>
        <h1 className="text-4xl font-semibold leading-tight text-zinc-100">
          {user?.name ? `Привет, ${user.name}.` : 'Не тест с вариантами.'}
          <br />
          Разговор и рабочая проба.
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">
          Здесь нет ключа ответов. Ты отвечаешь своими словами, следующий вопрос
          рождается из предыдущего, а в конце видишь, к какой работе это ближе и
          что с ней происходит на рынке труда Казахстана. Захочешь проверить —
          сможешь сделать кусок этой работы сам.
        </p>
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
                {item.title}
              </h2>
              <span
                aria-hidden
                className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"
              >
                →
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.lead}</p>
          </Link>
        ))}
      </nav>

      {user && (
        <p className="text-sm text-zinc-500">
          У тебя {user.coins} очков и {user.xp} XP, уровень {user.level}. Очки тратятся
          на разбор рабочей пробы наставником.
        </p>
      )}
    </main>
  );
}
