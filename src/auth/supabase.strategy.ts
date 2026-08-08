import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from './current-user.decorator';

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
}

// Раньше здесь стоял дефолт — строка 'SUPABASE_JWT_SECRET'. С ним сервер
// поднимался с публично известным секретом, то есть подписать токен мог кто угодно.
function requireJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      'SUPABASE_JWT_SECRET не задан. Сгенерируйте: openssl rand -hex 32',
    );
  }
  return secret;
}

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor() {
    super({
      // Извлекаем токен из заголовка Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // В Supabase JWT секрет: Project Settings -> API -> JWT Secret
      secretOrKey: requireJwtSecret(),
    });
  }

  // Вызывается после успешной проверки подписи токена.
  // В payload от Supabase поле sub содержит user_id.
  validate(payload: SupabaseJwtPayload): AuthUser {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
