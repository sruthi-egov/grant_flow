import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { EntitiesService } from './entities.service';
import { ENTITY_NAMES } from './entity-registry';

/**
 * One generic CRUD surface for all 25 entities, mirroring the Base44 SDK
 * contract the React code already uses:
 *
 *   GET    /api/entities/:entity?sort=-created_date&limit=500   → list
 *   POST   /api/entities/:entity/filter  { where, sort, limit } → filter
 *   GET    /api/entities/:entity/:id                            → get
 *   POST   /api/entities/:entity                                → create
 *   PATCH  /api/entities/:entity/:id                            → update
 *   DELETE /api/entities/:entity/:id                            → delete
 *
 * `filter` is a POST because its body carries operators ($in, $gte, ...) that
 * do not survive a query string cleanly.
 */
@UseGuards(JwtAuthGuard)
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  /** Entity names this API serves — useful for diagnostics and the UI's health page. */
  @Get('_catalog')
  catalog() {
    return { entities: ENTITY_NAMES };
  }

  @Get(':entity')
  list(
    @Param('entity') entity: string,
    @Query('sort') sort: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entities.list(entity, user, { sort, limit });
  }

  @Post(':entity/filter')
  @HttpCode(200)
  filter(
    @Param('entity') entity: string,
    @Body() body: { where?: Record<string, unknown>; sort?: string; limit?: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entities.filter(entity, user, body ?? {});
  }

  @Get(':entity/:id')
  findOne(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entities.findOne(entity, id, user);
  }

  @Post(':entity')
  create(
    @Param('entity') entity: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entities.create(entity, body, user);
  }

  @Patch(':entity/:id')
  update(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entities.update(entity, id, body, user);
  }

  @Delete(':entity/:id')
  remove(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entities.remove(entity, id, user);
  }
}
