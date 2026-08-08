import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Открывает роут без токена. Guard включён глобально, поэтому по умолчанию
 * закрыто всё — публичность приходится объявлять явно и она видна в коде.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
