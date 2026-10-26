import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EntitiesModule } from './entities/entities.module';
import { FilesModule } from './files/files.module';
import { AiModule } from './ai/ai.module';
import { AssistantModule } from './assistant/assistant.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // `ignoreEnvFile` because main.ts already loaded .env with file-wins
    // precedence (see config/load-env.ts). Loading it twice here would be
    // harmless but confusing.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
      ignoreEnvFile: true,
    }),
    // Backs the daily notification cron.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

    PrismaModule,
    AuthModule,
    UsersModule,
    EntitiesModule,
    FilesModule,
    AiModule,
    AssistantModule,
    NotificationsModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
