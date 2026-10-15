/**
 * Tests for the notification recipient rules.
 *
 * These were the highest-risk part of the migration: they decide who receives
 * email, and the legacy per-entity contact fallbacks are easy to drop silently
 * when porting. Each case below mirrors the behaviour of the original Base44
 * implementation in docs/base44-legacy-reference/shared/notificationHelpers.ts.
 */
import {
  buildDigestEmail,
  diffDays,
  extractContacts,
  isValidEmail,
  normalizeEmail,
  renderTemplate,
  resolveRecipients,
  todayInKolkata,
  type NotificationEvent,
} from './notification-helpers';

describe('email validation', () => {
  it.each([
    ['person@example.org', true],
    ['  Person@Example.ORG  ', true],
    ['no-at-sign', false],
    ['missing@domain', false],
    ['@example.org', false],
    ['', false],
  ])('isValidEmail(%s) === %s', (input, expected) => {
    expect(isValidEmail(normalizeEmail(input as string))).toBe(expected);
  });

  it('normalises case and whitespace', () => {
    expect(normalizeEmail('  Alice@Example.ORG ')).toBe('alice@example.org');
  });
});

describe('extractContacts', () => {
  it('returns active contacts from the contacts array', () => {
    const record = {
      contacts: [
        { name: 'Active One', email: 'a@example.org', is_active: true },
        { name: 'No Flag', email: 'b@example.org' },
      ],
    };
    expect(extractContacts(record, 'Grant')).toHaveLength(2);
  });

  it('excludes contacts explicitly marked inactive', () => {
    const record = {
      contacts: [
        { name: 'Active', email: 'a@example.org', is_active: true },
        { name: 'Inactive', email: 'b@example.org', is_active: false },
      ],
    };
    const result = extractContacts(record, 'Grant');
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('a@example.org');
  });

  it('falls back to legacy MSA vendor/our contact fields', () => {
    const msa = {
      contacts: [],
      vendor_name: 'Vendor Ltd',
      vendor_contact_name: 'Vic Vendor',
      vendor_contact_email: 'vic@vendor.example',
      our_contact_name: 'Ophelia Ours',
      our_contact_email: 'ophelia@us.example',
    };
    const result = extractContacts(msa, 'MSA');
    expect(result.map((c) => c.email).sort()).toEqual([
      'ophelia@us.example',
      'vic@vendor.example',
    ]);
  });

  it('falls back to the legacy SOW vendor_email', () => {
    const sow = { contacts: [], vendor_name: 'Vendor Ltd', vendor_email: 'billing@vendor.example' };
    const result = extractContacts(sow, 'SOW');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('Vendor Contact');
  });

  it('falls back to legacy MOU partner/our contact fields', () => {
    const mou = {
      contacts: [],
      partner_name: 'Partner Org',
      partner_contact_name: 'Pat Partner',
      partner_contact_email: 'pat@partner.example',
      our_contact_name: 'Ollie Ours',
      our_contact_email: 'ollie@us.example',
    };
    expect(extractContacts(mou, 'MOU')).toHaveLength(2);
  });

  it('does not duplicate a legacy contact already in the contacts array', () => {
    const msa = {
      contacts: [{ name: 'Vic', email: 'VIC@vendor.example', is_active: true }],
      vendor_contact_name: 'Vic Vendor',
      vendor_contact_email: 'vic@vendor.example',
    };
    expect(extractContacts(msa, 'MSA')).toHaveLength(1);
  });

  it('returns an empty list for a missing record', () => {
    expect(extractContacts(null, 'Grant')).toEqual([]);
  });
});

describe('resolveRecipients', () => {
  const contact = (email: string, name = '') => ({
    email, name, role: '', organization: '', is_active: true,
  });

  it('labels record contacts and additional recipients separately', () => {
    const { valid } = resolveRecipients(
      [contact('owner@example.org', 'Owner')],
      ['watcher@example.org'],
    );
    expect(valid).toEqual([
      { email: 'owner@example.org', name: 'Owner', source: 'Record Contact' },
      { email: 'watcher@example.org', name: '', source: 'Additional Recipient' },
    ]);
  });

  it('keeps Record Contact when the same address is also an additional recipient', () => {
    const { valid, duplicates } = resolveRecipients(
      [contact('both@example.org', 'Both')],
      ['BOTH@example.org'],
    );
    expect(valid).toHaveLength(1);
    expect(valid[0].source).toBe('Record Contact');
    expect(duplicates).toContain('both@example.org');
  });

  it('de-duplicates case- and whitespace-variant addresses', () => {
    const { valid } = resolveRecipients(
      [contact('Person@Example.org'), contact('  person@example.org  ')],
      [],
    );
    expect(valid).toHaveLength(1);
  });

  it('separates invalid addresses instead of sending to them', () => {
    const { valid, invalid } = resolveRecipients(
      [contact('good@example.org'), contact('not-an-email'), contact('')],
      [],
    );
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(2);
    expect(invalid.map((i) => i.reason)).toEqual(
      expect.arrayContaining(['Invalid email format', 'No email address']),
    );
  });

  it('tolerates a missing additional-recipients list', () => {
    expect(() => resolveRecipients([contact('a@example.org')], undefined as any)).not.toThrow();
  });
});

