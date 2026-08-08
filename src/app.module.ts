import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProfessionsModule } from './professions/professions.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    PrismaModule,
    ProfessionsModule,
    ProgressModule,
    UsersModule,
    AuthModule,
    AiModule,
    SessionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
