import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { FILE_SESSION_COOKIE } from '../files/file-session.guard';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  current_password!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  new_password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Mirrors the access token into an httpOnly cookie.
   *
   * The cookie exists for one reason: document downloads are opened as plain
   * links (`<a target="_blank">`), and a browser navigation cannot send an
   * Authorization header. Only /api/files/:id/download reads it.
   */
  private setSessionCookie(res: Response, accessToken: string): void {
    res.cookie(FILE_SESSION_COOKIE, accessToken, {
      httpOnly: true,
      // Lax means a cross-site POST never carries this cookie, while a
      // top-level navigation (clicking a document link) does.
      sameSite: 'lax',
      secure: this.config.get<boolean>('isProduction') ?? false,
      // Scoped to /api rather than /api/files: the cookie is issued from
      // /api/auth/login, and several HTTP clients refuse a Set-Cookie whose
      // Path is not a prefix of the request path. Only FileSessionGuard ever
      // reads it — every other route authenticates from the Bearer header —
      // so the wider path grants no extra access.
      path: '/api',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  /** Rate-limited to blunt credential stuffing: 10 attempts per minute per IP. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(dto.email, dto.password, req.headers['user-agent']);
    this.setSessionCookie(res, tokens.access_token);
    return tokens;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.refresh(dto.refresh_token, req.headers['user-agent']);
    this.setSessionCookie(res, tokens.access_token);
    return tokens;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: { refresh_token?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(body?.refresh_token);
    res.clearCookie(FILE_SESSION_COOKIE, { path: '/api' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.toMeResponse(user);
  }

  /** Port of the Base44 `getMyPermissions` function. */
  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  permissions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.permissionsFor(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(user.id, dto.current_password, dto.new_password);
  }
}
