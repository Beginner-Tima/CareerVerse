/**
 * Маркировка сгенерированного контента. Закон РК № 230-VIII «Об искусственном
 * интеллекте» действует с 18 января 2026 года и требует, чтобы человек видел,
 * что перед ним ответ модели, а не человека.
 */
export function AiBadge({ model }: { model?: string }) {
  return (
    <span
      title={model ? `Сгенерировано моделью ${model}` : undefined}
      className="inline-flex items-center gap-1.5 rounded-full border border-accent-300 bg-accent-100 px-2.5 py-0.5 text-[11px] font-medium text-accent-700"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      сгенерировано ИИ
    </span>
  );
}