describe('diffDays', () => {
  it('returns 0 for today', () => {
    expect(diffDays('2026-06-15', '2026-06-15')).toBe(0);
  });
  it('returns a positive number for a future date', () => {
    expect(diffDays('2026-06-22', '2026-06-15')).toBe(7);
  });
  it('returns a negative number for an overdue date', () => {
    expect(diffDays('2026-06-08', '2026-06-15')).toBe(-7);
  });
  it('crosses month boundaries correctly', () => {
    expect(diffDays('2026-07-01', '2026-06-29')).toBe(2);
  });
});

describe('todayInKolkata', () => {
  it('produces a YYYY-MM-DD string', () => {
    expect(todayInKolkata()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('renderTemplate', () => {
  it('substitutes every occurrence of a placeholder', () => {
    const out = renderTemplate(
      { subject: '{{item_title}} due', body: '{{item_title}} on {{due_date}} ({{item_title}})' },
      { item_title: 'Report A', due_date: '2026-06-15' },
    );
    expect(out.subject).toBe('Report A due');
    expect(out.body).toBe('Report A on 2026-06-15 (Report A)');
  });

  it('renders missing values as an empty string, not "undefined"', () => {
    const out = renderTemplate({ subject: 'x {{missing}}', body: '' }, {});
    expect(out.subject).toBe('x {{missing}}');
  });
});

describe('buildDigestEmail', () => {
  const event = (overrides: Partial<NotificationEvent> = {}): NotificationEvent => ({
    recordType: 'Grant', recordId: 'g1', recordTitle: 'Demo Grant', recordRef: 'G-1',
    partnerName: 'Funder', eventType: 'milestone_due', eventLabel: 'Milestones',
    itemTitle: 'Milestone A', itemId: 'm1', itemType: 'Milestone',
    dueDate: '2026-06-20', daysRemaining: 5, daysOverdue: 0, isOverdue: false,
    amount: '1000', currency: 'USD', status: 'pending',
    ruleId: 'r1', ruleName: 'Rule', ...overrides,
  });

  it('groups upcoming and overdue items into separate sections', () => {
    const { body } = buildDigestEmail(
      [event(), event({ itemTitle: 'Milestone B', isOverdue: true, daysOverdue: 3 })],
      { name: 'Alice', source: 'Record Contact' },
      '2026-06-15',
      'http://localhost:5173',
    );
    expect(body).toContain('Upcoming Milestones (1)');
    expect(body).toContain('Overdue Milestones (1)');
  });

  it('counts items in the subject', () => {
    const { subject } = buildDigestEmail(
      [event(), event({ itemId: 'm2' })],
      { name: 'Alice' },
      '2026-06-15',
      'http://localhost:5173',
    );
    expect(subject).toContain('2026-06-15');
    expect(subject).toContain('(2 items)');
  });

  it('links to the configured app URL, not the old hosted platform', () => {
    const { body } = buildDigestEmail(
      [event()], { name: 'Alice' }, '2026-06-15', 'https://grants.example.org',
    );
    expect(body).toContain('https://grants.example.org');
    expect(body.toLowerCase()).not.toContain('base44');
  });

  it('escapes markup in record-supplied text', () => {
    const { body } = buildDigestEmail(
      [event({ itemTitle: '<img src=x onerror=alert(1)>' })],
      { name: 'Alice' },
      '2026-06-15',
      'http://localhost:5173',
    );
    expect(body).not.toContain('<img src=x');
    expect(body).toContain('&lt;img src=x');
  });

  it('explains why the recipient is receiving the email', () => {
    const asContact = buildDigestEmail([event()], { source: 'Record Contact' }, '2026-06-15', 'u');
    expect(asContact.body).toContain('listed as a contact');

    const asExtra = buildDigestEmail([event()], { source: 'Additional Recipient' }, '2026-06-15', 'u');
    expect(asExtra.body).toContain('additional notification recipient');
  });
});
