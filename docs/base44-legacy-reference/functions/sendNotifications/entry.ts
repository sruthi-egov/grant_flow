import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  todayInKolkata, diffDays, isValidEmail, normalizeEmail,
  extractContacts, resolveRecipients, renderTemplate, DEFAULT_TEMPLATES
} from '../../shared/notificationHelpers.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no user) or admin-only manual invocation
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      isScheduled = true;
    }

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const testMode = payload.test_mode === true;

    // Load settings
    const allSettings = await base44.asServiceRole.entities.AppSettings.list();
    if (allSettings.length === 0) {
      return Response.json({ message: 'No AppSettings configured. Skipping.' });
    }
    const settings = allSettings[0];
    const notificationsEnabled = settings.notifications_enabled ?? false;
    const additionalEmails = settings.alert_emails || [];

    // Test mode: simple test email to additional recipients
    if (testMode) {
      if (additionalEmails.length === 0) {
        return Response.json({ message: 'No additional recipients configured.' });
      }
      const today = todayInKolkata();
      const results = [];
      for (const email of additionalEmails) {
        const norm = normalizeEmail(email);
        if (!isValidEmail(norm)) {
          results.push({ email, status: 'failed', error: 'Invalid email format' });
          continue;
        }
        const rendered = renderTemplate(DEFAULT_TEMPLATES.test_email, { due_date: today });
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: norm, from_name: 'GrantOS Notifications',
            subject: rendered.subject, body: rendered.body
          });
          results.push({ email: norm, status: 'sent' });
        } catch (err) {
          results.push({ email: norm, status: 'failed', error: err.message });
        }
      }
      return Response.json({ message: 'Test emails sent', results });
    }

    const today = todayInKolkata();

    // Load notification rules
    let rules = [];
    try {
      rules = await base44.asServiceRole.entities.NotificationRule.filter({ is_enabled: true });
    } catch { rules = []; }

    const DEFAULT_RULES = [
      { id: 'default_milestone_due', name: 'Milestone Due Reminder', trigger_type: 'milestone_due', reminder_days_before: [15, 7, 1, 0], overdue_frequency_days: 7 },
      { id: 'default_deliverable_due', name: 'Deliverable Due Reminder', trigger_type: 'deliverable_due', reminder_days_before: [7, 1, 0], overdue_frequency_days: 7 },
      { id: 'default_reporting_due', name: 'Reporting Obligation Reminder', trigger_type: 'reporting_due', reminder_days_before: [15, 7, 0], overdue_frequency_days: 7 },
      { id: 'default_payment_due', name: 'Payment / Disbursement Reminder', trigger_type: 'payment_due', reminder_days_before: [7, 0], overdue_frequency_days: 7 },
      { id: 'default_contract_expiry', name: 'Contract / Agreement Expiry', trigger_type: 'contract_expiry', reminder_days_before: [30, 15, 7], overdue_frequency_days: 0 },
      { id: 'default_document_review', name: 'Document Review Reminder', trigger_type: 'document_review', reminder_days_before: [], overdue_frequency_days: 7 }
    ];
    const activeRules = rules.length > 0 ? rules : DEFAULT_RULES;
    const ruleMap = {};
    for (const r of activeRules) {
      ruleMap[r.trigger_type] = {
        reminderDays: r.reminder_days_before || [],
        overdueFreq: r.overdue_frequency_days ?? 7,
        ruleId: r.id, ruleName: r.name
      };
    }

    // Batch-load all parent records
    const [grants, sows, msas, mous] = await Promise.all([
      base44.asServiceRole.entities.Grant.list().catch(() => []),
      base44.asServiceRole.entities.SOW.list().catch(() => []),
      base44.asServiceRole.entities.MSA.list().catch(() => []),
      base44.asServiceRole.entities.MOU.list().catch(() => [])
    ]);
    const grantMap = Object.fromEntries(grants.map(g => [g.id, g]));
    const sowMap = Object.fromEntries(sows.map(s => [s.id, s]));
    const msaMap = Object.fromEntries(msas.map(m => [m.id, m]));
    const mouMap = Object.fromEntries(mous.map(m => [m.id, m]));

    // Helper: get record title and partner name
    function recordInfo(record, type) {
      if (!record) return { title: type, ref: '', partner: '' };
      const title = record.title || record.name || type;
      let ref = '';
      let partner = '';
      if (type === 'Grant') { ref = record.grant_number || ''; partner = record.funder || ''; }
      else if (type === 'SOW') { ref = record.sow_number || ''; partner = record.vendor_name || ''; }
      else if (type === 'MSA') { ref = record.msa_number || ''; partner = record.vendor_name || ''; }
      else if (type === 'MOU') { ref = record.mou_number || ''; partner = record.partner_name || ''; }
      return { title, ref, partner };
    }

    // Collect events: each event = { recordType, recordId, recordTitle, recordRef, partnerName, eventType, eventLabel, itemTitle, itemId, itemType, dueDate, daysRemaining, daysOverdue, isOverdue, amount, currency, status, ruleId, ruleName }
    const events = [];

    // ── RULE 1: Milestones ──────────────────────────────────────────────────
    if (ruleMap['milestone_due']) {
      const { reminderDays, overdueFreq, ruleId, ruleName } = ruleMap['milestone_due'];
      const skip = ['paid', 'completed', 'cancelled', 'closed'];

      const milestones = await base44.asServiceRole.entities.Milestone.list().catch(() => []);
      for (const item of milestones) {
        if (!item.due_date || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(item.due_date);
        const grant = grantMap[item.grant_id];
        const info = recordInfo(grant, 'Grant');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'Grant', recordId: item.grant_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'milestone_due', eventLabel: 'Milestones', itemTitle: item.title || 'Milestone', itemId: item.id, itemType: 'Milestone',
          dueDate: item.due_date, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: item.amount ? String(item.amount) : '', currency: item.currency || 'USD', status: item.status || '',
          ruleId, ruleName
        });
      }

      const sowMilestones = await base44.asServiceRole.entities.SowMilestone.list().catch(() => []);
      for (const item of sowMilestones) {
        if (!item.due_date || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(item.due_date);
        const sow = sowMap[item.sow_id];
        const info = recordInfo(sow, 'SOW');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'SOW', recordId: item.sow_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'milestone_due', eventLabel: 'Milestones', itemTitle: item.title || 'SOW Milestone', itemId: item.id, itemType: 'SowMilestone',
          dueDate: item.due_date, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: item.amount ? String(item.amount) : '', currency: item.currency || 'USD', status: item.status || '',
          ruleId: ruleId + '_sow', ruleName: ruleName + ' (SOW)'
        });
      }
    }

    // ── RULE 2: Deliverables ────────────────────────────────────────────────
    if (ruleMap['deliverable_due']) {
      const { reminderDays, overdueFreq, ruleId, ruleName } = ruleMap['deliverable_due'];
      const skip = ['completed', 'cancelled', 'closed'];

      const dels = await base44.asServiceRole.entities.GrantDeliverable.list().catch(() => []);
      for (const item of dels) {
        if (!item.due_date || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(item.due_date);
        const grant = grantMap[item.grant_id];
        const info = recordInfo(grant, 'Grant');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'Grant', recordId: item.grant_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'deliverable_due', eventLabel: 'Deliverables', itemTitle: item.name || 'Deliverable', itemId: item.id, itemType: 'GrantDeliverable',
          dueDate: item.due_date, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: '', currency: '', status: item.status || '', ruleId, ruleName
        });
      }

      const sowDels = await base44.asServiceRole.entities.SowDeliverable.list().catch(() => []);
      for (const item of sowDels) {
        if (!item.due_date || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(item.due_date);
        const sow = sowMap[item.sow_id];
        const info = recordInfo(sow, 'SOW');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'SOW', recordId: item.sow_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'deliverable_due', eventLabel: 'Deliverables', itemTitle: item.name || 'Deliverable', itemId: item.id, itemType: 'SowDeliverable',
          dueDate: item.due_date, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: '', currency: '', status: item.status || '', ruleId: ruleId + '_sow', ruleName: ruleName + ' (SOW)'
        });
      }
    }

    // ── RULE 3: Reporting Obligations ──────────────────────────────────────
    if (ruleMap['reporting_due']) {
      const { reminderDays, overdueFreq, ruleId, ruleName } = ruleMap['reporting_due'];
      const skip = ['submitted', 'completed', 'closed'];
      const items = await base44.asServiceRole.entities.GrantReportingObligation.list().catch(() => []);
      for (const item of items) {
        if (!item.due_date || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(item.due_date);
        const grant = grantMap[item.grant_id];
        const info = recordInfo(grant, 'Grant');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'Grant', recordId: item.grant_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'reporting_due', eventLabel: 'Reporting Obligations', itemTitle: item.obligation_name || 'Report', itemId: item.id, itemType: 'GrantReportingObligation',
          dueDate: item.due_date, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: '', currency: '', status: item.status || '', ruleId, ruleName
        });
      }
    }

    // ── RULE 4: Payments ────────────────────────────────────────────────────
    if (ruleMap['payment_due']) {
      const { reminderDays, overdueFreq, ruleId, ruleName } = ruleMap['payment_due'];
      const skip = ['received', 'paid', 'completed', 'closed'];

      const tranches = await base44.asServiceRole.entities.GrantTranche.list().catch(() => []);
      for (const item of tranches) {
        const dueField = item.invoice_trigger_date || item.due_date;
        if (!dueField || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(dueField);
        const grant = grantMap[item.grant_id];
        const info = recordInfo(grant, 'Grant');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'Grant', recordId: item.grant_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'payment_due', eventLabel: 'Payments', itemTitle: item.tranche_name || 'Payment', itemId: item.id, itemType: 'GrantTranche',
          dueDate: dueField, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: item.amount ? String(item.amount) : '', currency: 'USD', status: item.status || '', ruleId, ruleName
        });
      }

      const invoices = await base44.asServiceRole.entities.SowInvoice.list().catch(() => []);
      for (const item of invoices) {
        if (!item.due_date || skip.includes((item.status || '').toLowerCase())) continue;
        const days = diffDays(item.due_date);
        const sow = sowMap[item.sow_id];
        const info = recordInfo(sow, 'SOW');
        const isOverdue = days < 0;
        const shouldNotify = (days >= 0 && reminderDays.includes(days)) ||
                            (isOverdue && overdueFreq > 0 && Math.abs(days) % overdueFreq === 0);
        if (!shouldNotify) continue;
        events.push({
          recordType: 'SOW', recordId: item.sow_id || '', recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
          eventType: 'payment_due', eventLabel: 'Payments', itemTitle: item.invoice_number || item.period || 'Invoice', itemId: item.id, itemType: 'SowInvoice',
          dueDate: item.due_date, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days), isOverdue,
          amount: item.amount ? String(item.amount) : '', currency: 'USD', status: item.status || '',
          ruleId: ruleId + '_invoice', ruleName: ruleName + ' (Invoice)'
        });
      }
    }

    // ── RULE 5: Contract Expiry ─────────────────────────────────────────────
    if (ruleMap['contract_expiry']) {
      const { reminderDays, ruleId, ruleName } = ruleMap['contract_expiry'];
      const skip = ['completed', 'cancelled', 'archived', 'terminated', 'closed', 'expired'];
      const contractSets = [
        { entity: 'Grant', items: grants },
        { entity: 'SOW', items: sows },
        { entity: 'MSA', items: msas },
        { entity: 'MOU', items: mous }
      ];
      for (const { entity, items } of contractSets) {
        for (const item of items) {
          if (!item.end_date || skip.includes((item.status || '').toLowerCase())) continue;
          const days = diffDays(item.end_date);
          if (days < 0 || !reminderDays.includes(days)) continue;
          const info = recordInfo(item, entity);
          events.push({
            recordType: entity, recordId: item.id, recordTitle: info.title, recordRef: info.ref, partnerName: info.partner,
            eventType: 'contract_expiry', eventLabel: 'Contract Expiry', itemTitle: info.title, itemId: item.id, itemType: entity,
            dueDate: item.end_date, daysRemaining: days, daysOverdue: 0, isOverdue: false,
            amount: '', currency: '', status: item.status || '',
            ruleId: ruleId + '_' + entity.toLowerCase(), ruleName: ruleName + ' (' + entity + ')'
          });
        }
      }
    }

    // ── RULE 6: Document Review ─────────────────────────────────────────────
    if (ruleMap['document_review']) {
      const { overdueFreq, ruleId, ruleName } = ruleMap['document_review'];
      const pendingStatuses = ['PendingReview', 'NeedsReview'];
      const docs = await base44.asServiceRole.entities.DocumentValidationLog.list().catch(() => []);
      const docIds = docs.filter(d => pendingStatuses.includes(d.validation_status) && !d.is_deleted).map(d => d.id);
      const existingLogs = docIds.length > 0
        ? await base44.asServiceRole.entities.NotificationLog.filter({ rule_id: ruleId, item_id: { $in: docIds } }).catch(() => [])
        : [];
      const loggedDocIds = new Set(existingLogs.map(l => l.item_id));
      for (const doc of docs) {
        if (!pendingStatuses.includes(doc.validation_status) || doc.is_deleted) continue;
        const createdDate = doc.created_date ? doc.created_date.split('T')[0] : today;
        const daysSinceCreated = diffDays(today) - diffDays(createdDate);
        const isFirstNotification = !loggedDocIds.has(doc.id);
        const shouldSend = isFirstNotification || (overdueFreq > 0 && Math.abs(daysSinceCreated) % overdueFreq === 0);
        if (!shouldSend) continue;
        events.push({
          recordType: doc.selected_module || 'Document', recordId: doc.linked_entity_id || '', recordTitle: doc.linked_entity_name || '', recordRef: '', partnerName: '',
          eventType: 'document_review', eventLabel: 'Documents Pending Review', itemTitle: doc.file_name || 'Document', itemId: doc.id, itemType: 'DocumentValidationLog',
          dueDate: today, daysRemaining: 0, daysOverdue: Math.abs(daysSinceCreated), isOverdue: true,
          amount: '', currency: '', status: doc.validation_status || '', ruleId, ruleName
        });
      }
    }

    // ── Build per-recipient event map ───────────────────────────────────────
    // For each event, resolve recipients from the parent record's contacts + additional recipients
    // Then group by recipient email -> list of events
    const recipientEvents = new Map(); // normalized email -> { email, name, source, events: [] }

    for (const ev of events) {
      // Get parent record
      let record = null;
      if (ev.recordType === 'Grant') record = grantMap[ev.recordId];
      else if (ev.recordType === 'SOW') record = sowMap[ev.recordId];
      else if (ev.recordType === 'MSA') record = msaMap[ev.recordId];
      else if (ev.recordType === 'MOU') record = mouMap[ev.recordId];

      // Extract mandatory contacts from the record
      const recordContacts = extractContacts(record, ev.recordType);

      // Resolve recipients: mandatory contacts always; additional recipients only if toggle on
      const additionalForThisEvent = notificationsEnabled ? additionalEmails : [];
      const { valid } = resolveRecipients(recordContacts, additionalForThisEvent);

      for (const recip of valid) {
        if (!recipientEvents.has(recip.email)) {
          recipientEvents.set(recip.email, { email: recip.email, name: recip.name, source: recip.source, events: [] });
        }
        const re = recipientEvents.get(recip.email);
        re.events.push(ev);
        // If this recipient is a record contact for ANY event, mark as Record Contact
        if (recip.source === 'Record Contact') re.source = 'Record Contact';
      }
    }

    // ── Check for already-sent notifications (idempotency) ──────────────────
    // Build dedup keys: rule_id + item_id + recipient_email + scheduled_for_date
    const allItemIds = events.map(e => e.itemId);
    const existingSentLogs = allItemIds.length > 0
      ? await base44.asServiceRole.entities.NotificationLog.filter({
          scheduled_for_date: today,
          status: 'sent',
          is_test: false,
          item_id: { $in: allItemIds }
        }).catch(() => [])
      : [];
    const sentKeys = new Set(existingSentLogs.map(l => `${l.rule_id}|${l.item_id}|${l.recipient_email}`));

    // ── Send per-recipient digest emails ───────────────────────────────────
    let totalSent = 0, totalFailed = 0, totalSkipped = 0;
    const sendResults = [];
    const logEntries = [];

    for (const [email, { name, source, events: recipEvents }] of recipientEvents) {
      // Filter out already-sent events for this recipient
      const newEvents = recipEvents.filter(ev => !sentKeys.has(`${ev.ruleId}|${ev.itemId}|${email}`));
      if (newEvents.length === 0) {
        totalSkipped += recipEvents.length;
        continue;
      }

      // Build digest email
      const { subject, body } = buildDigestEmailInternal(newEvents, { name, source }, today);

      let status = 'sent';
      let errorMessage = null;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email, from_name: 'GrantOS Notifications', subject, body
        });
        totalSent++;
      } catch (err) {
        status = 'failed';
        errorMessage = err.message;
        totalFailed++;
      }
      sendResults.push({ email, status, eventCount: newEvents.length });

      // Log each event
      for (const ev of newEvents) {
        logEntries.push({
          rule_id: ev.ruleId,
          rule_name: ev.ruleName,
          notification_type: ev.isOverdue ? 'overdue' : 'upcoming',
          record_type: ev.recordType,
          record_id: ev.recordId,
          item_type: ev.itemType,
          item_id: ev.itemId,
          item_title: ev.itemTitle,
          recipient_email: email,
          recipient_source: source,
          scheduled_for_date: today,
          sent_date: new Date().toISOString(),
          status,
          error_message: errorMessage,
          retry_count: 0,
          is_test: false,
          initiated_by: null
        });
      }
    }

    // Batch-create log entries
    if (logEntries.length > 0) {
      // Create in chunks to avoid payload limits
      const chunkSize = 50;
      for (let i = 0; i < logEntries.length; i += chunkSize) {
        const chunk = logEntries.slice(i, i + chunkSize);
        await Promise.all(chunk.map(entry =>
          base44.asServiceRole.entities.NotificationLog.create(entry).catch(() => {})
        ));
      }
    }

    return Response.json({
      message: 'Notifications processed',
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
      total_events: events.length,
      recipients: recipientEvents.size,
      date: today
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Build per-recipient digest email (inline) ─────────────────────────────
function buildDigestEmailInternal(events, recipient, today) {
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
    const color = sec.items[0].isOverdue ? '#dc2626' : '#2563eb';
    body += `<h3 style="color: ${color};">${sec.label} (${sec.items.length})</h3><ul>`;
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

  body += `<hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">`;
  if (recipient.source === 'Record Contact') {
    body += `<p style="font-size: 12px; color: #6b7280;">You are receiving this notification because you are listed as a contact for this record.</p>`;
  } else {
    body += `<p style="font-size: 12px; color: #6b7280;">You are receiving this notification because you are configured as an additional notification recipient.</p>`;
  }
  body += `</div>`;
  return { subject: `[GrantOS] Daily Digest – ${today} (${totalItems} item${totalItems === 1 ? '' : 's'})`, body };
}