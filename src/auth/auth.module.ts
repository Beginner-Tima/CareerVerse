import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { SupabaseStrategy } from './supabase.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PassportModule,
    PrismaModule,
    // Тем же секретом, которым SupabaseStrategy проверяет подпись: свои токены
    // и токены Supabase живут в одном контуре, guard об этом ничего не знает.
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.SUPABASE_JWT_SECRET;
        if (!secret) {
          throw new Error(
            'SUPABASE_JWT_SECRET не задан. Сгенерируйте: openssl rand -hex 32',
          );
        }
        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseStrategy,
    // Guard глобальный: закрыто по умолчанию, открыто — только через @Public().
    // Раньше @UseGuards не стоял ни на одном контроллере, и API был открыт весь.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [SupabaseStrategy, PassportModule],
})
export class AuthModule {}
