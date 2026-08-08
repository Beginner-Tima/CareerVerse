import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    // Фронт лежит внутри репозитория бэкенда, и Next видит два package-lock.json.
    // Без этой строки он выбирает корнем папку бэкенда и трассирует чужие файлы.
    root: path.dirname(new URL(import.meta.url).pathname),
  },
};

export default nextConfig;
