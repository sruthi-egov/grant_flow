import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { InvitationsService } from './invitations.service';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.update(id, body, actor);
  }

  /**
   * Replaces `base44.users.inviteUser(email, role)`.
   *
   * Creates a pending *invitation* with a single-use expiring token — it no
   * longer creates a live account with an emailed password. Role and
   * permissions are recorded on the invitation and applied when it is
   * accepted, which removes the window where a new account briefly had
   * unrestricted module access.
   */
  @Post('invite')
  @HttpCode(201)
  invite(
    @Body()
    body: {
      email: string;
      role?: 'admin' | 'user';
      allowed_modules?: string[];
      can_upload_pdf?: boolean;
    },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invitations.invite(body ?? ({} as any), actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.remove(id, actor);
  }
}
