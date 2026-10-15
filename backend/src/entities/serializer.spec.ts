/**
 * Tests for the data-shape translation between Prisma and the React UI.
 *
 * These guard the three conversions that silently corrupt the app when wrong:
 *  - Decimal columns must reach the browser as numbers (the dashboard sums them)
 *  - `@db.Date` columns must be bare YYYY-MM-DD strings
 *  - mapped enum values ("Quarterly Report") must survive a round trip
 */
import { Prisma } from '@prisma/client';
import {
  coerceInput,
  serializeMany,
  serializeRecord,
  stripProtected,
  toPrismaEnumValue,
} from './serializer';
import { buildOrderBy, buildWhere, clampLimit, scalarFieldsOf } from './query-translator';

describe('serializeRecord', () => {
  it('converts Decimal to a number so totals can be summed', () => {
    const row = { id: '1', total_amount: new Prisma.Decimal('1250000.50') };
    const out = serializeRecord(row, {
      decimalFields: new Set(['total_amount']),
      modelName: 'Grant',
    })!;
    expect(typeof out.total_amount).toBe('number');
    expect(out.total_amount).toBeCloseTo(1250000.5, 2);
    // The bug this prevents: "1250000.50" + 0 === "1250000.500"
    expect(out.total_amount + 0).toBeCloseTo(1250000.5, 2);
  });

  it('renders date-only columns as YYYY-MM-DD', () => {
    const row = { id: '1', start_date: new Date('2026-03-01T00:00:00.000Z') };
    const out = serializeRecord(row, { dateOnly: ['start_date'], modelName: 'Grant' })!;
    expect(out.start_date).toBe('2026-03-01');
  });

  it('renders timestamps as full ISO strings', () => {
    const row = { id: '1', created_date: new Date('2026-03-01T10:30:00.000Z') };
    const out = serializeRecord(row, { modelName: 'Grant' })!;
    expect(out.created_date).toBe('2026-03-01T10:30:00.000Z');
  });

  it('translates mapped enum members to the value the UI expects', () => {
    const row = { id: '1', obligation_type: 'Quarterly_Report' };
    const out = serializeRecord(row, { modelName: 'GrantReportingObligation' })!;
    expect(out.obligation_type).toBe('Quarterly Report');
  });

  it('leaves unmapped enum values untouched', () => {
    const row = { id: '1', status: 'active' };
    const out = serializeRecord(row, { modelName: 'Grant' })!;
    expect(out.status).toBe('active');
  });

  it('preserves nulls rather than dropping the key', () => {
    const out = serializeRecord({ id: '1', funder: null }, { modelName: 'Grant' })!;
    expect(out).toHaveProperty('funder', null);
  });

  it('passes JSON columns through unchanged', () => {
    const contacts = [{ name: 'A', email: 'a@example.org', is_active: true }];
    const out = serializeRecord({ id: '1', contacts }, { modelName: 'Grant' })!;
    expect(out.contacts).toEqual(contacts);
  });

  it('returns null for a missing row', () => {
    expect(serializeRecord(null, {})).toBeNull();
  });

  it('serializes collections', () => {
    const rows = [{ id: '1', start_date: new Date('2026-01-01T00:00:00Z') }];
    expect(serializeMany(rows, { dateOnly: ['start_date'], modelName: 'Grant' })[0].start_date)
      .toBe('2026-01-01');
  });
});

describe('coerceInput', () => {
  it('parses a YYYY-MM-DD string into a Date', () => {
    const out = coerceInput({ start_date: '2026-03-01' }, 'Grant');
    expect(out.start_date).toBeInstanceOf(Date);
    expect((out.start_date as Date).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('maps an empty string on an optional column to null, so dates can be cleared', () => {
    expect(coerceInput({ end_date: '' }, 'Grant').end_date).toBeNull();
  });

  it('accepts the UI vocabulary for mapped enums', () => {
    const out = coerceInput({ obligation_type: 'Quarterly Report' }, 'GrantReportingObligation');
    expect(out.obligation_type).toBe('Quarterly_Report');
  });

  it('also accepts the Prisma member name for mapped enums', () => {
    const out = coerceInput({ obligation_type: 'Quarterly_Report' }, 'GrantReportingObligation');
    expect(out.obligation_type).toBe('Quarterly_Report');
  });

  it('drops keys that are not columns of the model', () => {
    const out = coerceInput({ title: 'ok', not_a_column: 'x' }, 'Grant');
    expect(out).toHaveProperty('title');
    expect(out).not.toHaveProperty('not_a_column');
  });

  it('coerces numeric strings on numeric columns', () => {
    expect(coerceInput({ notification_days_before: '14' }, 'Grant').notification_days_before).toBe(14);
  });
});

describe('stripProtected', () => {
  it('removes fields a client must never set', () => {
    const out = stripProtected({
      title: 'Keep', id: 'nope', created_date: 'nope',
      created_by: 'nope', password_hash: 'nope',
    });
    expect(out).toEqual({ title: 'Keep' });
  });
});

describe('toPrismaEnumValue', () => {
  it('translates a display value for a known enum field', () => {
    expect(toPrismaEnumValue('GrantReportingObligation', 'obligation_type', 'Audit Submission'))
      .toBe('Audit_Submission');
  });
  it('returns non-enum values unchanged', () => {
    expect(toPrismaEnumValue('Grant', 'title', 'Some Grant')).toBe('Some Grant');
  });
});

describe('query translation', () => {
  const grantFields = scalarFieldsOf('Grant');

  it('maps "-field" to descending order', () => {
    expect(buildOrderBy('-created_date', grantFields)).toEqual({ created_date: 'desc' });
  });
  it('maps a bare field to ascending order', () => {
    expect(buildOrderBy('title', grantFields)).toEqual({ title: 'asc' });
  });
  it('rejects sorting by an unknown field', () => {
    expect(() => buildOrderBy('; DROP TABLE grants', grantFields)).toThrow(/unknown field/i);
  });
  it('returns undefined when no sort is given', () => {
    expect(buildOrderBy(undefined, grantFields)).toBeUndefined();
  });

  it('passes equality filters through', () => {
    expect(buildWhere({ status: 'active' }, grantFields)).toEqual({ status: 'active' });
  });
  it('translates $in', () => {
    expect(buildWhere({ status: { $in: ['active', 'pending'] } }, grantFields))
      .toEqual({ status: { in: ['active', 'pending'] } });
  });
  it('treats a bare array as $in, as Base44 did', () => {
    expect(buildWhere({ status: ['active'] }, grantFields)).toEqual({ status: { in: ['active'] } });
  });
  it('translates comparison operators', () => {
    expect(buildWhere({ end_date: { $gte: '2026-01-01' } }, grantFields))
      .toEqual({ end_date: { gte: '2026-01-01' } });
  });
  it('rejects an unknown field, blocking crafted filters', () => {
    expect(() => buildWhere({ 'user.password_hash': 'x' }, grantFields)).toThrow(/unknown field/i);
  });
  it('rejects an unsupported operator', () => {
    expect(() => buildWhere({ status: { $where: 'x' } }, grantFields)).toThrow(/operator/i);
  });

  it('clamps limits into a safe range', () => {
    expect(clampLimit(50)).toBe(50);
    expect(clampLimit(999999)).toBe(5000);
    expect(clampLimit(undefined)).toBe(1000);
    expect(clampLimit(-1)).toBe(1000);
    expect(clampLimit('abc')).toBe(1000);
  });
});
