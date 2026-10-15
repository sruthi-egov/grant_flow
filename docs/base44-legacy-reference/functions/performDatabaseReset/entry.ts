import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Helper: delete all records from an entity, returns count deleted
async function deleteAll(entityRef, label, errors) {
  let count = 0;
  try {
    const records = await entityRef.list();
    for (const r of records) {
      try {
        await entityRef.delete(r.id);
        count++;
      } catch (e) {
        errors.push(`Failed to delete ${label} ${r.id}: ${e.message}`);
      }
    }
  } catch (e) {
    errors.push(`Failed to list ${label}: ${e.message}`);
  }
  return count;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { backup_exported, delete_audit_logs, delete_notification_logs } = payload;

    if (!backup_exported) {
      return Response.json({
        success: false,
        message: 'Please export backup before running full database reset.'
      }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const errors = [];
    const db = base44.asServiceRole.entities;
    const counts = {
      document_upload_logs: 0,
      document_validation_logs: 0,
      grant_deliverables: 0,
      grant_milestones: 0,
      sow_deliverables: 0,
      sow_milestones: 0,
      reporting_obligations: 0,
      grant_tranches: 0,
      sow_invoices: 0,
      mou_commitments: 0,
      msa_key_clauses: 0,
      health_snapshots: 0,
      notification_logs: 0,
      audit_logs: 0,
      cleanup_logs: 0,
      sows: 0,
      msas: 0,
      mous: 0,
      grants: 0,
    };

    // ── PHASE 1: Document logs & extracted metadata ───────────────────────────
    counts.document_upload_logs  = await deleteAll(db.DocumentUploadLog,      'DocumentUploadLog',      errors);
    counts.document_validation_logs = await deleteAll(db.DocumentValidationLog, 'DocumentValidationLog', errors);

    // ── PHASE 2: Child deliverables & milestones (all, not just PDF-extracted) ─
    counts.grant_deliverables = await deleteAll(db.GrantDeliverable, 'GrantDeliverable', errors);
    counts.grant_milestones   = await deleteAll(db.Milestone,        'Milestone',        errors);
    counts.sow_deliverables   = await deleteAll(db.SowDeliverable,   'SowDeliverable',   errors);
    counts.sow_milestones     = await deleteAll(db.SowMilestone,     'SowMilestone',     errors);

    // ── PHASE 3: Reporting obligations & financial child records ─────────────
    counts.reporting_obligations = await deleteAll(db.GrantReportingObligation, 'GrantReportingObligation', errors);
    counts.grant_tranches        = await deleteAll(db.GrantTranche,              'GrantTranche',              errors);
    counts.sow_invoices          = await deleteAll(db.SowInvoice,                'SowInvoice',                errors);
    counts.mou_commitments       = await deleteAll(db.MouCommitment,             'MouCommitment',             errors);
    counts.msa_key_clauses       = await deleteAll(db.MsaKeyClause,              'MsaKeyClause',              errors);

    // ── PHASE 4: Health score snapshots ──────────────────────────────────────
    counts.health_snapshots = await deleteAll(db.GrantHealthScoreSnapshot, 'GrantHealthScoreSnapshot', errors);

    // ── PHASE 5: Optional transactional logs ─────────────────────────────────
    if (delete_notification_logs) {
      counts.notification_logs = await deleteAll(db.NotificationLog, 'NotificationLog', errors);
    }
    if (delete_audit_logs) {
      counts.audit_logs = await deleteAll(db.AuditLog, 'AuditLog', errors);
    }
    // Always clear old cleanup logs so the log reflects only this reset
    counts.cleanup_logs = await deleteAll(db.CleanupLog, 'CleanupLog', errors);

    // ── PHASE 6: Parent contract records ─────────────────────────────────────
    counts.sows  = await deleteAll(db.SOW,  'SOW',  errors);
    counts.msas  = await deleteAll(db.MSA,  'MSA',  errors);
    counts.mous  = await deleteAll(db.MOU,  'MOU',  errors);
    counts.grants = await deleteAll(db.Grant, 'Grant', errors);

    const completedAt = new Date().toISOString();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // ── Write CleanupLog (non-critical) ──────────────────────────────────────
    try {
      await db.CleanupLog.create({
        cleanup_type: 'full_cleanup',
        cleanup_scope: 'full_database_reset',
        initiated_by: user.full_name || user.email,
        initiated_by_email: user.email,
        started_at: startedAt,
        completed_at: completedAt,
        status: errors.length > 0 ? 'failed' : 'completed',
        files_deleted_count: counts.document_upload_logs,
        document_logs_deleted_count: counts.document_upload_logs,
        validation_logs_deleted_count: counts.document_validation_logs,
        extracted_items_deleted_count: counts.grant_deliverables + counts.sow_deliverables + counts.grant_milestones + counts.sow_milestones,
        records_updated_count: 0,
        metadata_cleared_count: 0,
        errors,
        backup_exported: true,
        summary: `Full database reset. Total records deleted: ${total}. Grants: ${counts.grants}, SOWs: ${counts.sows}, MSAs: ${counts.msas}, MOUs: ${counts.mous}. Users, settings, and notification config preserved.`
      });
    } catch (logErr) {
      console.warn('CleanupLog write failed (non-critical):', logErr.message);
    }

    // ── Write AuditLog (non-critical) ────────────────────────────────────────
    try {
      await db.AuditLog.create({
        action_type: 'full_database_reset',
        entity_type: 'System',
        entity_name: 'Full Database Reset',
        user_email: user.email,
        user_name: user.full_name || user.email,
        description: `Admin performed full database reset. Total ${total} records deleted across all business entities. Users, settings, and notification config preserved.`,
        status: errors.length > 0 ? 'warning' : 'success'
      });
    } catch (auditErr) {
      console.warn('AuditLog write failed (non-critical):', auditErr.message);
    }

    return Response.json({
      success: true,
      message: errors.length > 0
        ? 'Full database reset completed with some warnings.'
        : 'Full database reset completed successfully.',
      deleted_counts: counts,
      preserved: {
        users: true,
        settings: true,
        notification_config: true,
      },
      errors
    });

  } catch (error) {
    return Response.json({
      success: false,
      message: 'Full database reset failed.',
      error: error.message
    }, { status: 500 });
  }
});