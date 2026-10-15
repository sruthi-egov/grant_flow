/**
 * Guards the access-control table against drift.
 *
 * The registry is the single place that decides who may read or write each
 * entity, so these tests assert the rules translated from the Base44 `rls`
 * blocks are still in force and that every entry points at a real Prisma model.
 */
import { PrismaClient } from '@prisma/client';
import { ENTITY_NAMES, ENTITY_REGISTRY, getEntityDefinition } from './entity-registry';

describe('entity registry', () => {
  it('covers every entity the UI calls', () => {
    // Names the React client sends to /api/entities/:entity.
    const usedByUi = [
      'Grant', 'Milestone', 'GrantDeliverable', 'GrantTranche',
      'GrantReportingObligation', 'ReportingDeadline',
      'GrantHealthScoreConfig', 'GrantHealthScoreSnapshot',
      'MOU', 'MouCommitment', 'MSA', 'MsaKeyClause',
      'SOW', 'SowMilestone', 'SowDeliverable', 'SowInvoice',
      'DocumentUploadLog', 'DocumentValidationLog',
      'AppSettings', 'NotificationRule', 'NotificationTemplate', 'NotificationLog',
      'AuditLog', 'CleanupLog',
    ];
    for (const name of usedByUi) {
      expect(ENTITY_NAMES).toContain(name);
    }
  });

  it('points every entry at a real Prisma delegate', () => {
    const prisma = new PrismaClient();
    for (const [name, def] of Object.entries(ENTITY_REGISTRY)) {
      expect((prisma as any)[def.delegate]).toBeDefined();
      expect(typeof (prisma as any)[def.delegate].findMany).toBe('function');
      expect(name).toBeTruthy();
    }
  });

  it('restricts writes on business records to admins, as Base44 did', () => {
    for (const name of ['Grant', 'MOU', 'MSA', 'SOW', 'Milestone']) {
      expect(ENTITY_REGISTRY[name].update).toBe('admin');
      expect(ENTITY_REGISTRY[name].delete).toBe('admin');
    }
  });

  it('keeps notification and settings tables admin-only for writes', () => {
    for (const name of ['AppSettings', 'NotificationRule', 'NotificationTemplate', 'CleanupLog']) {
      expect(ENTITY_REGISTRY[name].create).toBe('admin');
      expect(ENTITY_REGISTRY[name].update).toBe('admin');
    }
  });

  it('keeps audit and notification logs unreadable by ordinary users', () => {
    expect(ENTITY_REGISTRY.AuditLog.read).toBe('admin');
    expect(ENTITY_REGISTRY.NotificationLog.read).toBe('admin');
  });

  it('still lets any signed-in user write an audit entry', () => {
    // The UI calls logAudit() from ordinary user actions.
    expect(ENTITY_REGISTRY.AuditLog.create).toBe('any');
  });

  it('gates each module-scoped entity to the right module', () => {
    expect(ENTITY_REGISTRY.Grant.module).toBe('Grants');
    expect(ENTITY_REGISTRY.Milestone.module).toBe('Grants');
    expect(ENTITY_REGISTRY.SOW.module).toBe('SOWs');
    expect(ENTITY_REGISTRY.SowInvoice.module).toBe('SOWs');
    expect(ENTITY_REGISTRY.MSA.module).toBe('MSAs');
    expect(ENTITY_REGISTRY.MOU.module).toBe('MOUs');
    expect(ENTITY_REGISTRY.MouCommitment.module).toBe('MOUs');
  });

  it('does not expose the User table through generic CRUD', () => {
    // Users are served by /api/users, which never returns password_hash.
    expect(ENTITY_NAMES).not.toContain('User');
  });

  it('refuses prototype-pollution style lookups', () => {
    expect(getEntityDefinition('__proto__')).toBeUndefined();
    expect(getEntityDefinition('constructor')).toBeUndefined();
    expect(getEntityDefinition('toString')).toBeUndefined();
  });

  it('returns undefined for an unknown entity', () => {
    expect(getEntityDefinition('NotAnEntity')).toBeUndefined();
  });
});
