import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminInvitationsController, PublicInvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [NotificationsModule],
  controllers: [UsersController, AdminInvitationsController, PublicInvitationsController],
  providers: [UsersService, InvitationsService],
  exports: [UsersService, InvitationsService],
})
export class UsersModule {}
