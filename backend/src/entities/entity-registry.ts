/**
 * Registry mapping every Base44 entity name to its Prisma delegate, access
 * rules and serialisation hints.
 *
 * The React UI calls `api.entities.<Name>.<method>()` using the *Base44* entity
 * names, so those names stay the public contract. Permissions below are a
 * direct translation of the `rls` blocks in
 * docs/base44-legacy-reference/entities/*.jsonc — deliberately unchanged so the
 * app behaves exactly as it did on Base44.
 */

/** Who may perform an operation. */
export type Access = 'any' | 'admin';

/** Modules that `User.allowed_modules` can restrict. */
export type ModuleName = 'Grants' | 'SOWs' | 'MSAs' | 'MOUs';

export interface EntityDefinition {
  /** Key on PrismaClient, e.g. `grant` for prisma.grant. */
  delegate: string;
  create: Access;
  read: Access;
  update: Access;
  delete: Access;
  /** Module gate from User.allowed_modules; undefined = never gated. */
  module?: ModuleName;
  /**
   * Fields declared `@db.Date` in schema.prisma. Serialised as `YYYY-MM-DD`
   * rather than a full ISO timestamp, matching what Base44 returned and what
   * the existing UI parses.
   */
  dateOnly?: string[];
  /** Entities users must not create/update directly through the generic CRUD. */
  readOnlyForClients?: boolean;
}

export const ENTITY_REGISTRY: Record<string, EntityDefinition> = {
  // ── Grants ────────────────────────────────────────────────────────────────
  Grant: {
    delegate: 'grant',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
    dateOnly: ['start_date', 'end_date'],
  },
  Milestone: {
    delegate: 'milestone',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
    dateOnly: ['due_date', 'paid_date'],
  },
  GrantDeliverable: {
    delegate: 'grantDeliverable',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
    dateOnly: ['due_date'],
  },
  GrantTranche: {
    delegate: 'grantTranche',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
    dateOnly: ['invoice_trigger_date', 'due_date', 'invoice_date', 'received_date'],
  },
  GrantReportingObligation: {
    delegate: 'grantReportingObligation',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
    dateOnly: ['due_date', 'submitted_date'],
  },
  ReportingDeadline: {
    delegate: 'reportingDeadline',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
    dateOnly: ['due_date'],
  },
  GrantHealthScoreConfig: {
    delegate: 'grantHealthScoreConfig',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
  },
  GrantHealthScoreSnapshot: {
    delegate: 'grantHealthScoreSnapshot',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'Grants',
  },

  // ── MOU ───────────────────────────────────────────────────────────────────
  MOU: {
    delegate: 'mou',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'MOUs',
    dateOnly: ['signed_date', 'effective_date', 'end_date'],
  },
  MouCommitment: {
    delegate: 'mouCommitment',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'MOUs',
    dateOnly: ['due_date'],
  },

  // ── MSA ───────────────────────────────────────────────────────────────────
  MSA: {
    delegate: 'msa',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'MSAs',
    dateOnly: ['effective_date', 'end_date'],
  },
  MsaKeyClause: {
    delegate: 'msaKeyClause',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'MSAs',
  },

  // ── SOW ───────────────────────────────────────────────────────────────────
  SOW: {
    delegate: 'sow',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'SOWs',
    dateOnly: ['start_date', 'end_date'],
  },
  SowMilestone: {
    delegate: 'sowMilestone',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'SOWs',
    dateOnly: ['due_date'],
  },
  SowDeliverable: {
    delegate: 'sowDeliverable',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'SOWs',
    dateOnly: ['due_date'],
  },
  SowInvoice: {
    delegate: 'sowInvoice',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
    module: 'SOWs',
    dateOnly: ['invoice_date', 'due_date', 'paid_date'],
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  DocumentUploadLog: {
    delegate: 'documentUploadLog',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
  },
  DocumentValidationLog: {
    delegate: 'documentValidationLog',
    create: 'any',
    read: 'any',
    update: 'admin',
    delete: 'admin',
  },

  // ── Settings, notifications, audit (admin-only, as on Base44) ─────────────
  AppSettings: {
    // Base44 made this admin-only for reads, but Layout.jsx loads it for every
    // signed-in user to render the environment banner. Reads are allowed and
    // `alert_emails` is redacted for non-admins (see EntitiesService.redact),
    // so the recipient list still never leaves the admin scope.
    delegate: 'appSettings',
    create: 'admin',
    read: 'any',
    update: 'admin',
    delete: 'admin',
  },
  NotificationRule: {
    delegate: 'notificationRule',
    create: 'admin',
    read: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  NotificationTemplate: {
    delegate: 'notificationTemplate',
    create: 'admin',
    read: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  NotificationLog: {
    delegate: 'notificationLog',
    create: 'admin',
    read: 'admin',
    update: 'admin',
    delete: 'admin',
    dateOnly: ['scheduled_for_date'],
  },
  AuditLog: {
    // Base44 allowed any authenticated user to write an audit entry but only
    // admins to read them.
    delegate: 'auditLog',
    create: 'any',
    read: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  CleanupLog: {
    delegate: 'cleanupLog',
    create: 'admin',
    read: 'admin',
    update: 'admin',
    delete: 'admin',
  },
};

export function getEntityDefinition(name: string): EntityDefinition | undefined {
  // Guard against prototype-pollution style lookups (`__proto__`, `constructor`).
  if (!Object.prototype.hasOwnProperty.call(ENTITY_REGISTRY, name)) return undefined;
  return ENTITY_REGISTRY[name];
}

export const ENTITY_NAMES = Object.keys(ENTITY_REGISTRY);
