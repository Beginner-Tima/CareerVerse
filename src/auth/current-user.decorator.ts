import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

/**
 * Достаёт пользователя из проверенного токена. Единственный источник userId
 * на защищённых роутах: из URL или тела его брать нельзя — это IDOR.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
