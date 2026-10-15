import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AiModule, NotificationsModule],
  controllers: [HealthController],
})
export class HealthModule {}
