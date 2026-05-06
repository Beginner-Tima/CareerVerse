import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('supabase') {
  canActivate(context: ExecutionContext) {
    // Здесь можно добавить кастомную логику до проверки токена (например, публичные роуты)
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    // Вызывается после проверки токена
    if (err || !user) {
      throw err || new UnauthorizedException('Невалидный токен или пользователь не авторизован');
    }
    return user;
  }
}
