/**
 * «Кем ты сейчас думаешь стать» — ответ, названный до первого вопроса.
 *
 * Живёт только в браузере и намеренно не уходит на сервер. Попади он в диалог —
 * приехал бы в промпт подбора вместе с остальными ответами, и модель почти
 * наверняка подтвердила бы названную профессию: сравнивать стало бы нечего.
 * Причём тихо — расхождение исчезло бы, а мы бы решили, что тест «сошёлся».
 * Поэтому ожидание хранится отдельно от прохождения и сравнивается уже здесь,
 * на клиенте, с готовым результатом.
 *
 * Цена решения: по ссылке, открытой на другом устройстве, блок не покажется.
 * Это осознанный размен — ожидание не стоит того, чтобы заводить под него
 * колонку в базе и трогать матчинг.
 */

const key = (sessionId: string) => `careerverse:expectation:${sessionId}`;

export function rememberExpectation(sessionId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(key(sessionId), trimmed);
  } catch {
    // Приватный режим и заблокированное хранилище — не повод ронять тест.
  }
}

export function recallExpectation(sessionId: string): string | null {
  try {
    return localStorage.getItem(key(sessionId));
  } catch {
    return null;
  }
}

export type ExpectationVerdict =
  /** Профессии не было — «не знаю» и есть самый частый честный ответ. */
  | { kind: 'unsure'; top: string }
  /** Тест пришёл ровно туда же, куда человек шёл сам. */
  | { kind: 'confirmed' }
  /** Названное есть в тройке, но не первым. */
  | { kind: 'shifted'; position: number; top: string }
  /** Не совпало ни с чем из подобранного. */
  | { kind: 'diverged'; top: string };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я\s]/g, ' ');

/** Слова от четырёх букв: предлоги и «я» совпадением быть не должны. */
const words = (s: string) =>
  normalize(s)
    .split(/\s+/)
    .filter((w) => w.length >= 4);

/**
 * Сравнение идёт по словам, а не по строке целиком: названия в каталоге
 * составные («Врач-диагност», «Product-дизайнер»), а человек пишет фразой
 * («хочу быть врачом»). Целиком такие строки не пересекаются никогда, по словам
 * — совпадают там, где надо. Вхождение проверяем в обе стороны: так «врачом»
 * ловит «врач», не разбирая морфологию.
 *
 * Строгость здесь не нужна и была бы вредна: цена ошибки — показать
 * «разошлось» вместо «совпало», а не сломанный результат. Латиницу с кириллицей
 * не сводим: «бэкенд» и «Backend» останутся разными, и это осознанно — гадать
 * про транслитерацию дороже, чем изредка сказать «разошлось».
 */
function looksLikeSame(expectation: string, title: string): boolean {
  const a = words(expectation);
  const b = words(title);
  return a.some((x) => b.some((y) => x.includes(y) || y.includes(x)));
}

/** «Не знаю» — не пустой ответ, а состояние, ради которого тест и существует. */
const UNSURE = /^(не\s*знаю|хз|незнаю|пока\s*не|никем|не\s*реш|не\s*опред|не\s*поним)/;

export function compareExpectation(
  expectation: string,
  titles: string[],
): ExpectationVerdict | null {
  const top = titles[0];
  if (!top) return null;

  const cleaned = normalize(expectation).trim();
  // «хз» короче порога ниже, поэтому проверяем неуверенность первой.
  if (UNSURE.test(cleaned)) return { kind: 'unsure', top };
  // Одна-две буквы или пусто — сравнивать не с чем, блок лучше не показывать.
  if (cleaned.replace(/\s/g, '').length < 3) return null;

  const hit = titles.findIndex((t) => looksLikeSame(expectation, t));
  if (hit === 0) return { kind: 'confirmed' };
  if (hit > 0) return { kind: 'shifted', position: hit + 1, top };
  return { kind: 'diverged', top };
}
