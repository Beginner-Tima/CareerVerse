import { WIDE_CATALOG } from './catalog';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Prisma seed script.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ID статические (для идемпотентного upsert) и при этом соответствуют RFC 4122 v4:
// 13-й символ = '4' (версия), 17-й = '8' (вариант). Иначе @IsUUID() в
// CompleteLevelDto отвергает их и POST /api/progress/complete падает с 400.
//
// Требование к формату id касается только уровней: их идентификаторы уходят в
// CompleteLevelDto. У профессий из широкого каталога id короткие и читаемые —
// см. prisma/catalog.ts, там объяснено, почему это важно для модели.
//
// Уровни — шаблоны тем, а не готовые задания: сами задания генерируются под
// конкретного подростка и живут в TaskInstance. У широкого каталога их нет:
// адаптивный тест уровни не использует.
//
// Данные рынка труда — локальная выгрузка, а не живой запрос к enbek.kz:
// дёргать чужой API со сцены — верный способ показать жюри экран ошибки.
// Источник и дата подписаны у каждой записи, чтобы на вопрос «откуда цифра»
// был ответ.
const MARKET_SOURCE = 'enbek.kz + Бюро нацстатистики РК, выгрузка от 2026-08-08';
const COLLECTED_AT = new Date('2026-08-08T00:00:00.000Z');

interface SeedProfession {
  id: string;
  title: string;
  titleKk: string;
  description: string;
  order: number;
  /**
   * Необязательно — и это принципиально. Цифры рынка проставлены только там,
   * где они действительно выгружены; выдумывать медианную зарплату под
   * подписью «enbek.kz» нельзя, а сузить каталог до шести профессий ради
   * красивой карточки — значит отвечать подростку из шести вариантов, как бы
   * глубоко он ни раскрылся. Экран результата умеет и без блока рынка.
   */
  market?: {
    medianSalaryKzt?: number;
    vacancyCount?: number;
    demandTrend?: string;
    regions?: string[];
    /** У широкого каталога подпись своя — медиана области, а не профессии. */
    source?: string;
    collectedAt?: Date;
  };
  /** Старая механика уровней. Адаптивный тест их не использует. */
  levels?: { id: string; title: string; topic: string; order: number; rewardXp: number; rewardCoins: number }[];
}

/** Шесть профессий с настоящей выгрузкой рынка труда и старыми уровнями. */
const curated: SeedProfession[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Backend-разработчик',
    titleKk: 'Backend-әзірлеуші',
    description:
      'Строит серверную часть приложений: базы данных, API, обработку платежей. Работа про системность и умение довести логику до конца.',
    order: 1,
    market: {
      medianSalaryKzt: 750000,
      vacancyCount: 1240,
      demandTrend: 'растёт',
      regions: ['Алматы', 'Астана', 'Караганда'],
    },
    levels: [
      { id: '11111111-1111-4111-8111-000000000001', title: 'Данные и связи между ними', topic: 'моделирование данных', order: 1, rewardXp: 100, rewardCoins: 50 },
      { id: '11111111-1111-4111-8111-000000000002', title: 'Что делать, когда всё сломалось', topic: 'отказоустойчивость', order: 2, rewardXp: 200, rewardCoins: 100 },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Product-дизайнер',
    titleKk: 'Product-дизайнер',
    description:
      'Придумывает, как человек пользуется продуктом: экраны, сценарии, тексты кнопок. Работа про эмпатию и внимание к чужому раздражению.',
    order: 2,
    market: {
      medianSalaryKzt: 600000,
      vacancyCount: 430,
      demandTrend: 'растёт',
      regions: ['Алматы', 'Астана'],
    },
    levels: [
      { id: '22222222-2222-4222-8222-000000000001', title: 'Где человек застревает', topic: 'исследование пользователя', order: 1, rewardXp: 100, rewardCoins: 50 },
      { id: '22222222-2222-4222-8222-000000000002', title: 'Один экран, три решения', topic: 'проектирование интерфейса', order: 2, rewardXp: 200, rewardCoins: 100 },
    ],
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Врач-диагност',
    titleKk: 'Дәрігер-диагност',
    description:
      'Собирает картину болезни из жалоб, анализов и снимков. Работа про наблюдательность и готовность принимать решение при неполных данных.',
    order: 3,
    market: {
      medianSalaryKzt: 420000,
      vacancyCount: 3100,
      demandTrend: 'стабильно высокий, дефицит в регионах',
      regions: ['Шымкент', 'Актобе', 'Кызылорда', 'Алматы'],
    },
    levels: [
      { id: '33333333-3333-4333-8333-000000000001', title: 'Что скрывает жалоба', topic: 'сбор анамнеза', order: 1, rewardXp: 100, rewardCoins: 50 },
      { id: '33333333-3333-4333-8333-000000000002', title: 'Два диагноза, одни симптомы', topic: 'дифференциальная диагностика', order: 2, rewardXp: 200, rewardCoins: 100 },
    ],
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    title: 'Агроинженер',
    titleKk: 'Агроинженер',
    description:
      'Отвечает за технику и технологии на поле: полив, урожайность, ремонт. Работа про руки, расчёт и ответственность за сезон.',
    order: 4,
    market: {
      medianSalaryKzt: 380000,
      vacancyCount: 890,
      demandTrend: 'растёт вместе с господдержкой АПК',
      regions: ['Северо-Казахстанская обл.', 'Костанайская обл.', 'Акмолинская обл.'],
    },
    levels: [
      { id: '44444444-4444-4444-8444-000000000001', title: 'Вода, которой не хватает', topic: 'ресурсы и планирование', order: 1, rewardXp: 100, rewardCoins: 50 },
      { id: '44444444-4444-4444-8444-000000000002', title: 'Поломка в разгар уборки', topic: 'решения под давлением', order: 2, rewardXp: 200, rewardCoins: 100 },
    ],
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    title: 'Учитель-предметник',
    titleKk: 'Пән мұғалімі',
    description:
      'Объясняет так, чтобы поняли все тридцать, и держит класс. Работа про терпение, речь и умение переупаковать сложное в простое.',
    order: 5,
    market: {
      medianSalaryKzt: 310000,
      vacancyCount: 5600,
      demandTrend: 'постоянный дефицит, особенно физика и математика',
      regions: ['по всей стране', 'острее в сельских районах'],
    },
    levels: [
      { id: '55555555-5555-4555-8555-000000000001', title: 'Объясни за две минуты', topic: 'объяснение сложного', order: 1, rewardXp: 100, rewardCoins: 50 },
      { id: '55555555-5555-4555-8555-000000000002', title: 'В классе перестали слушать', topic: 'работа с группой', order: 2, rewardXp: 200, rewardCoins: 100 },
    ],
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    title: 'Логист',
    titleKk: 'Логист',
    description:
      'Ведёт груз от склада до клиента через границы, тарифы и срывы сроков. Работа про переговоры, счёт и холодную голову.',
    order: 6,
    market: {
      medianSalaryKzt: 450000,
      vacancyCount: 1780,
      demandTrend: 'растёт на транзите Китай — Европа',
      regions: ['Алматы', 'Хоргос', 'Актау', 'Астана'],
    },
    levels: [
      { id: '66666666-6666-4666-8666-000000000001', title: 'Груз застрял на границе', topic: 'решение в цепочке поставок', order: 1, rewardXp: 100, rewardCoins: 50 },
      { id: '66666666-6666-4666-8666-000000000002', title: 'Дешевле или быстрее', topic: 'выбор компромисса', order: 2, rewardXp: 200, rewardCoins: 100 },
    ],
  },

];

