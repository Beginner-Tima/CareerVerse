import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { SupabaseStrategy } from './supabase.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [PassportModule],
  providers: [
    SupabaseStrategy,
    // Guard глобальный: закрыто по умолчанию, открыто — только через @Public().
    // Раньше @UseGuards не стоял ни на одном контроллере, и API был открыт весь.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [SupabaseStrategy, PassportModule],
})
export class AuthModule {}
