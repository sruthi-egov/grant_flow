import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators';
import {
  getEntityDefinition,
  type Access,
  type EntityDefinition,
} from './entity-registry';
import {
  buildOrderBy,
  buildWhere,
  clampLimit,
  decimalFieldsOf,
  scalarFieldsOf,
} from './query-translator';
import {
  coerceInput,
  serializeMany,
  serializeRecord,
  stripProtected,
  toPrismaEnumValue,
} from './serializer';

type Operation = 'create' | 'read' | 'update' | 'delete';

/** Prisma model name for a delegate key, e.g. `grant` → `Grant`. */
function modelNameOf(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger(EntitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private definition(entity: string): EntityDefinition {
    const def = getEntityDefinition(entity);
    if (!def) throw new NotFoundException(`Unknown entity "${entity}"`);
    return def;
  }

  private delegate(def: EntityDefinition): any {
    const client = this.prisma as unknown as Record<string, any>;
    const delegate = client[def.delegate];
    if (!delegate) {
      throw new NotFoundException(`Entity "${def.delegate}" is not available`);
    }
    return delegate;
  }

  /**
   * Enforces the Base44 RLS rules plus the per-user module restriction.
   * Every read and write path goes through here — there is no unguarded route.
   */
  private authorize(
    entity: string,
    def: EntityDefinition,
    op: Operation,
    user: AuthenticatedUser,
  ): void {
    const required: Access = def[op];
    if (required === 'admin' && user.role !== 'admin') {
      throw new ForbiddenException(
        `Only administrators can ${op} ${entity} records`,
      );
    }

    // `allowed_modules` empty = unrestricted (Base44 semantics). Admins bypass.
    if (def.module && user.role !== 'admin') {
      const allowed = user.allowed_modules ?? [];
      if (allowed.length > 0 && !allowed.includes(def.module)) {
        throw new ForbiddenException(
          `Your account does not have access to the ${def.module} module`,
        );
      }
    }
  }

  /**
   * Field-level redaction for non-admins.
   * AppSettings must be readable by everyone (the app header reads the
   * environment label from it) but the notification recipient list must not
   * leak to ordinary users.
   */
  private redact(
    entity: string,
    row: Record<string, any> | null,
    user: AuthenticatedUser,
  ): Record<string, any> | null {
    if (!row) return row;
    if (entity === 'AppSettings' && user.role !== 'admin') {
      const { alert_emails, ...rest } = row;
      return { ...rest, alert_emails: [] };
    }
    return row;
  }

  private serializeOptions(def: EntityDefinition) {
    const modelName = modelNameOf(def.delegate);
    return {
      dateOnly: def.dateOnly,
      decimalFields: decimalFieldsOf(modelName),
      modelName,
    };
  }

  async list(
    entity: string,
    user: AuthenticatedUser,
    opts: { sort?: string; limit?: unknown },
  ) {
    const def = this.definition(entity);
    this.authorize(entity, def, 'read', user);

    const fields = scalarFieldsOf(modelNameOf(def.delegate));
    const rows = await this.delegate(def).findMany({
      orderBy: buildOrderBy(opts.sort, fields) ?? { created_date: 'desc' },
      take: clampLimit(opts.limit),
    });

    return serializeMany(rows, this.serializeOptions(def)).map((r) =>
      this.redact(entity, r, user),
    );
  }

  async filter(
    entity: string,
    user: AuthenticatedUser,
    body: { where?: Record<string, unknown>; sort?: string; limit?: unknown },
  ) {
    const def = this.definition(entity);
    this.authorize(entity, def, 'read', user);

    const model = modelNameOf(def.delegate);
    const fields = scalarFieldsOf(model);
    const rows = await this.delegate(def).findMany({
      where: buildWhere(body.where, fields, (field, value) =>
        toPrismaEnumValue(model, field, value),
      ),
      orderBy: buildOrderBy(body.sort, fields) ?? { created_date: 'desc' },
      take: clampLimit(body.limit),
    });

    return serializeMany(rows, this.serializeOptions(def)).map((r) =>
      this.redact(entity, r, user),
    );
  }

  async findOne(entity: string, id: string, user: AuthenticatedUser) {
    const def = this.definition(entity);
    this.authorize(entity, def, 'read', user);

    const row = await this.delegate(def).findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`${entity} ${id} not found`);

    return this.redact(entity, serializeRecord(row, this.serializeOptions(def)), user);
  }

  async create(entity: string, data: Record<string, any>, user: AuthenticatedUser) {
    const def = this.definition(entity);
    this.authorize(entity, def, 'create', user);

    const model = modelNameOf(def.delegate);
    const payload = coerceInput(stripProtected(data ?? {}), model);

    try {
      const row = await this.delegate(def).create({
        data: { ...payload, created_by: user.email },
      });
      await this.writeAudit(entity, row.id, 'created', user, row);
      return serializeRecord(row, this.serializeOptions(def));
    } catch (error) {
      throw this.translatePrismaError(error, entity);
    }
  }

  async update(
    entity: string,
    id: string,
    data: Record<string, any>,
    user: AuthenticatedUser,
  ) {
    const def = this.definition(entity);
    this.authorize(entity, def, 'update', user);

    const model = modelNameOf(def.delegate);
    const payload = coerceInput(stripProtected(data ?? {}), model);

    const existing = await this.delegate(def).findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`${entity} ${id} not found`);

    try {
      const row = await this.delegate(def).update({ where: { id }, data: payload });
      await this.writeAudit(entity, id, 'updated', user, row, existing);
      return serializeRecord(row, this.serializeOptions(def));
    } catch (error) {
      throw this.translatePrismaError(error, entity);
    }
  }

  async remove(entity: string, id: string, user: AuthenticatedUser) {
    const def = this.definition(entity);
    this.authorize(entity, def, 'delete', user);

    const existing = await this.delegate(def).findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`${entity} ${id} not found`);

    try {
      await this.delegate(def).delete({ where: { id } });
      await this.writeAudit(entity, id, 'deleted', user, existing);
      return { success: true, id };
    } catch (error) {
      throw this.translatePrismaError(error, entity);
    }
  }

  /**
   * Records create/update/delete against business records in the audit trail.
   * Log tables are skipped to avoid an audit-of-the-audit feedback loop.
   */
  private async writeAudit(
    entity: string,
    entityId: string,
    verb: 'created' | 'updated' | 'deleted',
    user: AuthenticatedUser,
    row: Record<string, any>,
    previous?: Record<string, any>,
  ): Promise<void> {
    const SKIP = new Set([
      'AuditLog',
      'NotificationLog',
      'CleanupLog',
      'DocumentUploadLog',
      'GrantHealthScoreSnapshot',
    ]);
    if (SKIP.has(entity)) return;

    const name = row?.title ?? row?.name ?? row?.obligation_name ?? row?.tranche_name ?? null;

    try {
      await this.prisma.auditLog.create({
        data: {
          action_type: `${entity.toLowerCase()}_${verb}`,
          entity_type: entity,
          entity_id: entityId,
          entity_name: name ? String(name).slice(0, 250) : null,
          grant_id: row?.grant_id ?? previous?.grant_id ?? null,
          user_email: user.email,
          user_name: user.display_name ?? user.full_name ?? user.email,
          description: `${entity} ${verb} by ${user.email}`,
          status: 'success',
        },
      });
    } catch (error) {
      // Audit failure must never break the user's operation.
      this.logger.warn(`Failed to write audit entry for ${entity}/${entityId}: ${error}`);
    }
  }

  /** Turns Prisma error codes into useful HTTP responses instead of a 500. */
  private translatePrismaError(error: unknown, entity: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return new BadRequestException(`A ${entity} with this ${target} already exists`);
      }
      if (error.code === 'P2003') {
        return new BadRequestException(
          `Cannot save ${entity}: the referenced parent record does not exist`,
        );
      }
      if (error.code === 'P2025') {
        return new NotFoundException(`${entity} not found`);
      }
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      return new BadRequestException(
        `Invalid data for ${entity}. Check field names, types and enum values.`,
      );
    }
    return error as Error;
  }
}
