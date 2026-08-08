import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Расшифровки прохождений: что человек отвечал и что из этого извлекла модель.
 *
 * В логи ответы не пишутся намеренно — это свободный текст подростка, ему не
 * место в потоке эксплуатационных сообщений. Всё лежит в базе, и смотреть надо
 * отсюда.
 *
 *   npm run transcripts              — последние 5 прохождений
 *   npm run transcripts -- 20        — последние 20
 *   npm run transcripts -- <uuid>    — одно конкретное, целиком
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL не задан');

const ca = process.env.SUPABASE_CA_CERT;
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ssl: ca
      ? { ca, rejectUnauthorized: true }
      : /supabase\.(com|co)/.test(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
  }),
});

const arg = process.argv[2];
const isUuid = arg && /^[0-9a-f-]{36}$/i.test(arg);
const limit = !arg || isUuid ? 5 : Number(arg);

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function wrap(text: string, indent = 4, width = 92): string {
  const pad = ' '.repeat(indent);
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + word).length > width) {
      out.push(pad + line.trim());
      line = '';
    }
    line += word + ' ';
  }
  if (line.trim()) out.push(pad + line.trim());
  return out.join('\n');
}

async function main() {
  const sessions = await prisma.session.findMany({
    where: isUuid ? { id: arg } : undefined,
    orderBy: { startedAt: 'desc' },
    take: isUuid ? 1 : limit,
    include: {
      interestProfile: true,
      parentLetter: true,
      tasks: {
        orderBy: { order: 'asc' },
        include: { answer: { include: { assessment: true } }, profession: true },
      },
    },
  });

  if (sessions.length === 0) {
    console.log('Прохождений не найдено.');
    return;
  }

  for (const s of sessions) {
    const answered = s.tasks.filter((t) => t.answer);
    const chars = answered.reduce((n, t) => n + t.answer!.text.length, 0);

    console.log('\n' + '─'.repeat(96));
    console.log(
      bold(s.id) +
        dim(`  ${s.startedAt.toLocaleString('ru-RU')}  ${s.status}  ${s.locale}  ` +
          `${answered.length} ответов, ${chars} символов`),
    );

    for (const t of s.tasks) {
      const label = t.kind === 'PROFESSION_TRIAL' ? green(`ПРОБА · ${t.profession?.title ?? ''}`) : dim('вопрос');
      console.log(`\n  ${label}`);
      console.log(wrap(t.prompt));
      if (!t.answer) {
        console.log(dim('    (остался без ответа)'));
        continue;
      }
      console.log(bold('\n    ответ:'));
      console.log(wrap(t.answer.text));
      if (t.answer.assessment) {
        console.log(dim('\n    что извлекла модель:'));
        console.log(dim(wrap(t.answer.assessment.summary)));
      }
    }

    const traits = (s.interestProfile?.traits ?? []) as { trait: string; weight: number }[];
    if (traits.length > 0) {
      console.log(
        '\n  ' + dim('профиль: ') +
          traits.map((t) => `${t.trait} ${Math.round(t.weight * 100)}%`).join(', '),
      );
    }
    if (s.parentLetter) {
      console.log(dim(`  письмо родителям: ${s.parentLetter.content.length} символов, ` +
        `${s.parentLetter.createdAt.toLocaleString('ru-RU')}`));
    }
  }
  console.log();
}

main()
  .catch((e) => {
    console.error('Ошибка:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
