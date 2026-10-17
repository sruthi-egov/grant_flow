import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { MailerService } from './mailer.service';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
  ) {}

  /** SMTP reachability — surfaced on the Settings page. */
  @Get('status')
  status() {
    return this.mailer.status;
  }

  /**
   * Runs the daily notification pass immediately.
   * Replaces the Base44 `sendNotifications` function invoked by the UI.
   */
  @Post('run')
  @HttpCode(200)
  run(@Body() body: { dry_run?: boolean }) {
    return this.notifications.processNotifications({ dryRun: body?.dry_run === true });
  }

  /** Replaces the Base44 `sendTestNotification` function. */
  @Post('test')
  @HttpCode(200)
  test(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.notifications.sendTestNotification(body ?? {}, {
      email: user.email,
      name: user.display_name ?? user.full_name ?? '',
    });
  }

  /**
   * Ad-hoc single email, replacing `integrations.Core.SendEmail`.
   * Goes through the same mailer as scheduled notifications, so the recipient
   * domain allow-list and delivery logging apply here too.
   */
  @Post('send-email')
  @HttpCode(200)
  sendEmail(
    @Body() body: { to: string; subject: string; body: string; from_name?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.sendAdHocEmail(body ?? ({} as any), user.email);
  }

  /**
   * Sends one plain-text diagnostic message and returns the complete SMTP
   * evidence: messageId, accepted/rejected recipients, the final server
   * response and the envelope actually transmitted.
   *
   * Intended for investigating "the recipient says it never arrived". The body
   * carries no links and no sensitive data, so it isolates deliverability from
   * content filtering.
   */
  @Post('diagnostic')
  @HttpCode(200)
  diagnostic(
    @Body() body: { to: string; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.sendDiagnosticEmail(body?.to, user.email, body?.note);
  }

  /** Plain "does SMTP work" check for the Settings page. */
  @Post('test-simple')
  @HttpCode(200)
  testSimple(
    @Body() body: { recipients?: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.sendSimpleTestEmail(body?.recipients ?? [], user.email);
  }
}
