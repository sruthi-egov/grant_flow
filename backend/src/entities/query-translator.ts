import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Translates the Base44 query dialect used throughout the existing React code
 * into Prisma arguments.
 *
 *   sort:   "-created_date"            → { created_date: 'desc' }
 *   filter: { grant_id: 'abc' }        → { grant_id: 'abc' }
 *   filter: { item_id: { $in: [...] }} → { item_id: { in: [...] } }
 *
 * Field names are validated against the model's real columns before reaching
 * Prisma, so a crafted request cannot reach relation traversal or unknown keys.
 */

const OPERATOR_MAP: Record<string, string> = {
  $in: 'in',
  $nin: 'notIn',
  $ne: 'not',
  $gt: 'gt',
  $gte: 'gte',
  $lt: 'lt',
  $lte: 'lte',
  $contains: 'contains',
  $startsWith: 'startsWith',
  $endsWith: 'endsWith',
};

/** Column names of a model, from Prisma's runtime datamodel. */
export function scalarFieldsOf(modelName: string): Set<string> {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase(),
  );
  if (!model) return new Set();
  return new Set(model.fields.filter((f) => f.kind !== 'object').map((f) => f.name));
}

/** Fields of a model that Prisma returns as Decimal, so they can become numbers. */
export function decimalFieldsOf(modelName: string): Set<string> {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase(),
  );
  if (!model) return new Set();
  return new Set(model.fields.filter((f) => f.type === 'Decimal').map((f) => f.name));
}

export function buildOrderBy(
  sort: string | undefined,
  allowed: Set<string>,
): Record<string, 'asc' | 'desc'> | undefined {
  if (!sort) return undefined;
  const trimmed = sort.trim();
  if (!trimmed) return undefined;

  const descending = trimmed.startsWith('-');
  const field = descending ? trimmed.slice(1) : trimmed;

  if (!allowed.has(field)) {
    throw new BadRequestException(`Cannot sort by unknown field "${field}"`);
  }
  return { [field]: descending ? 'desc' : 'asc' };
}

export function buildWhere(
  filter: Record<string, unknown> | undefined,
  allowed: Set<string>,
): Record<string, unknown> {
  if (!filter || typeof filter !== 'object') return {};

  const where: Record<string, unknown> = {};

  for (const [field, raw] of Object.entries(filter)) {
    if (!allowed.has(field)) {
      throw new BadRequestException(`Cannot filter by unknown field "${field}"`);
    }

    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const conditions: Record<string, unknown> = {};
      for (const [op, value] of Object.entries(raw as Record<string, unknown>)) {
        const prismaOp = OPERATOR_MAP[op];
        if (!prismaOp) {
          throw new BadRequestException(`Unsupported filter operator "${op}"`);
        }
        conditions[prismaOp] = value;
      }
      where[field] = conditions;
      continue;
    }

    // Base44 treated an array value as an implicit $in.
    where[field] = Array.isArray(raw) ? { in: raw } : raw;
  }

  return where;
}

/** Clamp a client-supplied limit into a safe range. Base44 defaulted to no limit. */
export function clampLimit(limit: unknown, fallback = 1000, max = 5000): number {
  const parsed = typeof limit === 'number' ? limit : Number.parseInt(String(limit ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
