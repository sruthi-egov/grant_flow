import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';
import {
  buildDigestEmail,
  DEFAULT_RULES,
  DEFAULT_TEMPLATES,
  diffDays,
  extractContacts,
  isValidEmail,
  normalizeEmail,
  renderTemplate,
  resolveRecipients,
  todayInKolkata,
  type NotificationEvent,
} from './notification-helpers';

export interface RunSummary {
  message: string;
  sent: number;
  failed: number;
  skipped: number;
  total_events: number;
  recipients: number;
  date: string;
  dry_run: boolean;
}

interface RuleConfig {
  reminderDays: number[];
  overdueFreq: number;
  ruleId: string;
  ruleName: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Guards against a manual run overlapping the scheduled one. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Scheduled daily run.
   * Base44 used cron `30 3 * * *` (UTC) = 09:00 Asia/Kolkata.
   */
  @Cron(process.env.NOTIFICATIONS_CRON ?? '30 3 * * *', {
    name: 'daily-notifications',
    timeZone: 'UTC',
  })
  async scheduledRun(): Promise<void> {
    if (!this.config.get<boolean>('notifications.cronEnabled')) {
      this.logger.log('Scheduled notifications are disabled (NOTIFICATIONS_CRON_ENABLED=false)');
      return;
    }
    this.logger.log('Starting scheduled notification run');
    const result = await this.processNotifications({ dryRun: false });
    this.logger.log(
      `Scheduled run complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
    );
  }

  private toDateString(value: Date | string | null): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private recordInfo(record: any, type: string) {
    if (!record) return { title: type, ref: '', partner: '' };
    const title = record.title || record.name || type;
    if (type === 'Grant') return { title, ref: record.grant_number || '', partner: record.funder || '' };
    if (type === 'SOW') return { title, ref: record.sow_number || '', partner: record.vendor_name || '' };
    if (type === 'MSA') return { title, ref: record.msa_number || '', partner: record.vendor_name || '' };
    if (type === 'MOU') return { title, ref: record.mou_number || '', partner: record.partner_name || '' };
    return { title, ref: '', partner: '' };
  }

  private shouldNotify(days: number, rule: RuleConfig): boolean {
    const isOverdue = days < 0;
    if (!isOverdue) return rule.reminderDays.includes(days);
    return rule.overdueFreq > 0 && Math.abs(days) % rule.overdueFreq === 0;
  }

  /**
   * The full notification pass — a port of the Base44 `sendNotifications`
   * backend function, with the same six rules and the same recipient
   * resolution.
   *
   * Differences from the original, both deliberate:
   *  - Deduplication relies on a unique index rather than a read-then-filter,
   *    so two overlapping runs cannot double-send.
   *  - A log row is written for every attempt, including failures, so delivery
   *    history is complete.
   */
  async processNotifications(options: { dryRun?: boolean } = {}): Promise<RunSummary> {
    const dryRun = options.dryRun ?? false;

    if (this.running) {
      return {
        message: 'A notification run is already in progress',
        sent: 0, failed: 0, skipped: 0, total_events: 0, recipients: 0,
        date: todayInKolkata(), dry_run: dryRun,
      };
    }
    this.running = true;

    try {
      const timezone = this.config.get<string>('notifications.timezone') ?? 'Asia/Kolkata';
      const appUrl = this.config.get<string>('appPublicUrl') ?? 'http://localhost:5173';
      const today = todayInKolkata(timezone);

      const settings = await this.prisma.appSettings.findFirst({ orderBy: { created_date: 'asc' } });
      const notificationsEnabled = settings?.notifications_enabled ?? false;
      const additionalEmails = settings?.alert_emails ?? [];

      const dbRules = await this.prisma.notificationRule.findMany({ where: { is_enabled: true } });
      const activeRules: any[] = dbRules.length > 0 ? dbRules : (DEFAULT_RULES as any);

      const ruleMap: Record<string, RuleConfig> = {};
      for (const r of activeRules) {
        ruleMap[r.trigger_type] = {
          reminderDays: r.reminder_days_before ?? [],
          overdueFreq: r.overdue_frequency_days ?? 7,
          ruleId: r.id,
          ruleName: r.name,
        };
      }

      const [grants, sows, msas, mous] = await Promise.all([
        this.prisma.grant.findMany(),
        this.prisma.sow.findMany(),
        this.prisma.msa.findMany(),
        this.prisma.mou.findMany(),
      ]);

      const grantMap = new Map(grants.map((g) => [g.id, g]));
      const sowMap = new Map(sows.map((s) => [s.id, s]));
      const msaMap = new Map(msas.map((m) => [m.id, m]));
      const mouMap = new Map(mous.map((m) => [m.id, m]));

      const events: NotificationEvent[] = [];

      // ── Rule 1: Milestones (grant + SOW) ──────────────────────────────────
      const milestoneRule = ruleMap['milestone_due'];
      if (milestoneRule) {
        const skip = ['paid', 'completed', 'cancelled', 'closed'];

        for (const item of await this.prisma.milestone.findMany()) {
          const due = this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, milestoneRule)) continue;
          const info = this.recordInfo(grantMap.get(item.grant_id), 'Grant');
          events.push({
            recordType: 'Grant', recordId: item.grant_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'milestone_due', eventLabel: 'Milestones',
            itemTitle: item.title || 'Milestone', itemId: item.id, itemType: 'Milestone',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: item.amount ? String(item.amount) : '',
            currency: item.currency || 'USD', status: item.status,
            ruleId: milestoneRule.ruleId, ruleName: milestoneRule.ruleName,
          });
        }

        for (const item of await this.prisma.sowMilestone.findMany()) {
          const due = this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, milestoneRule)) continue;
          const info = this.recordInfo(sowMap.get(item.sow_id), 'SOW');
          events.push({
            recordType: 'SOW', recordId: item.sow_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'milestone_due', eventLabel: 'Milestones',
            itemTitle: item.title || 'SOW Milestone', itemId: item.id, itemType: 'SowMilestone',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: item.amount ? String(item.amount) : '',
            currency: item.currency || 'USD', status: item.status,
            ruleId: `${milestoneRule.ruleId}_sow`, ruleName: `${milestoneRule.ruleName} (SOW)`,
          });
        }
      }

      // ── Rule 2: Deliverables (grant + SOW) ────────────────────────────────
      const deliverableRule = ruleMap['deliverable_due'];
      if (deliverableRule) {
        const skip = ['completed', 'cancelled', 'closed'];

        for (const item of await this.prisma.grantDeliverable.findMany()) {
          const due = this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, deliverableRule)) continue;
          const info = this.recordInfo(grantMap.get(item.grant_id), 'Grant');
          events.push({
            recordType: 'Grant', recordId: item.grant_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'deliverable_due', eventLabel: 'Deliverables',
            itemTitle: item.name || 'Deliverable', itemId: item.id, itemType: 'GrantDeliverable',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: '', currency: '', status: item.status,
            ruleId: deliverableRule.ruleId, ruleName: deliverableRule.ruleName,
          });
        }

        for (const item of await this.prisma.sowDeliverable.findMany()) {
          const due = this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, deliverableRule)) continue;
          const info = this.recordInfo(sowMap.get(item.sow_id), 'SOW');
          events.push({
            recordType: 'SOW', recordId: item.sow_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'deliverable_due', eventLabel: 'Deliverables',
            itemTitle: item.name || 'Deliverable', itemId: item.id, itemType: 'SowDeliverable',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: '', currency: '', status: item.status,
            ruleId: `${deliverableRule.ruleId}_sow`, ruleName: `${deliverableRule.ruleName} (SOW)`,
          });
        }
      }

      // ── Rule 3: Reporting obligations ─────────────────────────────────────
      const reportingRule = ruleMap['reporting_due'];
      if (reportingRule) {
        const skip = ['submitted', 'completed', 'closed'];
        for (const item of await this.prisma.grantReportingObligation.findMany()) {
          const due = this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, reportingRule)) continue;
          const info = this.recordInfo(grantMap.get(item.grant_id), 'Grant');
          events.push({
            recordType: 'Grant', recordId: item.grant_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'reporting_due', eventLabel: 'Reporting Obligations',
            itemTitle: item.obligation_name || 'Report', itemId: item.id,
            itemType: 'GrantReportingObligation',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: '', currency: '', status: item.status,
            ruleId: reportingRule.ruleId, ruleName: reportingRule.ruleName,
          });
        }
      }

      // ── Rule 4: Payments (tranches + SOW invoices) ────────────────────────
      const paymentRule = ruleMap['payment_due'];
      if (paymentRule) {
        const skip = ['received', 'paid', 'completed', 'closed'];

        for (const item of await this.prisma.grantTranche.findMany()) {
          // The invoice trigger date takes precedence, as on Base44.
          const due = this.toDateString(item.invoice_trigger_date) ?? this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, paymentRule)) continue;
          const info = this.recordInfo(grantMap.get(item.grant_id), 'Grant');
          events.push({
            recordType: 'Grant', recordId: item.grant_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'payment_due', eventLabel: 'Payments',
            itemTitle: item.tranche_name || 'Payment', itemId: item.id, itemType: 'GrantTranche',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: item.amount ? String(item.amount) : '',
            currency: 'USD', status: item.status,
            ruleId: paymentRule.ruleId, ruleName: paymentRule.ruleName,
          });
        }

        for (const item of await this.prisma.sowInvoice.findMany()) {
          const due = this.toDateString(item.due_date);
          if (!due || skip.includes(item.status.toLowerCase())) continue;
          const days = diffDays(due, today);
          if (!this.shouldNotify(days, paymentRule)) continue;
          const info = this.recordInfo(sowMap.get(item.sow_id), 'SOW');
          events.push({
            recordType: 'SOW', recordId: item.sow_id, recordTitle: info.title,
            recordRef: info.ref, partnerName: info.partner,
            eventType: 'payment_due', eventLabel: 'Payments',
            itemTitle: item.invoice_number || item.period || 'Invoice', itemId: item.id,
            itemType: 'SowInvoice',
            dueDate: due, daysRemaining: Math.max(0, days), daysOverdue: Math.max(0, -days),
            isOverdue: days < 0, amount: item.amount ? String(item.amount) : '',
            currency: 'USD', status: item.status,
            ruleId: `${paymentRule.ruleId}_invoice`, ruleName: `${paymentRule.ruleName} (Invoice)`,
          });
        }
      }

      // ── Rule 5: Contract expiry ───────────────────────────────────────────
      const expiryRule = ruleMap['contract_expiry'];
      if (expiryRule) {
        const skip = ['completed', 'cancelled', 'archived', 'terminated', 'closed', 'expired'];
        const sets: Array<{ entity: string; items: any[] }> = [
          { entity: 'Grant', items: grants },
          { entity: 'SOW', items: sows },
          { entity: 'MSA', items: msas },
          { entity: 'MOU', items: mous },
        ];

        for (const { entity, items } of sets) {
          for (const item of items) {
            const end = this.toDateString(item.end_date);
            if (!end || skip.includes(String(item.status).toLowerCase())) continue;
            const days = diffDays(end, today);
            // Expiry notifications are forward-looking only.
            if (days < 0 || !expiryRule.reminderDays.includes(days)) continue;
            const info = this.recordInfo(item, entity);
            events.push({
              recordType: entity, recordId: item.id, recordTitle: info.title,
              recordRef: info.ref, partnerName: info.partner,
              eventType: 'contract_expiry', eventLabel: 'Contract Expiry',
              itemTitle: info.title, itemId: item.id, itemType: entity,
              dueDate: end, daysRemaining: days, daysOverdue: 0, isOverdue: false,
              amount: '', currency: '', status: String(item.status),
              ruleId: `${expiryRule.ruleId}_${entity.toLowerCase()}`,
              ruleName: `${expiryRule.ruleName} (${entity})`,
            });
          }
        }
      }

      // ── Rule 6: Documents pending review ──────────────────────────────────
      const docRule = ruleMap['document_review'];
      if (docRule) {
        const docs = await this.prisma.documentValidationLog.findMany({
          where: {
            is_deleted: false,
            validation_status: { in: ['PendingReview', 'NeedsReview'] },
          },
        });

        const alreadyLogged = new Set(
          (
            await this.prisma.notificationLog.findMany({
              where: { rule_id: docRule.ruleId, item_id: { in: docs.map((d) => d.id) } },
              select: { item_id: true },
            })
          ).map((l) => l.item_id),
        );

        for (const doc of docs) {
          const created = this.toDateString(doc.created_date) ?? today;
          const daysSinceCreated = Math.abs(diffDays(created, today));
          const isFirst = !alreadyLogged.has(doc.id);
          const shouldSend =
            isFirst || (docRule.overdueFreq > 0 && daysSinceCreated % docRule.overdueFreq === 0);
          if (!shouldSend) continue;

          events.push({
            recordType: doc.selected_module || 'Document', recordId: doc.linked_entity_id || '',
            recordTitle: doc.linked_entity_name || '', recordRef: '', partnerName: '',
            eventType: 'document_review', eventLabel: 'Documents Pending Review',
            itemTitle: doc.file_name || 'Document', itemId: doc.id,
            itemType: 'DocumentValidationLog',
            dueDate: today, daysRemaining: 0, daysOverdue: daysSinceCreated, isOverdue: true,
            amount: '', currency: '', status: doc.validation_status,
            ruleId: docRule.ruleId, ruleName: docRule.ruleName,
          });
        }
      }

      // ── Group events per recipient ────────────────────────────────────────
      const recipientEvents = new Map<
        string,
        { email: string; name: string; source: string; events: NotificationEvent[] }
      >();

      for (const ev of events) {
        let record: any = null;
        if (ev.recordType === 'Grant') record = grantMap.get(ev.recordId);
        else if (ev.recordType === 'SOW') record = sowMap.get(ev.recordId);
        else if (ev.recordType === 'MSA') record = msaMap.get(ev.recordId);
        else if (ev.recordType === 'MOU') record = mouMap.get(ev.recordId);

        const recordContacts = extractContacts(record, ev.recordType);
        // Record contacts always notify; global additional recipients only when
        // the master toggle is on.
        const additional = notificationsEnabled ? additionalEmails : [];
        const { valid } = resolveRecipients(recordContacts, additional);

        for (const recip of valid) {
          if (!recipientEvents.has(recip.email)) {
            recipientEvents.set(recip.email, {
              email: recip.email, name: recip.name, source: recip.source, events: [],
            });
          }
          const bucket = recipientEvents.get(recip.email)!;
          bucket.events.push(ev);
          if (recip.source === 'Record Contact') bucket.source = 'Record Contact';
        }
      }

      // ── Send digests ──────────────────────────────────────────────────────
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const { email, name, source, events: recipEvents } of recipientEvents.values()) {
        // Claim each (rule, item, recipient, day) up front. The unique index
        // makes this atomic, so a concurrent run cannot send the same digest.
        const claimed: NotificationEvent[] = [];
        for (const ev of recipEvents) {
          try {
            await this.prisma.notificationLog.create({
              data: {
                rule_id: ev.ruleId,
                rule_name: ev.ruleName,
                notification_type: ev.isOverdue ? 'overdue' : 'upcoming',
                record_type: ev.recordType,
                record_id: ev.recordId || null,
                item_type: ev.itemType,
                item_id: ev.itemId,
                item_title: ev.itemTitle.slice(0, 500),
                recipient_email: email,
                recipient_source:
                  source === 'Record Contact' ? 'Record_Contact' : 'Additional_Recipient',
                scheduled_for_date: new Date(`${today}T00:00:00.000Z`),
                status: 'skipped', // upgraded to sent/failed once delivery is attempted
                is_test: false,
              },
            });
            claimed.push(ev);
          } catch {
            // Unique-constraint violation = already sent today. Expected path.
            skipped += 1;
          }
        }

        if (claimed.length === 0) continue;

        const { subject, body } = buildDigestEmail(claimed, { name, source }, today, appUrl);

        if (dryRun) {
          sent += 1;
          await this.prisma.notificationLog.updateMany({
            where: {
              recipient_email: email,
              scheduled_for_date: new Date(`${today}T00:00:00.000Z`),
              item_id: { in: claimed.map((e) => e.itemId) },
              status: 'skipped',
            },
            data: { status: 'skipped', error_message: 'Dry run — no email sent' },
          });
          continue;
        }

        const result = await this.mailer.send({ to: email, subject, html: body });

        if (result.status === 'sent') sent += 1;
        else if (result.status === 'failed') failed += 1;
        else skipped += 1;

        await this.prisma.notificationLog.updateMany({
          where: {
            recipient_email: email,
            scheduled_for_date: new Date(`${today}T00:00:00.000Z`),
            item_id: { in: claimed.map((e) => e.itemId) },
            is_test: false,
          },
          data: {
            status: result.status,
            sent_date: new Date(),
            error_message: result.error ?? null,
          },
        });
      }

      return {
        message: dryRun ? 'Notifications processed (dry run — nothing sent)' : 'Notifications processed',
        sent, failed, skipped,
        total_events: events.length,
        recipients: recipientEvents.size,
        date: today,
        dry_run: dryRun,
      };
    } finally {
      this.running = false;
    }
  }

  /**
   * Sends a one-off test notification for a chosen record and event type.
   * Port of the Base44 `sendTestNotification` function, including the
   * recipient preview the Settings dialog renders.
   *
   * Test sends never touch due dates, reminder history or record status, and
   * are logged with `is_test: true` so they stay out of the dedup index.
   */
  async sendTestNotification(
    payload: {
      record_type?: string;
      record_id?: string;
      event_type?: string;
      test_due_date?: string | null;
      send_to_me_only?: boolean;
      send_to_recipients?: boolean;
    },
    actor: { email: string; name?: string },
  ) {
    const { record_type: recordType, record_id: recordId, event_type: eventType } = payload;
    if (!recordType || !recordId || !eventType) {
      throw new BadRequestException('record_type, record_id and event_type are required');
    }

    const timezone = this.config.get<string>('notifications.timezone') ?? 'Asia/Kolkata';
    const appUrl = this.config.get<string>('appPublicUrl') ?? 'http://localhost:5173';
    const today = todayInKolkata(timezone);
    const effectiveDueDate = payload.test_due_date || today;

    const delegates: Record<string, any> = {
      Grant: this.prisma.grant,
      SOW: this.prisma.sow,
      MSA: this.prisma.msa,
      MOU: this.prisma.mou,
    };
    const delegate = delegates[recordType];
    if (!delegate) throw new BadRequestException(`Unsupported record_type "${recordType}"`);

    const record = await delegate.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Record not found');

    const settings = await this.prisma.appSettings.findFirst({ orderBy: { created_date: 'asc' } });
    const additionalEmails = settings?.alert_emails ?? [];

    const recordContacts = extractContacts(record, recordType);
    const { valid, invalid, duplicates } = resolveRecipients(recordContacts, additionalEmails);

    const info = this.recordInfo(record, recordType);
    const template = DEFAULT_TEMPLATES[eventType] ?? DEFAULT_TEMPLATES.milestone_upcoming;

    const daysRemaining = diffDays(effectiveDueDate, today);
    const daysOverdue = Math.max(0, -daysRemaining);

    const rendered = renderTemplate(template, {
      record_type: recordType,
      record_title: info.title,
      item_title: `[TEST] ${EVENT_LABELS[eventType] ?? eventType}`,
      due_date: effectiveDueDate,
      days_remaining: String(Math.max(0, daysRemaining)),
      days_overdue: String(daysOverdue),
      status: 'pending',
      amount: '',
      currency: 'USD',
      app_link: appUrl,
      description: 'This is a test notification. No action is required.',
    });

    const testSubject = `[TEST] ${rendered.subject}`;
    const testBody = `<div style="border: 2px dashed #f59e0b; padding: 12px; margin-bottom: 16px; border-radius: 8px;">
<p style="margin: 0; color: #f59e0b; font-weight: bold;">⚠️ TEST EMAIL — This is not a real notification. No due dates, reminder history, or record status have been modified.</p>
</div>
<p style="font-size: 12px; color: #6b7280;">Record: ${recordType} — ${info.title}${info.ref ? ` (Ref: ${info.ref})` : ''}${info.partner ? ` — ${info.partner}` : ''}</p>
${rendered.body}`;

    const sendToMeOnly = payload.send_to_me_only ?? true;
    const recipientsToSend: Array<{ email: string; name: string; source: string }> = sendToMeOnly
      ? [{ email: normalizeEmail(actor.email), name: actor.name ?? '', source: 'Test Sender' }]
      : payload.send_to_recipients
        ? valid.map((v) => ({ email: v.email, name: v.name, source: v.source }))
        : [];

    const results: Array<{ email: string; status: string; error?: string; source?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const recip of recipientsToSend) {
      if (!isValidEmail(recip.email)) {
        results.push({ email: recip.email, status: 'failed', error: 'Invalid email', source: recip.source });
        failed += 1;
        continue;
      }
      const result = await this.mailer.send({
        to: recip.email,
        subject: testSubject,
        html: testBody,
        fromName: 'GrantOS Notifications [TEST]',
      });
      results.push({ email: recip.email, status: result.status, error: result.error, source: recip.source });
      if (result.status === 'sent') sent += 1;
      else failed += 1;
    }

    await this.prisma.notificationLog
      .create({
        data: {
          rule_id: 'test_email',
          rule_name: `Test: ${EVENT_LABELS[eventType] ?? eventType}`,
          notification_type: 'test',
          record_type: recordType,
          record_id: recordId,
          item_type: 'TestEmail',
          item_id: `test_${Date.now()}`,
          item_title: `[TEST] ${info.title}`.slice(0, 500),
          recipient_email: actor.email,
          recipient_source: 'Additional_Recipient',
          scheduled_for_date: new Date(`${today}T00:00:00.000Z`),
          sent_date: new Date(),
          status: failed === 0 ? 'sent' : sent > 0 ? 'sent' : 'failed',
          error_message:
            failed > 0 ? `${failed} of ${recipientsToSend.length} recipients failed` : null,
          is_test: true,
          initiated_by: actor.email,
        },
      })
      .catch(() => undefined);

    return {
      message: 'Test email processed',
      sent,
      failed,
      recipient_preview: {
        mandatory_contacts: recordContacts.map((c) => ({
          name: c.name, email: c.email, role: c.role, is_active: c.is_active,
        })),
        additional_recipients: additionalEmails.map((e) => ({ email: e })),
        valid_recipients: valid,
        invalid_or_excluded: invalid,
        duplicates,
      },
      email_preview: { subject: testSubject, body_preview: `${testBody.slice(0, 500)}...` },
      record_info: { type: recordType, title: info.title, ref: info.ref, partner: info.partner },
      results,
    };
  }

  /**
   * Sends one ad-hoc email on behalf of an admin.
   * Replaces the client-side `integrations.Core.SendEmail` calls; plain-text
   * bodies are wrapped so line breaks survive as HTML.
   */
  async sendAdHocEmail(
    body: { to: string; subject: string; body: string; from_name?: string },
    initiatedBy: string,
  ) {
    const to = normalizeEmail(body?.to);
    if (!isValidEmail(to)) {
      throw new BadRequestException(`"${body?.to}" is not a valid email address`);
    }
    if (!body?.subject?.trim()) {
      throw new BadRequestException('subject is required');
    }

    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(body.body ?? '');
    const html = looksLikeHtml
      ? body.body
      : `<div style="font-family: sans-serif; white-space: pre-wrap;">${(body.body ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</div>`;

    const result = await this.mailer.send({
      to,
      subject: body.subject,
      html,
      fromName: body.from_name,
    });

    const today = todayInKolkata(this.config.get<string>('notifications.timezone') ?? 'Asia/Kolkata');
    await this.prisma.notificationLog
      .create({
        data: {
          rule_id: 'manual',
          rule_name: 'Manual Email',
          notification_type: 'test',
          item_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          item_title: body.subject.slice(0, 500),
          recipient_email: to,
          recipient_source: 'Additional_Recipient',
          scheduled_for_date: new Date(`${today}T00:00:00.000Z`),
          sent_date: new Date(),
          status: result.status,
          error_message: result.error ?? null,
          is_test: true,
          initiated_by: initiatedBy,
        },
      })
      .catch(() => undefined);

    if (result.status === 'failed') {
      throw new BadRequestException(`Email could not be sent: ${result.error}`);
    }
    return { status: result.status, to, error: result.error ?? null };
  }

  /** Simple "is SMTP working" probe used by the Settings page. */
  async sendSimpleTestEmail(recipients: string[], initiatedBy: string) {
    const timezone = this.config.get<string>('notifications.timezone') ?? 'Asia/Kolkata';
    const today = todayInKolkata(timezone);

    const targets = recipients?.length
      ? recipients
      : (await this.prisma.appSettings.findFirst())?.alert_emails ?? [];

    if (targets.length === 0) {
      return { sent: 0, failed: 0, results: [{ email: '(none)', status: 'skipped', error: 'No recipients configured' }] };
    }

    const results: Array<{ email: string; status: string; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const raw of targets) {
      const email = normalizeEmail(raw);
      if (!isValidEmail(email)) {
        results.push({ email: raw, status: 'failed', error: 'Invalid email format' });
        failed += 1;
        continue;
      }
      const rendered = renderTemplate(DEFAULT_TEMPLATES.test_email, { due_date: today });
      const result = await this.mailer.send({ to: email, subject: rendered.subject, html: rendered.body });
      results.push({ email, status: result.status, error: result.error });
      if (result.status === 'sent') sent += 1;
      else failed += 1;

      await this.prisma.notificationLog
        .create({
          data: {
            rule_id: 'test',
            rule_name: 'Test Notification',
            notification_type: 'test',
            item_id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            item_title: 'Test Email',
            recipient_email: email,
            recipient_source: 'Additional_Recipient',
            scheduled_for_date: new Date(`${today}T00:00:00.000Z`),
            sent_date: new Date(),
            status: result.status,
            error_message: result.error ?? null,
            is_test: true,
            initiated_by: initiatedBy,
          },
        })
        .catch(() => undefined);
    }

    return { sent, failed, results };
  }
}

const EVENT_LABELS: Record<string, string> = {
  milestone_upcoming: 'Milestone Due',
  milestone_overdue: 'Overdue Milestone',
  deliverable_upcoming: 'Deliverable Due',
  deliverable_overdue: 'Overdue Deliverable',
  reporting_upcoming: 'Reporting Deadline',
  reporting_overdue: 'Overdue Reporting',
  payment_upcoming: 'Payment Due',
  payment_overdue: 'Overdue Payment',
  contract_expiry: 'Contract Expiry',
  document_review: 'Document Review',
};
