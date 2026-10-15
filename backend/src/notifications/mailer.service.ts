import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendResult {
  status: 'sent' | 'failed' | 'skipped';
  messageId?: string;
  error?: string;
}

/**
 * SMTP delivery.
 *
 * For the local demo this points at Mailpit (docker-compose), which captures
 * every message and delivers nothing. `MAIL_ALLOWED_DOMAINS` is a hard
 * second line of defence: if the SMTP settings are ever pointed at a real
 * relay with demo data still loaded, mail to outside addresses is refused
 * rather than sent.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter!: Transporter;
  private verified = false;
  private lastVerifyError: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const mail = this.config.get<any>('mail');

    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
      // Mailpit presents a self-signed certificate.
      tls: { rejectUnauthorized: this.config.get<boolean>('isProduction') ?? false },
    });

    void this.verify();
  }

  /**
   * True when SMTP looks like a local capture tool rather than a real relay.
   * Used to decide whether an emailed localhost link is harmless or a problem.
   */
  get isLocalCapture(): boolean {
    const mail = this.config.get<any>('mail');
    const host = String(mail.host ?? '').toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'mailpit' ||
      host === 'mailhog' ||
      host.endsWith('.local')
    );
  }

  /**
   * Warns when real email delivery is configured but the links inside those
   * emails point at localhost — recipients on another machine would receive an
   * invitation they cannot open.
   */
  private warnIfLinksUnreachable(): void {
    const appUrl = String(this.config.get<string>('appPublicUrl') ?? '');
    const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(appUrl);

    if (!this.isLocalCapture && isLocalUrl) {
      this.logger.warn(
        `Real SMTP is configured (${this.config.get<string>('mail.host')}) but APP_PUBLIC_URL is "${appUrl}". ` +
          'Invitation and notification links will not open on any other machine. ' +
          'Set APP_PUBLIC_URL to an address recipients can reach before sending real email.',
      );
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.verified = true;
      this.lastVerifyError = null;
      const mail = this.config.get<any>('mail');
      this.logger.log(
        `SMTP ready at ${mail.host}:${mail.port}` +
          (this.isLocalCapture ? ' (local capture — nothing is delivered externally)' : ' (REAL DELIVERY)'),
      );
      this.warnIfLinksUnreachable();
      return true;
    } catch (error: any) {
      this.verified = false;
      this.lastVerifyError = error?.message ?? String(error);
      this.logger.warn(
        `SMTP not reachable: ${this.lastVerifyError}. Notifications will be logged as failed until this is fixed.`,
      );
      return false;
    }
  }

  get status() {
    const mail = this.config.get<any>('mail');
    const appUrl = String(this.config.get<string>('appPublicUrl') ?? '');
    const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(appUrl);

    return {
      configured: true,
      reachable: this.verified,
      host: mail.host,
      port: mail.port,
      from: `${mail.fromName} <${mail.fromAddress}>`,
      allowed_domains: mail.allowedDomains,
      last_error: this.lastVerifyError,
      // Makes it obvious on the Settings page whether mail leaves the machine.
      mode: this.isLocalCapture ? 'local_capture' : 'real_delivery',
      app_public_url: appUrl,
      links_reachable_externally: !isLocalUrl,
      warning:
        !this.isLocalCapture && isLocalUrl
          ? 'Real email is configured but links point at localhost, so recipients on other machines cannot open them. Set APP_PUBLIC_URL.'
          : null,
    };
  }

  /**
   * Decides whether a recipient may be sent to.
   *
   * MAIL_ALLOWED_DOMAINS exists to stop demo data from emailing real people by
   * accident. That risk only exists with a real relay — when SMTP points at a
   * local capture tool, every message is trapped on this machine and nothing
   * can reach anyone, so the restriction is skipped.
   *
   * Enforcing it in local capture caused real confusion: invitations to
   * ordinary addresses were silently dropped and never appeared in Mailpit,
   * which looked like Mailpit being broken.
   */
  isAllowedRecipient(email: string): { allowed: boolean; reason?: string } {
    if (this.isLocalCapture) return { allowed: true };

    const allowed: string[] = this.config.get('mail.allowedDomains') ?? [];
    if (allowed.length === 0) return { allowed: true };

    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && allowed.some((d) => d.toLowerCase() === domain)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason:
        `Real email delivery is configured, and "${domain ?? email}" is not in MAIL_ALLOWED_DOMAINS ` +
        `(${allowed.join(', ')}). Nothing was sent. Add the domain to MAIL_ALLOWED_DOMAINS in ` +
        'backend/.env and restart the backend to allow it.',
    };
  }

  async send(options: {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
  }): Promise<SendResult> {
    const mail = this.config.get<any>('mail');

    const gate = this.isAllowedRecipient(options.to);
    if (!gate.allowed) {
      this.logger.warn(`Refused to send to ${options.to}: ${gate.reason}`);
      return { status: 'skipped', error: gate.reason };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${options.fromName ?? mail.fromName}" <${mail.fromAddress}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      return { status: 'sent', messageId: info.messageId };
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.logger.error(`Failed to send to ${options.to}: ${message}`);
      return { status: 'failed', error: message };
    }
  }
}
