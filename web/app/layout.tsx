import type { Metadata } from 'next';
import './globals.css';
import { TopBar } from './components/TopBar';

export const metadata: Metadata = {
  title: 'CareerVerse — проба профессии, а не опросник',
  description:
    'Профориентация для подростков Казахстана: свободные ответы, адаптивные вопросы, рабочая проба профессии и привязка к рынку труда РК.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
