import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Prisma seed script.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const professions = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Backend Developer',
    description: 'Мастер серверной разработки, баз данных и API.',
    levels: [
      { id: '11111111-1111-1111-1111-000000000001', title: 'Основы HTTP и REST API', order: 1, rewardXp: 100, rewardCoins: 50, taskData: {} },
      { id: '11111111-1111-1111-1111-000000000002', title: 'Базы данных и SQL', order: 2, rewardXp: 200, rewardCoins: 100, taskData: {} },
      { id: '11111111-1111-1111-1111-000000000003', title: 'NestJS Framework', order: 3, rewardXp: 300, rewardCoins: 150, taskData: {} },
      { id: '11111111-1111-1111-1111-000000000004', title: 'Аутентификация и Авторизация', order: 4, rewardXp: 400, rewardCoins: 200, taskData: {} },
      { id: '11111111-1111-1111-1111-000000000005', title: 'Микросервисная архитектура', order: 5, rewardXp: 500, rewardCoins: 250, taskData: {} },
    ]
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Frontend Developer',
    description: 'Создатель красивых и удобных пользовательских интерфейсов.',
    levels: [
      { id: '22222222-2222-2222-2222-000000000001', title: 'Основы HTML & CSS', order: 1, rewardXp: 100, rewardCoins: 50, taskData: {} },
      { id: '22222222-2222-2222-2222-000000000002', title: 'JavaScript Basics', order: 2, rewardXp: 200, rewardCoins: 100, taskData: {} },
      { id: '22222222-2222-2222-2222-000000000003', title: 'Работа с React', order: 3, rewardXp: 300, rewardCoins: 150, taskData: {} },
      { id: '22222222-2222-2222-2222-000000000004', title: 'Стейт-менеджмент (Redux)', order: 4, rewardXp: 400, rewardCoins: 200, taskData: {} },
      { id: '22222222-2222-2222-2222-000000000005', title: 'Web Performance & PWA', order: 5, rewardXp: 500, rewardCoins: 250, taskData: {} },
    ]
  }
];

async function main() {
  console.log('🌱 Начало сидирования базы данных...');

  for (const prof of professions) {
    // 1. Upsert профессии (создаем, если нет; обновляем, если есть)
    const createdProf = await prisma.profession.upsert({
      where: { id: prof.id },
      update: {
        title: prof.title,
        description: prof.description,
      },
      create: {
        id: prof.id,
        title: prof.title,
        description: prof.description,
      },
    });
    console.log(`✅ Профессия "${createdProf.title}" обработана.`);

    // 2. Upsert каждого уровня
    for (const lvl of prof.levels) {
      await prisma.level.upsert({
        where: { id: lvl.id },
        update: {
          title: lvl.title,
          order: lvl.order,
          rewardXp: lvl.rewardXp,
          rewardCoins: lvl.rewardCoins,
          taskData: lvl.taskData,
        },
        create: {
          id: lvl.id,
          professionId: createdProf.id,
          title: lvl.title,
          order: lvl.order,
          rewardXp: lvl.rewardXp,
          rewardCoins: lvl.rewardCoins,
          taskData: lvl.taskData,
        },
      });
    }
    console.log(`  -> Добавлено/обновлено 5 уровней для "${createdProf.title}"`);
  }

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
