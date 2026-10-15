import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, Public, Roles, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { InvitationsService } from './invitations.service';

class AcceptInvitationDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  full_name?: string;

  // Deliberately no `role` / `allowed_modules` field: permissions come from
  // the stored invitation. Any such key in the body is ignored.
}

class CreateInvitationDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsOptional()
  @IsIn(['admin', 'user'], { message: 'role must be "admin" or "user"' })
  role?: 'admin' | 'user';

  @IsOptional()
  allowed_modules?: string[];

  @IsOptional()
  can_upload_pdf?: boolean;
}

/**
 * Public endpoints for accepting an invitation.
 *
 * These are unauthenticated by necessity — the recipient has no account yet —
 * but they are rate limited, and the token itself is the only credential.
 */
@Public()
@Controller('invitations')
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Lets the acceptance page show who was invited before they submit. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/accept')
  @HttpCode(200)
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(token, dto);
  }
}

/** Admin-only invitation management. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/invitations')
export class AdminInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list() {
    return this.invitations.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateInvitationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.invitations.invite(dto, actor);
  }

  @Post(':id/resend')
  @HttpCode(200)
  resend(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.invitations.resend(id, actor);
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.invitations.revoke(id, actor);
  }
}
