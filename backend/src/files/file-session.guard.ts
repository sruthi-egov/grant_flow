import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators';

export const FILE_SESSION_COOKIE = 'grantos_session';

/**
 * Authenticates document downloads.
 *
 * The UI opens documents with `<a href="/api/files/:id/download" target="_blank">`,
 * and a browser navigation cannot carry an `Authorization` header. So this
 * guard accepts either:
 *
 *   1. `Authorization: Bearer <access token>` — for fetch/XHR callers, or
 *   2. the httpOnly `grantos_session` cookie issued at login.
 *
 * The cookie is `SameSite=Lax`, which a top-level navigation sends but a
 * cross-site form post or iframe does not. The route is a read-only GET, so
 * this is not a CSRF-relevant surface.
 *
 * This is authentication, not a bypass: the token is verified, the user is
 * re-read from the database, and the caller must still pass the per-module
 * authorisation check in the controller.
 */
@Injectable()
export class FileSessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const cookie = (request as any).cookies?.[FILE_SESSION_COOKIE] as string | undefined;

    const token = bearer ?? cookie;
    if (!token) {
      throw new UnauthorizedException('Sign in to download documents');
    }

    let payload: { sub: string; iat?: number };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('auth.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again to download.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Account is not active');
    }

    // 1s leeway: `iat` is whole seconds while `tokens_valid_from` has
    // milliseconds, so a freshly issued token can look marginally too old.
    if (payload.iat !== undefined) {
      const issuedAtMs = payload.iat * 1000;
      if (issuedAtMs + 1000 < user.tokens_valid_from.getTime()) {
        throw new UnauthorizedException('Your session has expired. Sign in again to download.');
      }
    }

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      display_name: user.display_name,
      role: user.role,
      allowed_modules: user.allowed_modules,
      can_upload_pdf: user.can_upload_pdf,
      is_active: user.is_active,
    };
    (request as any).user = authenticated;
    return true;
  }
}