/**
 * Полный справочник = шесть проработанных профессий плюс широкий каталог.
 * Порядок с сотни, чтобы проработанные шли первыми в списке на сайте.
 */
const professions: SeedProfession[] = [
  ...curated,
  ...WIDE_CATALOG.map((entry, i) => ({ ...entry, order: 100 + i })),
];

async function main() {
  console.log('🌱 Начало сидирования базы данных...');

  for (const prof of professions) {
    const createdProf = await prisma.profession.upsert({
      where: { id: prof.id },
      update: {
        title: prof.title,
        titleKk: prof.titleKk,
        description: prof.description,
        order: prof.order,
      },
      create: {
        id: prof.id,
        title: prof.title,
        titleKk: prof.titleKk,
        description: prof.description,
        order: prof.order,
      },
    });

    if (prof.market) {
      await prisma.laborMarketData.upsert({
        where: { professionId: createdProf.id },
        update: {
          ...prof.market,
          source: prof.market.source ?? MARKET_SOURCE,
          collectedAt: prof.market.collectedAt ?? COLLECTED_AT,
        },
        create: {
          professionId: createdProf.id,
          ...prof.market,
          source: prof.market.source ?? MARKET_SOURCE,
          collectedAt: prof.market.collectedAt ?? COLLECTED_AT,
        },
      });
    }

    for (const lvl of prof.levels ?? []) {
      await prisma.level.upsert({
        where: { id: lvl.id },
        update: {
          title: lvl.title,
          topic: lvl.topic,
          order: lvl.order,
          rewardXp: lvl.rewardXp,
          rewardCoins: lvl.rewardCoins,
          taskData: {},
        },
        create: {
          id: lvl.id,
          professionId: createdProf.id,
          title: lvl.title,
          topic: lvl.topic,
          order: lvl.order,
          rewardXp: lvl.rewardXp,
          rewardCoins: lvl.rewardCoins,
          taskData: {},
        },
      });
    }

    console.log(
      `✅ "${createdProf.title}" — уровней: ${prof.levels?.length ?? 0}, ` +
        `рынок труда: ${prof.market ? 'есть' : 'нет'}`,
    );
  }

  // Каталог менялся: уровни прошлой версии сида остались бы висеть под новыми
  // профессиями. Сид — источник истины для справочника, поэтому лишнее убираем.
  const seededLevelIds = professions.flatMap((p) => (p.levels ?? []).map((l) => l.id));
  const stale = await prisma.level.findMany({
    where: { id: { notIn: seededLevelIds } },
    select: { id: true, title: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((l) => l.id);
    await prisma.userProgress.deleteMany({ where: { levelId: { in: ids } } });
    await prisma.taskInstance.updateMany({
      where: { levelId: { in: ids } },
      data: { levelId: null },
    });
    await prisma.level.deleteMany({ where: { id: { in: ids } } });
    console.log(`🧹 Удалено уровней от прошлой версии каталога: ${stale.length}`);
  }

  // Демо-пользователь для проверки прогресса и статистики.
  await prisma.user.upsert({
    where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' },
    update: {},
    create: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      email: 'demo@careerverse.local',
    },
  });

  console.log('🎉 Сидирование успешно завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при сидировании:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
