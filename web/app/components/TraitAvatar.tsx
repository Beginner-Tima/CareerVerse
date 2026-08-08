/**
 * Аватар, который подросток не выбирает, а зарабатывает ответами.
 *
 * Берётся сильнейшая черта накопленного профиля — та же, что стоит первой
 * строкой в ProfileBar, — и превращается в знак с своим цветом. Пока идёт тест,
 * профиль пересобирается после каждого ответа, и аватар меняется вместе с ним:
 * это самая наглядная демонстрация того, что тест адаптивный, а не опрос с
 * заранее известным концом.
 *
 * Почему не загрузка картинки. Её пришлось бы где-то хранить и кем-то
 * модерировать — продукт для подростков, чужие изображения в нём это отдельная
 * ответственность. А главное, выбранная картинка ничего не говорит о человеке,
 * тогда как эта собрана из его же слов.
 *
 * Словарь черт у модели открытый, как и в ProfileBar: незнакомый код получит
 * первую букву и цвет из хеша, а не заглушку. Аватар будет странным, но
 * устойчивым — один и тот же код всегда даст один и тот же вид.
 */
import type { Signal } from '../lib/api';

interface Face {
  glyph: string;
  /** Классы целиком, а не собранные из кусков: Tailwind ищет их в исходнике. */
  tone: string;
}

const FACES: Record<string, Face> = {
  'systems-thinking': { glyph: '🧩', tone: 'bg-sky-500/15 text-sky-300 ring-sky-400/30' },
  'care-for-people': { glyph: '🤲', tone: 'bg-rose-500/15 text-rose-300 ring-rose-400/30' },
  'hands-on': { glyph: '🔧', tone: 'bg-amber-500/15 text-amber-300 ring-amber-400/30' },
  'attention-to-detail': { glyph: '🔍', tone: 'bg-teal-500/15 text-teal-300 ring-teal-400/30' },
  'creative-expression': {
    glyph: '🎨',
    tone: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30',
  },
  'problem-solving': {
    glyph: '🧠',
    tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  },
  communication: { glyph: '💬', tone: 'bg-sky-500/15 text-sky-300 ring-sky-400/30' },
  leadership: { glyph: '🚩', tone: 'bg-orange-500/15 text-orange-300 ring-orange-400/30' },
  independence: { glyph: '🧭', tone: 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/30' },
  teamwork: { glyph: '🤝', tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' },
  analytical: { glyph: '📊', tone: 'bg-violet-500/15 text-violet-300 ring-violet-400/30' },
  curiosity: { glyph: '🔭', tone: 'bg-cyan-500/15 text-cyan-300 ring-cyan-400/30' },
  persistence: { glyph: '🪨', tone: 'bg-stone-500/20 text-stone-300 ring-stone-400/30' },
  'helping-others': { glyph: '💚', tone: 'bg-rose-500/15 text-rose-300 ring-rose-400/30' },
  organizing: { glyph: '🗂', tone: 'bg-lime-500/15 text-lime-300 ring-lime-400/30' },
  'risk-taking': { glyph: '🎲', tone: 'bg-red-500/15 text-red-300 ring-red-400/30' },
};

/** Запасные цвета для черт, которых нет в словаре выше. */
const SPARE_TONES = [
  'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  'bg-violet-500/15 text-violet-300 ring-violet-400/30',
  'bg-teal-500/15 text-teal-300 ring-teal-400/30',
  'bg-rose-500/15 text-rose-300 ring-rose-400/30',
];

const NEUTRAL = 'bg-white/[0.06] text-zinc-400 ring-white/10';

/** Не криптография, а способ дать незнакомой черте стабильный цвет. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function faceOf(trait: string): Face {
  const known = FACES[trait];
  if (known) return known;
  return {
    glyph: (trait[0] ?? '?').toUpperCase(),
    tone: SPARE_TONES[hash(trait) % SPARE_TONES.length],
  };
}

/**
 * Сильнейшая черта профиля. Вынесена наружу, потому что нужна не только
 * аватару: по ней же шапка вспоминает, чем закончился прошлый тест.
 */
export function topTraitOf(signals: Signal[]): string | null {
  if (signals.length === 0) return null;
  return [...signals].sort((a, b) => b.weight - a.weight)[0].trait;
}

const SIZES = {
  sm: 'size-7 text-sm',
  md: 'size-10 text-lg',
  lg: 'size-14 text-2xl',
} as const;

/**
 * `trait` пустой — показываем нейтральный знак вместо пустоты: до первого
 * ответа профиля ещё нет, и дырка на его месте выглядела бы поломкой.
 *
 * `key` по черте ставит вызывающий, если хочет проигрывать появление заново при
 * смене — сам компонент за анимацию не отвечает.
 */
export function TraitAvatar({
  trait,
  size = 'md',
  title,
  className = '',
}: {
  trait: string | null;
  size?: keyof typeof SIZES;
  title?: string;
  className?: string;
}) {
  const face = trait ? faceOf(trait) : { glyph: '·', tone: NEUTRAL };

  return (
    <span
      title={title}
      aria-hidden={!title}
      className={`grid shrink-0 place-items-center rounded-2xl ring-1 ${SIZES[size]} ${face.tone} ${className}`}
    >
      {face.glyph}
    </span>
  );
}
