'use client';

import { useEffect, useState } from 'react';
import type { Signal } from '../lib/api';
import { useT } from '../lib/i18n';
import { TraitAvatar, topTraitOf } from './TraitAvatar';

// Словарь черт переехал в lib/i18n вместе с остальными подписями: он нужен на
// двух языках, а рядом с ним лежит объяснение, почему коды не переводятся в
// данных, а только на экране.

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
  // Хук до раннего возврата: правило хуков не разрешает вызывать его после
  // ветки, которая иногда не выполняется.
  const t = useT();

  if (signals.length === 0) return null;

  // Шесть строк — потолок читаемости на телефоне; остальное честно пересчитываем
  // в «и ещё N», а не молча отрезаем.
  const sorted = [...signals].sort((a, b) => b.weight - a.weight);
  const shown = sorted.slice(0, 6);
  const hidden = sorted.length - shown.length;
  const top = topTraitOf(signals);

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        {/* Ключ по черте, а не по индексу: сменилась сильнейшая — знак
            монтируется заново и проигрывает появление. Без ключа React
            переиспользовал бы узел, и подмена прошла бы незамеченной, хотя это
            ровно тот момент, ради которого аватар и сделан. */}
        <TraitAvatar
          key={top}
          trait={top}
          title={top ? t('profile.strongest', { trait: t.trait(top) }) : undefined}
          className="enter-up"
        />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            {t('profile.title')}
          </p>
          {top && (
            <p className="truncate text-sm text-zinc-300">
              {t('profile.top', { trait: t.trait(top) })}
            </p>
          )}
        </div>
      </div>

      <ul className="space-y-2.5">
        {shown.map((s) => (
          // evidence — цитата из собственного ответа: главное доказательство,
          // что профиль собран из слов человека, а не из шкалы опросника.
          <li key={s.trait} className="space-y-1.5" title={s.evidence}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-zinc-200">{t.trait(s.trait)}</span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                {percent(s.weight)}%
              </span>
            </div>
            <Bar weight={s.weight} />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="text-xs text-zinc-600">{t('profile.more', { n: hidden })}</p>
      )}
    </div>
  );
}
