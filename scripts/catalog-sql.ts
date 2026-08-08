/**
 * Печатает SQL для заливки широкого каталога профессий на прод.
 *
 * Зачем это нужно вместо `npm run seed`: сид ходит по DATABASE_URL, а на проде
 * переменные Vercel помечены sensitive — `vercel env pull` отдаёт пустую
 * строку даже владельцу проекта. Тот же тупик, что и с `prisma migrate deploy`,
 * и тот же обход — Management API Supabase, которому пароль не нужен.
 *
 * Генерируем, а не храним SQL руками: описания считаются из prisma/catalog.ts,
 * поэтому база и код не могут разъехаться.
 *
 *   npm run catalog:sql > prisma/catalog-expansion.sql
 *   supabase db query --linked -f prisma/catalog-expansion.sql
 */
import { WIDE_CATALOG } from '../prisma/catalog';

/** Одинарная кавычка внутри строки удваивается — единственное, что нужно экранировать. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const professionRows = WIDE_CATALOG.map(
  (p, i) =>
    `  (${q(p.id)}, ${q(p.title)}, ${q(p.titleKk)},\n   ${q(p.description)}, ${100 + i})`,
).join(',\n\n');

process.stdout.write(`-- Широкий каталог профессий: ${WIDE_CATALOG.length} записей.
-- ФАЙЛ СГЕНЕРИРОВАН — правьте prisma/catalog.ts и перезапускайте:
--   npm run catalog:sql > prisma/catalog-expansion.sql
--
-- Применение на проде:
--   supabase link --project-ref ypgsswfqrpipawauxsbd
--   supabase db query --linked -f prisma/catalog-expansion.sql
--   supabase db query --linked 'select count(*) from "Profession"'
--
-- Идемпотентно: повторный запуск обновит данные, а не создаст дубли.
--
-- Данных рынка труда здесь нет: поимённой статистики по этим профессиям в
-- открытом виде не существует, а областные медианы выдавать за профессиональные
-- мы отказались. Почему именно — в шапке prisma/catalog.ts.

insert into "Profession" (id, title, "titleKk", description, "order") values
${professionRows}
on conflict (id) do update set
  title       = excluded.title,
  "titleKk"   = excluded."titleKk",
  description = excluded.description,
  "order"     = excluded."order";
`);
