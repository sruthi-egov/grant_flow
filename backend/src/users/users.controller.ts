import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

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

  /** Replaces `base44.users.inviteUser(email, role)`. */
  @Post('invite')
  @HttpCode(201)
  invite(
    @Body() body: { email: string; role?: 'admin' | 'user' },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.invite(body?.email, body?.role ?? 'user', actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.remove(id, actor);
  }
}
