import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: string;
}

/** Shape returned by `/api/auth/me`, matching what the React UI reads. */
export interface MeResponse {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  role: 'admin' | 'user';
  allowed_modules: string[];
  can_upload_pdf: boolean;
  is_active: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  /**
   * Verifies credentials.
   *
   * Always runs a hash comparison, even for a missing user, so response timing
   * does not reveal whether an email is registered.
   */
  async validateCredentials(email: string, password: string) {
    const normalized = (email ?? '').trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    const hash =
      user?.password_hash ??
      '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

    let matches = false;
    try {
      matches = await argon2.verify(hash, password ?? '');
    } catch {
      matches = false;
    }

    if (!user || !matches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.is_active) {
      throw new UnauthorizedException('This account has been disabled');
    }
    return user;
  }

  async login(email: string, password: string, userAgent?: string): Promise<TokenPair> {
    const user = await this.validateCredentials(email, password);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    return this.issueTokens(user.id, user.email, user.role, userAgent);
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: 'admin' | 'user',
    userAgent?: string,
  ): Promise<TokenPair> {
    const accessTtl = this.config.get<string>('auth.accessTtl')!;
    const refreshTtl = this.config.get<string>('auth.refreshTtl')!;

    const access_token = await this.jwt.signAsync(
      { sub: userId, email, role },
      { secret: this.config.get<string>('auth.accessSecret'), expiresIn: accessTtl },
    );

    // Opaque refresh token: stored only as a SHA-256 hash, so a database leak
    // does not hand out usable sessions.
    const refresh_token = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: AuthService.hashToken(refresh_token),
        expires_at: new Date(Date.now() + this.ttlToMs(refreshTtl)),
        user_agent: userAgent?.slice(0, 250),
      },
    });

    return { access_token, refresh_token, expires_in: accessTtl };
  }

  private ttlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 7 * 24 * 3600 * 1000;
    const amount = Number(match[1]);
    const unit = match[2];
    const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
    return amount * factor;
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token_hash: AuthService.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    if (!stored.user.is_active) {
      throw new UnauthorizedException('This account has been disabled');
    }

    // Rotate: the presented token is burned before a new pair is issued.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked_at: new Date() },
    });

    return this.issueTokens(stored.user.id, stored.user.email, stored.user.role, userAgent);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken
      .updateMany({
        where: { token_hash: AuthService.hashToken(refreshToken), revoked_at: null },
        data: { revoked_at: new Date() },
      })
      .catch(() => undefined);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!newPassword || newPassword.length < 10) {
      throw new BadRequestException('New password must be at least 10 characters');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const ok = await argon2.verify(user.password_hash, currentPassword ?? '').catch(() => false);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          password_hash: await this.hashPassword(newPassword),
          must_change_password: false,
          // Invalidates every access token issued before now.
          tokens_valid_from: new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);

    this.logger.log(`Password changed for user ${userId}`);
  }

  toMeResponse(user: AuthenticatedUser): MeResponse {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      display_name: user.display_name,
      role: user.role,
      allowed_modules: user.allowed_modules,
      can_upload_pdf: user.can_upload_pdf,
      is_active: user.is_active,
    };
  }

  /**
   * Live permissions for the current user.
   * Port of the Base44 `getMyPermissions` backend function.
   */
  permissionsFor(user: AuthenticatedUser) {
    if (!user.is_active) {
      return { can_upload_pdf: false, allowed_modules: [], role: user.role, is_enabled: false };
    }
    if (user.role === 'admin') {
      // null = all modules, matching the original contract.
      return { can_upload_pdf: true, allowed_modules: null, role: 'admin', is_enabled: true };
    }
    return {
      can_upload_pdf: user.can_upload_pdf === true,
      allowed_modules: user.allowed_modules?.length ? user.allowed_modules : null,
      role: 'user',
      is_enabled: true,
    };
  }
}
