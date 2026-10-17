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
 * Why a message is being sent.
 *
 *   'transactional' — a person asked for it: an invitation, a password reset,
 *                     an admin-initiated or test send. Goes to any valid
 *                     recipient under the 'unrestricted' policy.
 *   'notification'  — produced automatically by the scheduled run. Subject to
 *                     NOTIFICATION_BLOCKED_DOMAINS, so seeded demo contacts
 *                     are never emailed in bulk.
 */
export type MailPurpose = 'transactional' | 'notification';

/** RFC 5322-simplified check, the same rule the notification engine uses. */
function isSyntacticallyValid(email: string): boolean {
  const value = (email ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/**
 * SMTP delivery.
 *
 * Configured through SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER /
 * SMTP_PASS. For a real provider such as Gmail that means
 * smtp.gmail.com:587 with SMTP_SECURE=false, which selects STARTTLS rather
 * than implicit TLS — the connection is still encrypted, and `requireTLS`
 * below makes the upgrade mandatory rather than opportunistic.
 *
 * `MAIL_ALLOWED_DOMAINS` is a safety net for real delivery: mail to a domain
 * outside the list is refused rather than sent. It is not applied when SMTP
 * points at a local capture tool, where nothing can leave the machine.
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
    const localCapture = this.isLocalCapture;

    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      // false on port 587 = plain connect then STARTTLS upgrade.
      secure: mail.secure,
      // Refuse to continue if the server will not upgrade to TLS. Without this
      // nodemailer would silently fall back to an unencrypted session and send
      // the password in the clear.
      requireTLS: !mail.secure && !localCapture,
      auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
      tls: {
        // Certificates are validated for every real relay. The exception is a
        // local capture tool, which presents a self-signed certificate.
        rejectUnauthorized: !localCapture,
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });

    this.warnIfSenderMismatch();
    void this.verify();
  }

  /**
   * Gmail will not send with an arbitrary From address: it must be the
   * authenticated mailbox or a verified alias, otherwise it rewrites the
   * header or rejects the message. Surfacing that here turns a confusing
   * delivery failure into an explicit startup warning.
   */
  private warnIfSenderMismatch(): void {
    const mail = this.config.get<any>('mail');
    if (this.isLocalCapture || !mail.user) return;

    const from = String(mail.fromAddress ?? '').toLowerCase();
    const user = String(mail.user ?? '').toLowerCase();

    if (from && user && from !== user) {
      this.logger.warn(
        `MAIL_FROM_ADDRESS (${from}) differs from SMTP_USER (${user}). ` +
          'Most providers, Gmail included, only allow sending as the authenticated ' +
          'mailbox or a verified alias — the From header will be rewritten or the ' +
          'message rejected. Set MAIL_FROM_ADDRESS to the SMTP_USER address unless ' +
          'you have configured an alias.',
      );
    }
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
      recipient_policy: mail.recipientPolicy,
      // Only meaningful under the 'allowlist' policy.
      allowed_domains: mail.recipientPolicy === 'allowlist' ? mail.allowedDomains : null,
      notification_blocked_domains: mail.notificationBlockedDomains,
      last_error: this.lastVerifyError,
      // Makes it obvious on the Settings page whether mail leaves the machine.
      mode: mail.dryRun
        ? 'dry_run'
        : this.isLocalCapture
          ? 'local_capture'
          : 'real_delivery',
      dry_run: mail.dryRun === true,
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
   * Order of checks, strictest first:
   *
   *  1. Syntax. A malformed address is rejected before anything else.
   *  2. Automated notifications never reach NOTIFICATION_BLOCKED_DOMAINS.
   *     This is what keeps the scheduled run away from the seeded demo
   *     contacts, without altering a single contact record.
   *  3. Local capture allows everything, because nothing can leave the
   *     machine.
   *  4. The configured sender is always permitted, so a self-addressed
   *     connectivity test needs no configuration change.
   *  5. The recipient policy decides the rest: 'unrestricted' accepts any
   *     valid address, 'allowlist' accepts only MAIL_ALLOWED_DOMAINS.
   *
   * Note that 2 is checked before 3: a local capture tool must not make the
   * demo-contact protection disappear, or a dry run of the scheduled job would
   * behave differently from the real one.
   */
  isAllowedRecipient(
    email: string,
    purpose: MailPurpose = 'transactional',
  ): { allowed: boolean; reason?: string } {
    const mail = this.config.get<any>('mail');
    const target = String(email ?? '').trim().toLowerCase();

    if (!isSyntacticallyValid(target)) {
      return {
        allowed: false,
        reason: `"${email}" is not a valid email address. Nothing was sent.`,
      };
    }

    const domain = target.split('@')[1] ?? '';

    if (purpose === 'notification') {
      const blocked: string[] = mail.notificationBlockedDomains ?? [];
      if (blocked.some((d) => d.toLowerCase() === domain)) {
        return {
          allowed: false,
          reason:
            `"${domain}" is in NOTIFICATION_BLOCKED_DOMAINS, so automated notifications are not ` +
            'sent there. This protects the seeded demo contacts from bulk email. ' +
            'Invitations and admin-initiated sends to this address are unaffected.',
        };
      }
    }

    if (this.isLocalCapture) return { allowed: true };

    // A message to the account doing the sending cannot reach a third party.
    const self = [mail.user, mail.fromAddress]
      .filter(Boolean)
      .map((a: string) => a.trim().toLowerCase());
    if (self.includes(target)) return { allowed: true };

    if (mail.recipientPolicy === 'unrestricted') return { allowed: true };

    const allowed: string[] = mail.allowedDomains ?? [];
    if (allowed.some((d) => d.toLowerCase() === domain)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason:
        `MAIL_RECIPIENT_POLICY is "allowlist" and "${domain}" is not in MAIL_ALLOWED_DOMAINS ` +
        `(${allowed.length ? allowed.join(', ') : 'empty'}). Nothing was sent. Either add the domain, ` +
        'or set MAIL_RECIPIENT_POLICY=unrestricted in backend/.env and restart the backend.',
    };
  }

  async send(options: {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
    /** Defaults to transactional; the scheduled run passes 'notification'. */
    purpose?: MailPurpose;
  }): Promise<SendResult> {
    const mail = this.config.get<any>('mail');

    const gate = this.isAllowedRecipient(options.to, options.purpose ?? 'transactional');
    if (!gate.allowed) {
      this.logger.warn(`Refused to send to ${options.to}: ${gate.reason}`);
      return { status: 'skipped', error: gate.reason };
    }

    if (mail.dryRun) {
      // Deliberately 'skipped', not 'sent' — nothing was transmitted, and
      // callers must never report a dry run as a delivery.
      this.logger.log(`[dry run] would send "${options.subject}" to ${options.to}`);
      return {
        status: 'skipped',
        error: 'MAIL_DRY_RUN is enabled — the message was composed but not transmitted.',
      };
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
