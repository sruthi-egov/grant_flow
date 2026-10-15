import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators';

/** Covers the sub-second truncation of the JWT `iat` claim. */
const IAT_LEEWAY_MS = 1000;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: 'admin' | 'user';
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.accessSecret')!,
    });
  }

  /**
   * Re-reads the user on every request rather than trusting the token claims.
   * This is what makes "disable user" and "change role" take effect
   * immediately instead of at the next token refresh.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) throw new UnauthorizedException('User no longer exists');
    if (!user.is_active) throw new UnauthorizedException('Account disabled');

    // Tokens issued before a password change / forced logout are rejected.
    //
    // `iat` is whole seconds (RFC 7519) while `tokens_valid_from` carries
    // milliseconds, so a token minted in the same second as the cutoff can
    // appear up to 999 ms "older" than it really is. Without this leeway a
    // user who just accepted an invitation or changed their password is
    // rejected on their very next request.
    if (payload.iat !== undefined) {
      const issuedAtMs = payload.iat * 1000;
      if (issuedAtMs + IAT_LEEWAY_MS < user.tokens_valid_from.getTime()) {
        throw new UnauthorizedException('Session expired, please sign in again');
      }
    }

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
}
