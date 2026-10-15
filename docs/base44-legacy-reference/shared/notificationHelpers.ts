// ─── Shared notification helpers — used by sendNotifications & sendTestNotification ──

// Timezone: today's date in Asia/Kolkata as YYYY-MM-DD
export function todayInKolkata() {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

// Whole-day difference: target - today (negative = overdue)
export function diffDays(dateStr) {
  const today = new Date(todayInKolkata());
  const target = new Date(dateStr);
  return Math.round((target - today) / 86400000);
}

// RFC 5322 simplified email validation
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// ─── Extract active contacts from a record ──────────────────────────────────
// Returns [{ email, name, role, organization, is_active }]
// Handles legacy fields for MSA (vendor_contact_*, our_contact_*) and SOW (vendor_email).
export function extractContacts(record, recordType) {
  if (!record) return [];
  const contacts = Array.isArray(record.contacts) ? record.contacts : [];

  // Normalise contacts array entries
  const result = contacts
    .filter(c => c && c.is_active !== false) // active unless explicitly false
    .map(c => ({
      email: c.email || '',
      name: c.name || '',
      role: c.role || '',
      organization: c.organization || '',
      is_active: c.is_active !== false
    }));

  // Legacy fallback: MSA individual contact fields
  if (recordType === 'MSA') {
    if (record.vendor_contact_name && record.vendor_contact_email) {
      if (!result.some(c => normalizeEmail(c.email) === normalizeEmail(record.vendor_contact_email))) {
        result.push({
          email: record.vendor_contact_email,
          name: record.vendor_contact_name,
          role: 'Vendor Contact',
          organization: record.vendor_name || '',
          is_active: true
        });
      }
    }
    if (record.our_contact_name && record.our_contact_email) {
      if (!result.some(c => normalizeEmail(c.email) === normalizeEmail(record.our_contact_email))) {
        result.push({
          email: record.our_contact_email,
          name: record.our_contact_name,
          role: 'Our Contact',
          organization: '',
          is_active: true
        });
      }
    }
  }

  // Legacy fallback: SOW vendor_email
  if (recordType === 'SOW' && record.vendor_email) {
    if (!result.some(c => normalizeEmail(c.email) === normalizeEmail(record.vendor_email))) {
      result.push({
        email: record.vendor_email,
        name: record.vendor_name || 'Vendor Contact',
        role: 'Vendor Contact',
        organization: record.vendor_name || '',
        is_active: true
      });
    }
  }

  // Legacy fallback: MOU partner_contact_email / our_contact_email
  if (recordType === 'MOU') {
    if (record.partner_contact_name && record.partner_contact_email) {
      if (!result.some(c => normalizeEmail(c.email) === normalizeEmail(record.partner_contact_email))) {
        result.push({
          email: record.partner_contact_email,
          name: record.partner_contact_name,
          role: 'Partner Contact',
          organization: record.partner_name || '',
          is_active: true
        });
      }
    }
    if (record.our_contact_name && record.our_contact_email) {
      if (!result.some(c => normalizeEmail(c.email) === normalizeEmail(record.our_contact_email))) {
        result.push({
          email: record.our_contact_email,
          name: record.our_contact_name,
          role: 'Our Contact',
          organization: '',
          is_active: true
        });
      }
    }
  }

  return result;
}

// ─── Resolve final recipient list ───────────────────────────────────────────
// recordContacts: output of extractContacts()
// additionalEmails: string[] from AppSettings.alert_emails
// Returns: { valid: [{email, name, source}], invalid: [{email, reason}], duplicates: [email] }
export function resolveRecipients(recordContacts, additionalEmails) {
  const byEmail = new Map(); // normalized email -> {email, name, source}
  const invalid = [];
  const duplicates = [];
  const seenNormalized = new Set();

  // 1. Record contacts first (they take priority for source labelling)
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

  // 2. Additional recipients
  for (const raw of (additionalEmails || [])) {
    const norm = normalizeEmail(raw);
    if (!norm || !isValidEmail(norm)) {
      invalid.push({ email: raw || '(empty)', reason: 'Invalid email format' });
      continue;
    }
    if (byEmail.has(norm)) {
      // Already included as a record contact — keep "Record Contact" source, don't duplicate
      duplicates.push(norm);
      continue;
    }
    byEmail.set(norm, { email: norm, name: '', source: 'Additional Recipient' });
  }

  return {
    valid: Array.from(byEmail.values()),
    invalid,
    duplicates: [...new Set(duplicates)]
  };
}

// ─── Template renderer ──────────────────────────────────────────────────────
export function renderTemplate(template, vars) {
  let subject = template.subject || '';
  let body = template.body || '';
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`{{${k}}}`, 'g');
    const safe = (v ?? '').toString();
    subject = subject.replace(re, safe);
    body = body.replace(re, safe);
  }
  return { subject, body };
}

