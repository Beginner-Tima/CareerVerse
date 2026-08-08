/**
 * Аватар, который подросток не выбирает, а зарабатывает ответами.
 *
 * Берётся сильнейшая черта накопленного профиля — та же, что стоит первой
 * строкой в ProfileBar, — и превращается в знак. Пока идёт тест, профиль
 * пересобирается после каждого ответа, и аватар меняется вместе с ним: это
 * самая наглядная демонстрация того, что тест адаптивный, а не опрос с заранее
 * известным концом.
 *
 * Почему не загрузка картинки. Её пришлось бы где-то хранить и кем-то
 * модерировать — продукт для подростков, чужие изображения в нём это отдельная
 * ответственность. А главное, выбранная картинка ничего не говорит о человеке,
 * тогда как эта собрана из его же слов.
 *
 * Различает черты знак, а не цвет: подложка у всех одна, акцентная. Это правило
 * дизайн-гайда — один акцент на продукт, — и оно же страховка от дальтонизма,
 * потому что шестнадцать оттенков в ряд различимы не для всех. Сами эмодзи
 * цветные, разнообразия хватает и без палитры.
 *
 * Словарь черт у модели открытый, как и в ProfileBar: незнакомый код получит
 * первую букву вместо знака. Странно, но устойчиво — один и тот же код всегда
 * даст один и тот же вид.
 */
import type { Signal } from '../lib/api';

const GLYPHS: Record<string, string> = {
  'systems-thinking': '🧩',
  'care-for-people': '🤲',
  'hands-on': '🔧',
  'attention-to-detail': '🔍',
  'creative-expression': '🎨',
  'problem-solving': '🧠',
  communication: '💬',
  leadership: '🚩',
  independence: '🧭',
  teamwork: '🤝',
  analytical: '📊',
  curiosity: '🔭',
  persistence: '🪨',
  'helping-others': '💚',
  organizing: '🗂',
  'risk-taking': '🎲',
};

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
  const glyph = trait ? (GLYPHS[trait] ?? trait[0]?.toUpperCase() ?? '?') : '·';
  const tone = trait
    ? 'bg-accent-100 text-accent-800 ring-accent-300'
    : 'bg-surface text-neutral-500 ring-neutral-300';

  return (
    <span
      title={title}
      aria-hidden={!title}
      className={`grid shrink-0 place-items-center rounded-md ring-1 ${SIZES[size]} ${tone} ${className}`}
    >
      {glyph}
    </span>
  );
}
