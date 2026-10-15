import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  todayInKolkata, diffDays, isValidEmail, normalizeEmail,
  extractContacts, resolveRecipients, renderTemplate, DEFAULT_TEMPLATES
} from '../../shared/notificationHelpers.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const {
      record_type: recordType,
      record_id: recordId,
      event_type: eventType,
      test_due_date: testDueDate,
      send_to_me_only: sendToMeOnly = true,
      send_to_recipients: sendToRecipients = false
    } = payload;

    if (!recordType || !recordId || !eventType) {
      return Response.json({ error: 'record_type, record_id, and event_type are required' }, { status: 400 });
    }

    const today = todayInKolkata();
    const effectiveDueDate = testDueDate || today;

    // Load the selected record
    let record = null;
    if (recordType === 'Grant') {
      const items = await base44.asServiceRole.entities.Grant.filter({ id: recordId });
      record = items[0];
    } else if (recordType === 'SOW') {
      const items = await base44.asServiceRole.entities.SOW.filter({ id: recordId });
      record = items[0];
    } else if (recordType === 'MSA') {
      const items = await base44.asServiceRole.entities.MSA.filter({ id: recordId });
      record = items[0];
    } else if (recordType === 'MOU') {
      const items = await base44.asServiceRole.entities.MOU.filter({ id: recordId });
      record = items[0];
    }

    if (!record) {
      return Response.json({ error: 'Record not found' }, { status: 404 });
    }

    // Load settings for additional recipients
    const allSettings = await base44.asServiceRole.entities.AppSettings.list();
    const settings = allSettings[0] || {};
    const additionalEmails = settings.alert_emails || [];

    // Extract mandatory contacts from the record
    const recordContacts = extractContacts(record, recordType);

    // Resolve recipients
    const { valid, invalid, duplicates } = resolveRecipients(recordContacts, additionalEmails);

    // Build record info
    let recordTitle = record.title || record.name || recordType;
    let recordRef = '';
    let partnerName = '';
    if (recordType === 'Grant') { recordRef = record.grant_number || ''; partnerName = record.funder || ''; }
    else if (recordType === 'SOW') { recordRef = record.sow_number || ''; partnerName = record.vendor_name || ''; }
    else if (recordType === 'MSA') { recordRef = record.msa_number || ''; partnerName = record.vendor_name || ''; }
    else if (recordType === 'MOU') { recordRef = record.mou_number || ''; partnerName = record.partner_name || ''; }

    // Map event type to template
    const templateKey = eventType;
    const template = DEFAULT_TEMPLATES[templateKey] || DEFAULT_TEMPLATES.milestone_upcoming;

    // Calculate days remaining for the test due date
    const daysRemaining = diffDays(effectiveDueDate);
    const daysOverdue = Math.max(0, -daysRemaining);
    const isOverdue = daysRemaining < 0;

    // Build template vars
    const vars = {
      record_type: recordType,
      record_title: recordTitle,
      item_title: `[TEST] ${getEventLabel(eventType)}`,
      due_date: effectiveDueDate,
      days_remaining: String(Math.max(0, daysRemaining)),
      days_overdue: String(daysOverdue),
      status: 'pending',
      amount: '',
      currency: 'USD',
      app_link: 'https://app.base44.com',
      description: 'This is a test notification. No action is required.'
    };

    const rendered = renderTemplate(template, vars);
    const testSubject = `[TEST] ${rendered.subject}`;
    const testBody = `<div style="border: 2px dashed #f59e0b; padding: 12px; margin-bottom: 16px; border-radius: 8px;">
<p style="margin: 0; color: #f59e0b; font-weight: bold;">⚠️ TEST EMAIL — This is not a real notification. No due dates, reminder history, or record status have been modified.</p>
</div>
<p style="font-size: 12px; color: #6b7280;">Record: ${recordType} — ${recordTitle}${recordRef ? ` (Ref: ${recordRef})` : ''}${partnerName ? ` — ${partnerName}` : ''}</p>
${rendered.body}`;

    // Determine who to send to
    let recipientsToSend = [];
    if (sendToMeOnly) {
      recipientsToSend = [{ email: normalizeEmail(user.email), name: user.full_name || '', source: 'Test Sender' }];
    } else if (sendToRecipients) {
      recipientsToSend = valid;
    }

    // Send emails
    const sendResults = [];
    let sentCount = 0, failedCount = 0;

    for (const recip of recipientsToSend) {
      if (!isValidEmail(recip.email)) {
        sendResults.push({ email: recip.email, status: 'failed', error: 'Invalid email' });
        failedCount++;
        continue;
      }
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: recip.email,
          from_name: 'GrantOS Notifications [TEST]',
          subject: testSubject,
          body: testBody
        });
        sendResults.push({ email: recip.email, status: 'sent', source: recip.source });
        sentCount++;
      } catch (err) {
        sendResults.push({ email: recip.email, status: 'failed', error: err.message, source: recip.source });
        failedCount++;
      }
    }

    // Create test audit log entry
    await base44.asServiceRole.entities.NotificationLog.create({
      rule_id: 'test_email',
      rule_name: `Test: ${getEventLabel(eventType)}`,
      notification_type: 'test',
      record_type: recordType,
      record_id: recordId,
      item_type: 'TestEmail',
      item_id: `test_${Date.now()}`,
      item_title: `[TEST] ${recordTitle}`,
      recipient_email: user.email,
      recipient_source: 'Additional Recipient',
      scheduled_for_date: today,
      sent_date: new Date().toISOString(),
      status: failedCount === 0 ? 'sent' : (sentCount > 0 ? 'sent' : 'failed'),
      error_message: failedCount > 0 ? `${failedCount} of ${recipientsToSend.length} recipients failed` : null,
      retry_count: 0,
      is_test: true,
      initiated_by: user.email
    }).catch(() => {});

    return Response.json({
      message: 'Test email processed',
      sent: sentCount,
      failed: failedCount,
      recipient_preview: {
        mandatory_contacts: recordContacts.map(c => ({ name: c.name, email: c.email, role: c.role, is_active: c.is_active })),
        additional_recipients: additionalEmails.map(e => ({ email: e })),
        valid_recipients: valid,
        invalid_or_excluded: invalid,
        duplicates
      },
      email_preview: {
        subject: testSubject,
        body_preview: testBody.substring(0, 500) + '...'
      },
      record_info: { type: recordType, title: recordTitle, ref: recordRef, partner: partnerName },
      results: sendResults
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function getEventLabel(eventType) {
  const labels = {
    milestone_upcoming: 'Milestone Due',
    milestone_overdue: 'Overdue Milestone',
    deliverable_upcoming: 'Deliverable Due',
    deliverable_overdue: 'Overdue Deliverable',
    reporting_upcoming: 'Reporting Deadline',
    reporting_overdue: 'Overdue Reporting',
    payment_upcoming: 'Payment Due',
    payment_overdue: 'Overdue Payment',
    contract_expiry: 'Contract Expiry',
    document_review: 'Document Review'
  };
  return labels[eventType] || eventType;
}