// ─── Build per-recipient digest email ───────────────────────────────────────
// events: [{ recordType, recordTitle, recordRef, eventType, itemTitle, dueDate, daysRemaining, daysOverdue, amount, currency, status, partnerName }]
export function buildDigestEmail(events, recipient, today) {
  const isTest = false; // set by caller for test emails
  const sections = {};
  for (const ev of events) {
    const key = ev.eventType === 'document_review'
      ? ev.eventLabel
      : (ev.isOverdue ? `Overdue ${ev.eventLabel}` : `Upcoming ${ev.eventLabel}`);
    if (!sections[key]) sections[key] = { label: key, items: [] };
    sections[key].items.push(ev);
  }

  const sectionKeys = Object.keys(sections);
  let body = `<div style="font-family: sans-serif; max-width: 600px;">`;
  body += `<p>Dear ${recipient.name || 'Team'},</p>`;
  body += `<p>Here is your notification digest for <strong>${today}</strong>:</p>`;

  let totalItems = 0;
  for (const key of sectionKeys) {
    const sec = sections[key];
    totalItems += sec.items.length;
    body += `<h3 style="color: ${sec.items[0].isOverdue ? '#dc2626' : '#2563eb'};">${sec.label} (${sec.items.length})</h3><ul>`;
    for (const ev of sec.items) {
      body += `<li style="margin-bottom: 8px;">`;
      body += `<strong>${ev.itemTitle}</strong>`;
      body += ` — ${ev.recordType}: ${ev.recordTitle}`;
      if (ev.recordRef) body += ` (Ref: ${ev.recordRef})`;
      if (ev.partnerName) body += ` — ${ev.partnerName}`;
      if (ev.eventType === 'document_review') {
        body += `<br>Pending review for <strong>${ev.daysOverdue} day${ev.daysOverdue === 1 ? '' : 's'}</strong>`;
      } else {
        body += `<br>Due: <strong>${ev.dueDate}</strong>`;
        if (ev.isOverdue) {
          body += ` (${ev.daysOverdue} day${ev.daysOverdue === 1 ? '' : 's'} overdue)`;
        } else {
          body += ` (${ev.daysRemaining} day${ev.daysRemaining === 1 ? '' : 's'} remaining)`;
        }
      }
      if (ev.amount) body += `<br>Amount: ${ev.currency || 'USD'} ${ev.amount}`;
      if (ev.status) body += ` — Status: ${ev.status}`;
      body += `<br><a href="https://app.base44.com">View in GrantOS</a>`;
      body += `</li>`;
    }
    body += `</ul>`;
  }

  if (totalItems === 0) {
    body += `<p><em>No items require action today.</em></p>`;
  }

  // Why note
  body += `<hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">`;
  if (recipient.source === 'Record Contact') {
    body += `<p style="font-size: 12px; color: #6b7280;">You are receiving this notification because you are listed as a contact for this record.</p>`;
  } else {
    body += `<p style="font-size: 12px; color: #6b7280;">You are receiving this notification because you are configured as an additional notification recipient.</p>`;
  }
  body += `</div>`;
  return { subject: `[GrantOS] Daily Digest – ${today} (${totalItems} item${totalItems === 1 ? '' : 's'})`, body };
}

// ─── Default notification templates ─────────────────────────────────────────
export const DEFAULT_TEMPLATES = {
  milestone_upcoming: {
    subject: '[GrantOS] Milestone Due in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Milestone <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  milestone_overdue: {
    subject: '[GrantOS] OVERDUE Milestone – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Milestone <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong> (was due {{due_date}}).</p><p>Status: {{status}}</p><p>Please take immediate action.</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  deliverable_upcoming: {
    subject: '[GrantOS] Deliverable Due in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Deliverable <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  deliverable_overdue: {
    subject: '[GrantOS] OVERDUE Deliverable – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Deliverable <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  reporting_upcoming: {
    subject: '[GrantOS] Reporting Deadline in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Report <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  reporting_overdue: {
    subject: '[GrantOS] OVERDUE Report – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Report <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p><p>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  payment_upcoming: {
    subject: '[GrantOS] Payment Due in {{days_remaining}} Days – {{item_title}}',
    body: `<p>Dear Team,</p><p>Payment <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Amount: {{currency}} {{amount}}<br>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  payment_overdue: {
    subject: '[GrantOS] OVERDUE Payment – {{item_title}} ({{days_overdue}} days overdue)',
    body: `<p>Dear Team,</p><p>Payment <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p><p>Amount: {{currency}} {{amount}}<br>Status: {{status}}</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  contract_expiry: {
    subject: '[GrantOS] {{record_type}} Expiring in {{days_remaining}} Days – {{record_title}}',
    body: `<p>Dear Team,</p><p><strong>{{record_type}}: {{record_title}}</strong> is expiring on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p><p>Status: {{status}}</p><p>Please review and take renewal action if required.</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  document_review: {
    subject: '[GrantOS] Document Pending Review – {{item_title}}',
    body: `<p>Dear Team,</p><p>Document <strong>{{item_title}}</strong> (module: {{record_type}}) is pending review.</p><p>Status: {{status}}<br>{{description}}</p><p>Please review and approve or reject this document.</p><p><a href="{{app_link}}">View in GrantOS</a></p>`
  },
  test_email: {
    subject: '[GrantOS] Test Email – Notification System Active',
    body: `<p>Hello,</p><p>This is a test email from GrantOS to confirm that your notification system is working correctly.</p><p>If you received this email, your notification recipients are properly configured.</p><p>Sent at: {{due_date}}</p>`
  }
};