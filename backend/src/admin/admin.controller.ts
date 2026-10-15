import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Replaces the Base44 `performDatabaseReset` function. */
  @Post('performDatabaseReset')
  @HttpCode(200)
  reset(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.admin.resetDatabase(body ?? {}, user);
  }

  /** Replaces the Base44 `performFileCleanup` function. */
  @Post('performFileCleanup')
  @HttpCode(200)
  cleanup(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.admin.cleanupFiles(body ?? {}, user);
  }
}
