import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { MailerService } from '../notifications/mailer.service';
import type { AuthenticatedUser } from '../common/decorators';

/** Public view of a user — never includes password_hash. */
export interface UserView {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  role: 'admin' | 'user';
  allowed_modules: string[];
  can_upload_pdf: boolean;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_date: string;
}

const EDITABLE_FIELDS = new Set([
  'full_name',
  'display_name',
  'role',
  'allowed_modules',
  'can_upload_pdf',
  'is_active',
]);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private toView(user: any): UserView {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      display_name: user.display_name,
      role: user.role,
      allowed_modules: user.allowed_modules,
      can_upload_pdf: user.can_upload_pdf,
      is_active: user.is_active,
      must_change_password: user.must_change_password,
      last_login_at: user.last_login_at?.toISOString() ?? null,
      created_date: user.created_date.toISOString(),
    };
  }

  async list(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({ orderBy: { created_date: 'asc' } });
    return users.map((u) => this.toView(u));
  }

  async findOne(id: string): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.toView(user);
  }

  async update(
    id: string,
    data: Record<string, any>,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const payload: Record<string, any> = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (EDITABLE_FIELDS.has(key)) payload[key] = value;
    }

    // An admin must not lock themselves out, and the last admin must remain.
    if (target.id === actor.id) {
      if (payload.role && payload.role !== 'admin') {
        throw new BadRequestException('You cannot remove your own administrator role');
      }
      if (payload.is_active === false) {
        throw new BadRequestException('You cannot disable your own account');
      }
    }

    const losesAdmin =
      (payload.role && payload.role !== 'admin' && target.role === 'admin') ||
      (payload.is_active === false && target.role === 'admin');

    if (losesAdmin) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: 'admin', is_active: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException(
          'This is the only active administrator. Promote another user first.',
        );
      }
    }

    // Disabling a user revokes their sessions immediately.
    if (payload.is_active === false) {
      payload.tokens_valid_from = new Date();
      await this.prisma.refreshToken.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }

    const updated = await this.prisma.user.update({ where: { id }, data: payload });

    await this.prisma.auditLog
      .create({
        data: {
          action_type: 'user_updated',
          entity_type: 'User',
          entity_id: id,
          entity_name: updated.email,
          user_email: actor.email,
          user_name: actor.display_name ?? actor.email,
          description: `Updated ${Object.keys(payload).join(', ') || 'nothing'} for ${updated.email}`,
          status: 'success',
        },
      })
      .catch(() => undefined);

    return this.toView(updated);
  }

  /**
   * Creates a user with a generated temporary password.
   *
   * Replaces `base44.users.inviteUser`. The credential is emailed through the
   * configured SMTP server (Mailpit locally, so it is captured, not delivered).
   * Outside production the password is also returned so a demo operator can
   * read it without opening the mail UI.
   */
  async invite(
    email: string,
    role: 'admin' | 'user',
    actor: AuthenticatedUser,
  ): Promise<{ user: UserView; temp_password?: string; email_status: string }> {
    const normalized = (email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException('A valid email address is required');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException(`A user with the email ${normalized} already exists`);
    }

    // 18 bytes → 24 URL-safe characters, well above the 10-char minimum.
    const tempPassword = randomBytes(18).toString('base64url');

    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        password_hash: await this.auth.hashPassword(tempPassword),
        role: role === 'admin' ? 'admin' : 'user',
        full_name: normalized.split('@')[0],
        must_change_password: true,
        is_active: true,
        created_by: actor.email,
      },
    });

    const appUrl = this.config.get<string>('appPublicUrl');
    const sendResult = await this.mailer.send({
      to: normalized,
      subject: '[GrantOS] You have been invited',
      html: `<div style="font-family: sans-serif; max-width: 600px;">
        <p>Hello,</p>
        <p>An account has been created for you in <strong>GrantOS</strong>.</p>
        <p><strong>Sign-in address:</strong> ${appUrl}<br>
           <strong>Email:</strong> ${normalized}<br>
           <strong>Temporary password:</strong> <code>${tempPassword}</code></p>
        <p>Please sign in and change your password immediately.</p>
      </div>`,
    });

    await this.prisma.auditLog
      .create({
        data: {
          action_type: 'user_invited',
          entity_type: 'User',
          entity_id: user.id,
          entity_name: normalized,
          user_email: actor.email,
          user_name: actor.display_name ?? actor.email,
          description: `Invited ${normalized} as ${role}`,
          status: 'success',
        },
      })
      .catch(() => undefined);

    this.logger.log(`Invited ${normalized} as ${role} (email ${sendResult.status})`);

    return {
      user: this.toView(user),
      temp_password: this.config.get<boolean>('isProduction') ? undefined : tempPassword,
      email_status: sendResult.status,
    };
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<{ success: boolean }> {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    if (target.role === 'admin') {
      const others = await this.prisma.user.count({
        where: { role: 'admin', is_active: true, id: { not: id } },
      });
      if (others === 0) {
        throw new BadRequestException('Cannot delete the only administrator');
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
