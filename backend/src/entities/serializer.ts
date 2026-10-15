import { Prisma } from '@prisma/client';

/**
 * Enum values whose stored name differs from the value the UI uses.
 *
 * Several Base44 enums contain spaces or hyphens ("Quarterly Report",
 * "bi-annual", "Both Parties"), which are not valid Prisma identifiers, so the
 * schema declares them as `Quarterly_Report @map("Quarterly Report")`. Prisma's
 * client speaks the *member name*, while every existing React component sends
 * and renders the *mapped value* — so values are translated in both directions
 * here rather than touching the UI.
 */
const ENUM_TO_CLIENT = new Map<string, Map<string, string>>(); // enumName -> (memberName -> displayValue)
const ENUM_TO_PRISMA = new Map<string, Map<string, string>>(); // enumName -> (displayValue -> memberName)

for (const e of Prisma.dmmf.datamodel.enums) {
  const toClient = new Map<string, string>();
  const toPrisma = new Map<string, string>();
  for (const v of e.values) {
    const display = (v as any).dbName ?? v.name;
    if (display !== v.name) {
      toClient.set(v.name, display);
      toPrisma.set(display, v.name);
    }
  }
  if (toClient.size > 0) {
    ENUM_TO_CLIENT.set(e.name, toClient);
    ENUM_TO_PRISMA.set(e.name, toPrisma);
  }
}

/** Enum-typed fields of a model, as fieldName -> enumName. */
function enumFieldsOf(modelName: string): Map<string, string> {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase(),
  );
  const result = new Map<string, string>();
  if (!model) return result;
  for (const f of model.fields) {
    if (f.kind === 'enum') result.set(f.name, f.type);
  }
  return result;
}

/**
 * Converts Prisma rows into the JSON shape the existing React code expects.
 *
 * Two conversions matter for correctness, not just cosmetics:
 *
 *  1. Decimal → number. Prisma returns `Decimal` objects which JSON-stringify
 *     to strings; the dashboard sums these with `+`, and string concatenation
 *     would silently produce wrong totals.
 *  2. `@db.Date` → "YYYY-MM-DD". Base44 returned bare date strings and the UI
 *     compares/splits them as such.
 */

function toDateOnly(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

export function serializeRecord<T extends Record<string, any>>(
  row: T | null,
  options: { dateOnly?: string[]; decimalFields?: Set<string>; modelName?: string },
): Record<string, any> | null {
  if (row === null || row === undefined) return null;

  const dateOnly = new Set(options.dateOnly ?? []);
  const decimals = options.decimalFields ?? new Set<string>();
  const enumFields = options.modelName ? enumFieldsOf(options.modelName) : new Map<string, string>();
  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = value ?? null;
      continue;
    }

    // Translate mapped enum members back to the value the UI expects.
    const enumName = enumFields.get(key);
    if (enumName) {
      const map = ENUM_TO_CLIENT.get(enumName);
      out[key] = (map && map.get(String(value))) ?? value;
      continue;
    }

    if (decimals.has(key) || value instanceof Prisma.Decimal) {
      // Number is safe here: all monetary columns are Decimal(18,2).
      out[key] = Number(value as any);
      continue;
    }

    if (dateOnly.has(key)) {
      out[key] = toDateOnly(value);
      continue;
    }

    out[key] = value instanceof Date ? value.toISOString() : value;
  }

  return out;
}

export function serializeMany<T extends Record<string, any>>(
  rows: T[],
  options: { dateOnly?: string[]; decimalFields?: Set<string>; modelName?: string },
): Record<string, any>[] {
  return rows.map((row) => serializeRecord(row, options) as Record<string, any>);
}

/**
 * Normalises inbound values before they reach Prisma.
 *
 * The UI posts dates as "YYYY-MM-DD" strings and numbers as JS numbers; Prisma
 * needs `Date` objects for DateTime columns and tolerates numbers for Decimal.
 * Empty strings are mapped to null so optional date/number columns clear
 * correctly instead of throwing.
 */
export function coerceInput(
  data: Record<string, any>,
  modelName: string,
): Record<string, any> {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase(),
  );
  if (!model) return data;

  const byName = new Map(model.fields.map((f) => [f.name, f]));
  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = byName.get(key);
    if (!field || field.kind === 'object') continue; // drop unknown/relation keys

    if (value === '' && !field.isRequired) {
      out[key] = null;
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }

    // Accept the UI's display value for mapped enums ("Quarterly Report")
    // as well as the Prisma member name ("Quarterly_Report").
    if (field.kind === 'enum') {
      const map = ENUM_TO_PRISMA.get(field.type);
      out[key] = (map && map.get(String(value))) ?? value;
      continue;
    }

    if (field.type === 'DateTime' && typeof value === 'string') {
      // "2026-03-01" → Date at UTC midnight; full ISO strings pass through.
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00.000Z`)
        : new Date(value);
      out[key] = Number.isNaN(parsed.getTime()) ? null : parsed;
      continue;
    }

    if ((field.type === 'Int' || field.type === 'Float') && typeof value === 'string') {
      const parsed = Number(value);
      out[key] = Number.isFinite(parsed) ? parsed : null;
      continue;
    }

    out[key] = value;
  }

  return out;
}

/**
 * Translates a single field value from the UI's enum vocabulary to Prisma's.
 * Used by filter building so `{ status: 'Quarterly Report' }` resolves.
 */
export function toPrismaEnumValue(
  modelName: string,
  field: string,
  value: unknown,
): unknown {
  const enumName = enumFieldsOf(modelName).get(field);
  if (!enumName) return value;
  const map = ENUM_TO_PRISMA.get(enumName);
  return (map && map.get(String(value))) ?? value;
}

/** Fields a client may never set directly. */
export const PROTECTED_FIELDS = new Set([
  'id',
  'created_date',
  'updated_date',
  'created_by',
  'password_hash',
  'tokens_valid_from',
]);

export function stripProtected(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (PROTECTED_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}
