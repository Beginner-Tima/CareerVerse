// Тонкая обёртка: Vercel собирает файлы из api/ через esbuild, а он не умеет
// emitDecoratorMetadata — без неё внедрение зависимостей в NestJS разваливается.
// Поэтому TypeScript компилируется обычным `nest build` (tsc), а сюда попадает
// уже готовый JavaScript из dist/.
module.exports = require('../dist/vercel').default;
