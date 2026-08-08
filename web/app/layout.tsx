import type { Metadata } from 'next';
import { Golos_Text } from 'next/font/google';
import './globals.css';
import { HtmlLang } from './components/HtmlLang';
import { TopBar } from './components/TopBar';

/**
 * Шрифт отдаётся со своего домена, а не с Google: `next/font` скачивает файлы в
 * сборку. Это не только про скорость — иначе каждый открывший тест светил бы
 * свой визит в чужую аналитику, а мы обещаем подростку, что не собираем лишнего.
 *
 * Кириллица в subsets обязательна: без неё в сборку уедет только латиница, и
 * весь русский и казахский текст покажется запасным system-ui. Почему не Archivo
 * из гайда — в шапке globals.css.
 */
const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600', '800', '900'],
  variable: '--font-golos',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CareerVerse — проба профессии, а не опросник',
  description:
    'Профориентация для подростков Казахстана: свободные ответы, адаптивные вопросы, рабочая проба профессии и привязка к рынку труда РК.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={golos.variable}>
      <body className="min-h-dvh bg-page text-ink antialiased">
        <HtmlLang />
        <TopBar />
        {children}
      </body>
    </html>
  );
}
