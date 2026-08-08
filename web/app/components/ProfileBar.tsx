import type { Signal } from '../lib/api';

/** Накопленный профиль интересов — то, что делает тест адаптивным, а не опросом. */
export function ProfileBar({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {signals.slice(0, 6).map((s) => (
        <span
          key={s.trait}
          title={s.evidence}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300"
        >
          {s.trait}
          <span className="ml-1.5 text-zinc-500">{Math.round(s.weight * 100)}%</span>
        </span>
      ))}
    </div>
  );
}
