import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor() {
    super({
      // Извлекаем токен из заголовка Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // В Supabase JWT секрет можно найти в настройках проекта: Project Settings -> API -> JWT Secret
      secretOrKey: process.env.SUPABASE_JWT_SECRET || 'SUPABASE_JWT_SECRET',
    });
  }

  // Этот метод вызывается автоматически после успешной проверки подписи токена
  async validate(payload: any) {
    // В payload токена от Supabase поле sub содержит user_id
    // Возвращенный объект будет доступен в контроллерах через req.user
    return { 
      id: payload.sub, 
      email: payload.email, 
      role: payload.role 
    };
  }
}
