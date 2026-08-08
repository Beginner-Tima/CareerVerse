/**
 * Маркировка сгенерированного контента. Закон РК № 230-VIII «Об искусственном
 * интеллекте» действует с 18 января 2026 года и требует, чтобы человек видел,
 * что перед ним ответ модели, а не человека.
 */
export function AiBadge({ model }: { model?: string }) {
  return (
    <span
      title={model ? `Сгенерировано моделью ${model}` : undefined}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-amber-400" />
      сгенерировано ИИ
    </span>
  );
}
