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
 *   npm run --silent catalog:sql > prisma/catalog-expansion.sql
 *   supabase db query --linked -f prisma/catalog-expansion.sql
 *
 * `--silent` обязателен. Без него npm печатает в stdout свою шапку («> backend
 * catalog:sql»), она попадает в начало файла, и psql падает на первой же
 * строке синтаксической ошибкой — а следом валится и вставка рынка труда, у
 * которой не оказывается профессий во внешнем ключе.
 */
import { WIDE_CATALOG } from '../prisma/catalog';

/** Одинарная кавычка внутри строки удваивается — единственное, что нужно экранировать. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const professionRows = WIDE_CATALOG.map(
  (p, i) =>
    `  (${q(p.id)}, ${q(p.title)}, ${q(p.titleKk)},\n   ${q(p.description)}, ${100 + i})`,
).join(',\n\n');

const withMarket = WIDE_CATALOG.filter((p) => p.market);

/**
 * id строки рынка труда выводится из id профессии, а не генерируется: колонка
 * без DEFAULT, а повторный прогон обязан обновлять ту же строку. Если строка уже
 * заведена сидом со своим uuid, конфликт поймает уникальный professionId и
 * обновит её, оставив прежний id.
 */
const marketRows = withMarket
  .map(({ id, market: m }) =>
    [
      `  (${q(`market-${id}`)}, ${q(id)}, ${m!.medianSalaryKzt},`,
      `   ${q(JSON.stringify(m!.regions))}::jsonb,`,
      `   ${q(m!.source)}, ${q(m!.collectedAt.toISOString())})`,
    ].join('\n'),
  )
  .join(',\n\n');

process.stdout.write(`-- Широкий каталог профессий: ${WIDE_CATALOG.length} записей.
-- ФАЙЛ СГЕНЕРИРОВАН — правьте prisma/catalog.ts и перезапускайте:
--   npm run --silent catalog:sql > prisma/catalog-expansion.sql
-- Без --silent шапка npm попадёт в начало файла и psql упадёт на первой строке.
--
-- Применение на проде:
--   supabase link --project-ref ypgsswfqrpipawauxsbd
--   supabase db query --linked -f prisma/catalog-expansion.sql
--   supabase db query --linked 'select count(*) from "Profession"'
--
-- Идемпотентно: повторный запуск обновит данные, а не создаст дубли.
--
-- Рынок труда есть у ${withMarket.length} профессий из ${WIDE_CATALOG.length} — у тех, по которым цифру
-- удалось собрать поимённо с hh.kz. Заливаются только медиана и порядок
-- регионов: число вакансий на hh раздувает нечёткий поиск, и в базе его нет.
-- Остальные профессии остаются без строки в LaborMarketData, и экран результата
-- честно показывает, что данных нет. Метод сбора — в шапке prisma/catalog.ts.

insert into "Profession" (id, title, "titleKk", description, "order") values
${professionRows}
on conflict (id) do update set
  title       = excluded.title,
  "titleKk"   = excluded."titleKk",
  description = excluded.description,
  "order"     = excluded."order";

insert into "LaborMarketData"
  (id, "professionId", "medianSalaryKzt", regions, source, "collectedAt") values
${marketRows}
on conflict ("professionId") do update set
  "medianSalaryKzt" = excluded."medianSalaryKzt",
  regions           = excluded.regions,
  source            = excluded.source,
  "collectedAt"     = excluded."collectedAt",
  -- Гасим явно: прошлый прогон заливал сюда число вакансий, и без этих двух
  -- строк оно осталось бы висеть в базе после обновления остальных полей.
  "vacancyCount"    = null,
  "demandTrend"     = null;
`);
