'use client';

import { useEffect, useState } from 'react';
import type { Signal } from '../lib/api';

/**
 * Коды черт модель выдаёт по-английски и в kebab-case — так и оставляем: это
 * ключ, по которому сигналы сливаются между ответами, и переводить его в
 * свободный русский текст значило бы ломать слияние («системное мышление» и
 * «мышление системное» стали бы двумя разными чертами). Переводим только на
 * экране. Словарь заведомо неполный: словарь черт у модели открытый, незнакомый
 * код покажется как есть, и это лучше, чем подогнать его под неверную подпись.
 */
const LABELS: Record<string, string> = {
  'systems-thinking': 'системное мышление',
  'care-for-people': 'забота о людях',
  'hands-on': 'работа руками',
  'attention-to-detail': 'внимание к деталям',
  'creative-expression': 'придумывать своё',
  'problem-solving': 'решать задачи',
  'communication': 'общение',
  'leadership': 'вести за собой',
  'independence': 'работать одному',
  'teamwork': 'работа в команде',
  'analytical': 'анализ',
  'curiosity': 'любопытство',
  'persistence': 'доводить до конца',
  'helping-others': 'помогать людям',
  'organizing': 'наводить порядок',
  'risk-taking': 'готовность рискнуть',
};

const label = (trait: string) => LABELS[trait] ?? trait.replace(/[-_]/g, ' ');

const percent = (weight: number) => Math.round(Math.min(Math.max(weight, 0), 1) * 100);

/**
 * Полоса растёт от нуля на своём первом кадре, а дальше тянется к новому
 * значению переходом. Ключ строки — сама черта, поэтому новый сигнал монтирует
 * новую строку и она растёт с нуля, а уже знакомая просто доезжает до новой
 * ширины: подросток видит, что его ответ сдвинул профиль, а не перерисовал его.
 */
function Bar({ weight }: { weight: number }) {
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-emerald-400/80 transition-[width] duration-700 ease-out"
        style={{ width: grown ? `${percent(weight)}%` : '0%' }}
      />
    </div>
  );
}

/** Накопленный профиль интересов — то, что делает тест адаптивным, а не опросом. */
export function ProfileBar({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;

  // Шесть строк — потолок читаемости на телефоне; остальное честно пересчитываем
  // в «и ещё N», а не молча отрезаем.
  const sorted = [...signals].sort((a, b) => b.weight - a.weight);
  const shown = sorted.slice(0, 6);
  const hidden = sorted.length - shown.length;

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Что видно по ответам
      </p>

      <ul className="space-y-2.5">
        {shown.map((s) => (
          // evidence — цитата из собственного ответа: главное доказательство,
          // что профиль собран из слов человека, а не из шкалы опросника.
          <li key={s.trait} className="space-y-1.5" title={s.evidence}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-zinc-200">{label(s.trait)}</span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                {percent(s.weight)}%
              </span>
            </div>
            <Bar weight={s.weight} />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="text-xs text-zinc-600">и ещё {hidden} послабее</p>
      )}
    </div>
  );
}
