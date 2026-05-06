import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseStrategy } from './supabase.strategy';

@Module({
  imports: [PassportModule],
  providers: [SupabaseStrategy],
  exports: [SupabaseStrategy, PassportModule],
})
export class AuthModule {}
