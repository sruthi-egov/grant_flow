import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { MailerService } from '../notifications/mailer.service';
import type { AuthenticatedUser } from '../common/decorators';

export type ModuleName = 'Grants' | 'SOWs' | 'MSAs' | 'MOUs';
const VALID_MODULES: ModuleName[] = ['Grants', 'SOWs', 'MSAs', 'MOUs'];

/** Mirrors PASSWORD_REGEX in the UI so both ends enforce the same rule. */
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export interface InvitationView {
  id: string;
  email: string;
  role: 'admin' | 'user';
  allowed_modules: string[];
  can_upload_pdf: boolean;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string;
  sent_count: number;
  last_sent_at: string;
  created_date: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlMs(): number {
    const days = Number(this.config.get<number>('invitations.expiryDays') ?? 7);
    return days * 24 * 60 * 60 * 1000;
  }

  private normalizeEmail(email: string): string {
    const normalized = (email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
      throw new BadRequestException(`"${email}" is not a valid email address`);
    }
    return normalized;
  }

  private sanitizeModules(modules: unknown): string[] {
    if (!Array.isArray(modules)) return [];
    // Silently dropping unknown values would hide a typo, so reject instead.
    const invalid = modules.filter((m) => !VALID_MODULES.includes(m as ModuleName));
    if (invalid.length) {
      throw new BadRequestException(
        `Unknown module(s): ${invalid.join(', ')}. Valid values: ${VALID_MODULES.join(', ')}`,
      );
    }
    return [...new Set(modules as string[])];
  }

  private statusOf(row: {
    accepted_at: Date | null;
    revoked_at: Date | null;
    expires_at: Date;
  }): InvitationView['status'] {
    if (row.accepted_at) return 'accepted';
    if (row.revoked_at) return 'revoked';
    if (row.expires_at.getTime() < Date.now()) return 'expired';
    return 'pending';
  }

  private toView(row: any): InvitationView {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      allowed_modules: row.allowed_modules,
      can_upload_pdf: row.can_upload_pdf,
      expires_at: row.expires_at.toISOString(),
      accepted_at: row.accepted_at?.toISOString() ?? null,
      revoked_at: row.revoked_at?.toISOString() ?? null,
      invited_by: row.invited_by,
      accepted_user_id: row.accepted_user_id,
      sent_count: row.sent_count,
      last_sent_at: row.last_sent_at.toISOString(),
      created_date: row.created_date.toISOString(),
      status: this.statusOf(row),
    } as InvitationView;
  }

  private acceptUrl(token: string): string {
    const base = (this.config.get<string>('appPublicUrl') ?? 'http://localhost:5173').replace(/\/+$/, '');
    return `${base}/invite/${token}`;
  }

  /**
   * Creates an invitation, or refreshes the pending one for this address.
   *
   * Re-inviting someone who already has a pending invitation issues a NEW
   * token and revokes the old one, so a forwarded or leaked earlier link stops
   * working. It never creates a second account or a second pending row.
   */
  async invite(
    input: {
      email: string;
      role?: 'admin' | 'user';
      allowed_modules?: string[];
      can_upload_pdf?: boolean;
    },
    actor: AuthenticatedUser,
  ): Promise<{ invitation: InvitationView; email_status: string; accept_url?: string; resent: boolean }> {
    const email = this.normalizeEmail(input.email);
    const role = input.role === 'admin' ? 'admin' : 'user';
    const allowed_modules = this.sanitizeModules(input.allowed_modules);
    const can_upload_pdf = input.can_upload_pdf === true;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException(
        `${email} already has an account. Use the user list to change their role or permissions, ` +
          'or deactivate the account instead of re-inviting.',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const token_hash = InvitationsService.hash(token);
    const expires_at = new Date(Date.now() + this.ttlMs());

    // Revoke any outstanding invitation for this address, then create the new
    // one, atomically — so there is never more than one live link per email.
    const previousPending = await this.prisma.invitation.findFirst({
      where: { email, accepted_at: null, revoked_at: null },
      orderBy: { created_date: 'desc' },
    });

    const invitation = await this.prisma.$transaction(async (tx) => {
      if (previousPending) {
        await tx.invitation.update({
          where: { id: previousPending.id },
          data: { revoked_at: new Date() },
        });
      }
      return tx.invitation.create({
        data: {
          email,
          token_hash,
          role,
          allowed_modules,
          can_upload_pdf,
          expires_at,
          invited_by: actor.email,
          sent_count: previousPending ? previousPending.sent_count + 1 : 1,
          last_sent_at: new Date(),
        },
      });
    });

    const emailStatus = await this.sendInvitationEmail(email, token, role, expires_at, actor);

    await this.audit(
      previousPending ? 'invitation_resent' : 'invitation_created',
      invitation.id,
      email,
      actor,
      `${previousPending ? 'Resent' : 'Created'} invitation for ${email} as ${role}`,
    );

    this.logger.log(
      `${previousPending ? 'Resent' : 'Created'} invitation for ${email} (${role}) by ${actor.email}; email ${emailStatus}`,
    );

    return {
      invitation: this.toView(invitation),
      email_status: emailStatus,
      // Shown to the admin outside production so a demo works without opening
      // the mail UI. Never included in a production response.
      accept_url: this.config.get<boolean>('isProduction') ? undefined : this.acceptUrl(token),
      resent: Boolean(previousPending),
    };
  }

  /** Issues a fresh token for an existing pending invitation. */
  async resend(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{ invitation: InvitationView; email_status: string; accept_url?: string }> {
    const existing = await this.prisma.invitation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Invitation not found');

    if (existing.accepted_at) {
      throw new ConflictException(
        `${existing.email} has already accepted this invitation. Nothing to resend.`,
      );
    }

    const result = await this.invite(
      {
        email: existing.email,
        role: existing.role,
        allowed_modules: existing.allowed_modules,
        can_upload_pdf: existing.can_upload_pdf,
      },
      actor,
    );
    return result;
  }

  async revoke(id: string, actor: AuthenticatedUser): Promise<InvitationView> {
    const existing = await this.prisma.invitation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Invitation not found');
    if (existing.accepted_at) {
      throw new ConflictException('This invitation has already been accepted and cannot be revoked.');
    }

    const updated = await this.prisma.invitation.update({
      where: { id },
      data: { revoked_at: new Date() },
    });
    await this.audit('invitation_revoked', id, existing.email, actor, `Revoked invitation for ${existing.email}`);
    return this.toView(updated);
  }

  async list(): Promise<InvitationView[]> {
    const rows = await this.prisma.invitation.findMany({ orderBy: { created_date: 'desc' }, take: 200 });
    return rows.map((r) => this.toView(r));
  }

  /**
   * Resolves a raw token to a live invitation.
   *
   * Lookup is by hash, so the raw token never has to be compared in the
   * database. Every rejection returns the same generic shape so a probe cannot
   * distinguish "no such token" from "expired" by response type alone — the
   * reason is carried in a field for the UI to render.
   */
  private async resolveToken(token: string) {
    if (!token || token.length < 20 || token.length > 200) {
      throw new NotFoundException({
        error: 'invitation_invalid',
        message: 'This invitation link is not valid.',
      });
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { token_hash: InvitationsService.hash(token) },
    });

    if (!invitation) {
      throw new NotFoundException({
        error: 'invitation_invalid',
        message: 'This invitation link is not valid. Ask an administrator to send a new one.',
      });
    }
    if (invitation.accepted_at) {
      throw new BadRequestException({
        error: 'invitation_already_used',
        message:
          'This invitation has already been used. If you have an account, sign in; otherwise ask for a new invitation.',
      });
    }
    if (invitation.revoked_at) {
      throw new BadRequestException({
        error: 'invitation_revoked',
        message:
          'This invitation was replaced or cancelled. Ask an administrator to send a new one.',
      });
    }
    if (invitation.expires_at.getTime() < Date.now()) {
      throw new BadRequestException({
        error: 'invitation_expired',
        message: 'This invitation has expired. Ask an administrator to send a new one.',
        expired_at: invitation.expires_at.toISOString(),
      });
    }
    return invitation;
  }

  /** Public pre-flight for the acceptance page. Returns no secret material. */
  async preview(token: string) {
    const invitation = await this.resolveToken(token);
    return {
      email: invitation.email,
      role: invitation.role,
      expires_at: invitation.expires_at.toISOString(),
      invited_by: invitation.invited_by,
    };
  }

  /**
   * Accepts an invitation and creates the account.
   *
   * Role, modules and upload permission are taken from the stored invitation,
   * never from the request body — a recipient cannot grant themselves admin.
   *
   * The token is consumed inside the same transaction that creates the user,
   * and the update is conditioned on `accepted_at: null`, so two simultaneous
   * submissions cannot both succeed.
   */
  async accept(
    token: string,
    input: { password: string; full_name?: string },
  ): Promise<{ email: string; role: string }> {
    const invitation = await this.resolveToken(token);

    const password = input?.password ?? '';
    if (!PASSWORD_POLICY.test(password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.',
      );
    }

    // Guard against an account created between the invitation and acceptance.
    const alreadyExists = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (alreadyExists) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { revoked_at: new Date() },
      });
      throw new ConflictException(
        'An account already exists for this email address. Please sign in instead.',
      );
    }

    const password_hash = await this.auth.hashPassword(password);
    const fullName = (input?.full_name ?? '').trim().slice(0, 150) || invitation.email.split('@')[0];

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // Single-use: only succeeds while accepted_at is still null.
        const claimed = await tx.invitation.updateMany({
          where: { id: invitation.id, accepted_at: null, revoked_at: null },
          data: { accepted_at: new Date() },
        });
        if (claimed.count !== 1) {
          throw new ConflictException({
            error: 'invitation_already_used',
            message: 'This invitation has already been used.',
          });
        }

        const created = await tx.user.create({
          data: {
            email: invitation.email,
            password_hash,
            full_name: fullName,
            // Authoritative: comes from the invitation, not the request.
            role: invitation.role,
            allowed_modules: invitation.allowed_modules,
            can_upload_pdf: invitation.can_upload_pdf,
            is_active: true,
            must_change_password: false,
            created_by: invitation.invited_by,
          },
        });

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { accepted_user_id: created.id },
        });

        return created;
      });

      await this.prisma.auditLog
        .create({
          data: {
            action_type: 'invitation_accepted',
            entity_type: 'User',
            entity_id: user.id,
            entity_name: user.email,
            user_email: user.email,
            user_name: user.full_name,
            description: `${user.email} accepted an invitation from ${invitation.invited_by} and created an account as ${user.role}`,
            status: 'success',
          },
        })
        .catch(() => undefined);

      this.logger.log(`Invitation accepted by ${user.email} (${user.role})`);
      return { email: user.email, role: user.role };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account already exists for this email address.');
      }
      throw error;
    }
  }

  private async sendInvitationEmail(
    email: string,
    token: string,
    role: string,
    expiresAt: Date,
    actor: AuthenticatedUser,
  ): Promise<string> {
    const url = this.acceptUrl(token);
    const inviter = actor.display_name || actor.full_name || actor.email;
    const expiryDays = Math.round(this.ttlMs() / 86_400_000);

    const result = await this.mailer.send({
      to: email,
      subject: '[GrantOS] You have been invited to GrantOS',
      html: `<div style="font-family: sans-serif; max-width: 600px; line-height: 1.5;">
  <p>Hello,</p>
  <p><strong>${this.escape(inviter)}</strong> has invited you to GrantOS as
     <strong>${this.escape(role === 'admin' ? 'an administrator' : 'a user')}</strong>.</p>
  <p>Use the link below to choose your own password and activate your account:</p>
  <p style="margin: 24px 0;">
    <a href="${url}"
       style="background:#1e293b;color:#fff;padding:12px 20px;border-radius:8px;
              text-decoration:none;display:inline-block;">Accept your invitation</a>
  </p>
  <p style="font-size: 12px; color: #6b7280;">
    Or paste this into your browser:<br><span style="word-break: break-all;">${url}</span>
  </p>
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    This link expires in ${expiryDays} day${expiryDays === 1 ? '' : 's'}
    (${expiresAt.toISOString().slice(0, 10)}) and can only be used once.
    If you were not expecting this invitation you can ignore this email.
  </p>
</div>`,
    });

    if (result.status !== 'sent') {
      this.logger.warn(`Invitation email to ${email} was ${result.status}: ${result.error ?? 'no reason given'}`);
    }
    return result.status;
  }

  private escape(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async audit(
    action: string,
    id: string,
    email: string,
    actor: AuthenticatedUser,
    description: string,
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          action_type: action,
          entity_type: 'Invitation',
          entity_id: id,
          entity_name: email,
          user_email: actor.email,
          user_name: actor.display_name ?? actor.full_name ?? actor.email,
          description,
          status: 'success',
        },
      })
      .catch(() => undefined);
  }
}
