/**
 * Direct port of docs/base44-legacy-reference/shared/notificationHelpers.ts.
 *
 * The recipient rules are business-critical and were verified in production on
 * Base44, so the logic here is kept deliberately identical — including the
 * legacy per-entity contact fallbacks. Only types and the digest's "View in
 * GrantOS" link (previously hardcoded to app.base44.com) have changed.
 */

export interface RecordContact {
  email: string;
  name: string;
  role: string;
  organization: string;
  is_active: boolean;
}

export interface ResolvedRecipient {
  email: string;
  name: string;
  source: 'Record Contact' | 'Additional Recipient';
}

export interface NotificationEvent {
  recordType: string;
  recordId: string;
  recordTitle: string;
  recordRef: string;
  partnerName: string;
  eventType: string;
  eventLabel: string;
  itemTitle: string;
  itemId: string;
  itemType: string;
  dueDate: string;
  daysRemaining: number;
  daysOverdue: number;
  isOverdue: boolean;
  amount: string;
  currency: string;
  status: string;
  ruleId: string;
  ruleName: string;
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export function todayInKolkata(timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Whole-day difference: target - today. Negative means overdue. */
export function diffDays(dateStr: string, today = todayInKolkata()): number {
  const todayDate = new Date(today);
  const target = new Date(dateStr);
  return Math.round((target.getTime() - todayDate.getTime()) / 86_400_000);
}

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Extracts active contacts from a record.
 * Preserves the legacy single-field fallbacks for MSA, SOW and MOU so records
 * created before the `contacts` array existed still notify the right people.
 */
export function extractContacts(record: any, recordType: string): RecordContact[] {
  if (!record) return [];
  const contacts = Array.isArray(record.contacts) ? record.contacts : [];

  const result: RecordContact[] = contacts
    .filter((c: any) => c && c.is_active !== false)
    .map((c: any) => ({
      email: c.email || '',
      name: c.name || '',
      role: c.role || '',
      organization: c.organization || '',
      is_active: c.is_active !== false,
    }));

  const alreadyPresent = (email: string) =>
    result.some((c) => normalizeEmail(c.email) === normalizeEmail(email));

  if (recordType === 'MSA') {
    if (record.vendor_contact_name && record.vendor_contact_email && !alreadyPresent(record.vendor_contact_email)) {
      result.push({
        email: record.vendor_contact_email,
        name: record.vendor_contact_name,
        role: 'Vendor Contact',
        organization: record.vendor_name || '',
        is_active: true,
      });
    }
    if (record.our_contact_name && record.our_contact_email && !alreadyPresent(record.our_contact_email)) {
      result.push({
        email: record.our_contact_email,
        name: record.our_contact_name,
        role: 'Our Contact',
        organization: '',
        is_active: true,
      });
    }
  }

  if (recordType === 'SOW' && record.vendor_email && !alreadyPresent(record.vendor_email)) {
    result.push({
      email: record.vendor_email,
      name: record.vendor_name || 'Vendor Contact',
      role: 'Vendor Contact',
      organization: record.vendor_name || '',
      is_active: true,
    });
  }

  if (recordType === 'MOU') {
    if (record.partner_contact_name && record.partner_contact_email && !alreadyPresent(record.partner_contact_email)) {
      result.push({
        email: record.partner_contact_email,
        name: record.partner_contact_name,
        role: 'Partner Contact',
        organization: record.partner_name || '',
        is_active: true,
      });
    }
    if (record.our_contact_name && record.our_contact_email && !alreadyPresent(record.our_contact_email)) {
      result.push({
        email: record.our_contact_email,
        name: record.our_contact_name,
        role: 'Our Contact',
        organization: '',
        is_active: true,
      });
    }
  }

  return result;
}

/**
 * Resolves the final recipient list.
 * Record contacts win over additional recipients for the `source` label, and
 * an address listed in both appears exactly once.
 */
export function resolveRecipients(
  recordContacts: RecordContact[],
  additionalEmails: string[],
): {
  valid: ResolvedRecipient[];
  invalid: Array<{ email: string; reason: string; name?: string }>;
  duplicates: string[];
} {
  const byEmail = new Map<string, ResolvedRecipient>();
  const invalid: Array<{ email: string; reason: string; name?: string }> = [];
  const duplicates: string[] = [];

  for (const c of recordContacts) {
    const norm = normalizeEmail(c.email);
    if (!norm) {
      invalid.push({ email: c.email || '(empty)', reason: 'No email address', name: c.name });
      continue;
    }
    if (!isValidEmail(norm)) {
      invalid.push({ email: c.email, reason: 'Invalid email format', name: c.name });
      continue;
    }
    if (byEmail.has(norm)) {
      duplicates.push(norm);
      continue;
    }
    byEmail.set(norm, { email: norm, name: c.name || '', source: 'Record Contact' });
  }

  for (const raw of additionalEmails ?? []) {
    const norm = normalizeEmail(raw);
    if (!norm || !isValidEmail(norm)) {
      invalid.push({ email: raw || '(empty)', reason: 'Invalid email format' });
      continue;
    }
    if (byEmail.has(norm)) {
      duplicates.push(norm);
      continue;
    }
    byEmail.set(norm, { email: norm, name: '', source: 'Additional Recipient' });
  }

  return {
    valid: Array.from(byEmail.values()),
    invalid,
    duplicates: [...new Set(duplicates)],
  };
}

export function renderTemplate(
  template: { subject: string; body: string },
  vars: Record<string, unknown>,
): { subject: string; body: string } {
  let subject = template.subject || '';
  let body = template.body || '';
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`{{${key}}}`, 'g');
    const safe = (value ?? '').toString();
    subject = subject.replace(re, safe);
    body = body.replace(re, safe);
  }
  return { subject, body };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a per-recipient digest email.
 *
 * Record titles and item names are escaped here — on Base44 they were
 * interpolated raw, which let a document name containing markup alter the
 * email body.
 */
export function buildDigestEmail(
  events: NotificationEvent[],
  recipient: { name?: string; source?: string },
  today: string,
  appUrl: string,
): { subject: string; body: string } {
  const sections = new Map<string, { label: string; items: NotificationEvent[] }>();

  for (const ev of events) {
    const key =
      ev.eventType === 'document_review'
        ? ev.eventLabel
        : `${ev.isOverdue ? 'Overdue' : 'Upcoming'} ${ev.eventLabel}`;
    if (!sections.has(key)) sections.set(key, { label: key, items: [] });
    sections.get(key)!.items.push(ev);
  }

  let body = `<div style="font-family: sans-serif; max-width: 600px;">`;
  body += `<p>Dear ${escapeHtml(recipient.name || 'Team')},</p>`;
  body += `<p>Here is your notification digest for <strong>${escapeHtml(today)}</strong>:</p>`;

  let totalItems = 0;
  for (const sec of sections.values()) {
    totalItems += sec.items.length;
    const color = sec.items[0].isOverdue ? '#dc2626' : '#2563eb';
    body += `<h3 style="color: ${color};">${escapeHtml(sec.label)} (${sec.items.length})</h3><ul>`;

    for (const ev of sec.items) {
      body += `<li style="margin-bottom: 8px;">`;
      body += `<strong>${escapeHtml(ev.itemTitle)}</strong>`;
      body += ` — ${escapeHtml(ev.recordType)}: ${escapeHtml(ev.recordTitle)}`;
      if (ev.recordRef) body += ` (Ref: ${escapeHtml(ev.recordRef)})`;
      if (ev.partnerName) body += ` — ${escapeHtml(ev.partnerName)}`;

      if (ev.eventType === 'document_review') {
        body += `<br>Pending review for <strong>${ev.daysOverdue} day${ev.daysOverdue === 1 ? '' : 's'}</strong>`;
      } else {
        body += `<br>Due: <strong>${escapeHtml(ev.dueDate)}</strong>`;
        body += ev.isOverdue
          ? ` (${ev.daysOverdue} day${ev.daysOverdue === 1 ? '' : 's'} overdue)`
          : ` (${ev.daysRemaining} day${ev.daysRemaining === 1 ? '' : 's'} remaining)`;
      }

      if (ev.amount) body += `<br>Amount: ${escapeHtml(ev.currency || 'USD')} ${escapeHtml(ev.amount)}`;
      if (ev.status) body += ` — Status: ${escapeHtml(ev.status)}`;
      body += `<br><a href="${escapeHtml(appUrl)}">View in GrantOS</a>`;
      body += `</li>`;
    }
    body += `</ul>`;
  }

  if (totalItems === 0) {
    body += `<p><em>No items require action today.</em></p>`;
  }

  body += `<hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">`;
  body +=
    recipient.source === 'Record Contact'
      ? `<p style="font-size: 12px; color: #6b7280;">You are receiving this notification because you are listed as a contact for this record.</p>`
      : `<p style="font-size: 12px; color: #6b7280;">You are receiving this notification because you are configured as an additional notification recipient.</p>`;
  body += `</div>`;

  return {
    subject: `[GrantOS] Daily Digest – ${today} (${totalItems} item${totalItems === 1 ? '' : 's'})`,
    body,
  };
}

/** Default rules used when no NotificationRule rows are enabled. */
export const DEFAULT_RULES = [
  { id: 'default_milestone_due', name: 'Milestone Due Reminder', trigger_type: 'milestone_due', reminder_days_before: [15, 7, 1, 0], overdue_frequency_days: 7 },
  { id: 'default_deliverable_due', name: 'Deliverable Due Reminder', trigger_type: 'deliverable_due', reminder_days_before: [7, 1, 0], overdue_frequency_days: 7 },
  { id: 'default_reporting_due', name: 'Reporting Obligation Reminder', trigger_type: 'reporting_due', reminder_days_before: [15, 7, 0], overdue_frequency_days: 7 },
  { id: 'default_payment_due', name: 'Payment / Disbursement Reminder', trigger_type: 'payment_due', reminder_days_before: [7, 0], overdue_frequency_days: 7 },
  { id: 'default_contract_expiry', name: 'Contract / Agreement Expiry', trigger_type: 'contract_expiry', reminder_days_before: [30, 15, 7], overdue_frequency_days: 0 },
  { id: 'default_document_review', name: 'Document Review Reminder', trigger_type: 'document_review', reminder_days_before: [], overdue_frequency_days: 7 },
] as const;

export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  milestone_upcoming: {
    subject: '[GrantOS] Milestone Due in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Milestone <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  milestone_overdue: {
    subject: '[GrantOS] OVERDUE Milestone – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Milestone <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong> (was due {{due_date}}).</p><p>Status: {{status}}</p><p>Please take immediate action.</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  deliverable_upcoming: {
    subject: '[GrantOS] Deliverable Due in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Deliverable <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  deliverable_overdue: {
    subject: '[GrantOS] OVERDUE Deliverable – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Deliverable <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  reporting_upcoming: {
    subject: '[GrantOS] Reporting Deadline in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Report <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  reporting_overdue: {
    subject: '[GrantOS] OVERDUE Report – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Report <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  payment_upcoming: {
    subject: '[GrantOS] Payment Due in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Payment <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Amount: {{currency}} {{amount}}<br>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  payment_overdue: {
    subject: '[GrantOS] OVERDUE Payment – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Payment <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p><p>Amount: {{currency}} {{amount}}<br>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  contract_expiry: {
    subject: '[GrantOS] {{record_type}} Expiring in {{days_remaining}} Days – {{record_title}}',
    body: `<p>Dear Team,</p><p><strong>{{record_type}}: {{record_title}}</strong> is expiring on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p>Please review and take renewal action if required.</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  document_review: {
    subject: '[GrantOS] Document Pending Review – {{item_title}}',
    body: `<p>Dear Team,</p><p>Document <strong>{{item_title}}</strong> (module: {{record_type}}) is pending review.</p><p>Status: {{status}}<br>{{description}}</p><p>Please review and approve or reject this document.</p><p><a href="{{app_link}}">View in GrantOS</a></p>`,
  },
  test_email: {
    subject: '[GrantOS] Test Email – Notification System Active',
    body: `<p>Hello,</p><p>This is a test email from GrantOS to confirm that your notification system is working correctly.</p><p>If you received this email, your notification recipients are properly configured.</p><p>Sent at: {{due_date}}</p>`,
  },
};
