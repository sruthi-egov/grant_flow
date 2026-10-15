import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { scope, backup_exported, include_extracted_items } = payload;

    if (!scope) {
      return Response.json({ success: false, message: 'Cleanup scope is required.' }, { status: 400 });
    }

    const VALID_SCOPES = ['files_only', 'files_and_validation_logs', 'files_metadata_and_tables', 'files_and_extracted_items', 'full_file_cleanup'];
    if (!VALID_SCOPES.includes(scope)) {
      return Response.json({ success: false, message: 'Invalid scope.' }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const errors = [];
    let documentLogsDeletedCount = 0;
    let validationLogsDeletedCount = 0;
    let metadataClearedCount = 0;
    let recordsUpdatedCount = 0;
    let extractedItemsDeletedCount = 0;

    // ── 1. Delete DocumentUploadLog records ──────────────────────────────────
    try {
      const uploadLogs = await base44.asServiceRole.entities.DocumentUploadLog.list();
      for (const log of uploadLogs) {
        try {
          await base44.asServiceRole.entities.DocumentUploadLog.delete(log.id);
          documentLogsDeletedCount++;
        } catch (e) {
          errors.push(`Failed to delete upload log ${log.id}: ${e.message}`);
        }
      }
    } catch (e) {
      errors.push(`Failed to list upload logs: ${e.message}`);
    }

    // ── 2. Delete DocumentValidationLog records ──────────────────────────────
    if (['files_and_validation_logs', 'files_metadata_and_tables', 'files_and_extracted_items', 'full_file_cleanup'].includes(scope)) {
      try {
        const validationLogs = await base44.asServiceRole.entities.DocumentValidationLog.list();
        for (const log of validationLogs) {
          try {
            await base44.asServiceRole.entities.DocumentValidationLog.delete(log.id);
            validationLogsDeletedCount++;
          } catch (e) {
            errors.push(`Failed to delete validation log ${log.id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`Failed to list validation logs: ${e.message}`);
      }
    }

    // ── 3. Clear file references from Grant / SOW / MSA / MOU ───────────────
    // NOTE: Only sending fields being changed — title is NOT included to avoid
    // re-triggering required field validation on unrelated fields.
    if (['files_metadata_and_tables', 'files_and_extracted_items', 'full_file_cleanup'].includes(scope)) {
      // Grants — clear pdf_url only (include title to satisfy required field validation)
      try {
        const grants = await base44.asServiceRole.entities.Grant.list();
        for (const g of grants) {
          if (g.pdf_url) {
            try {
              await base44.asServiceRole.entities.Grant.update(g.id, {
                title: g.title || g.grant_name || 'Grant',
                pdf_url: ''
              });
              recordsUpdatedCount++;
            } catch (e) {
              errors.push(`Failed to clear pdf_url for Grant ${g.id}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Failed to list Grants: ${e.message}`);
      }

      // SOWs — clear pdf_url and extracted tables (include required fields in patch)
      try {
        const sows = await base44.asServiceRole.entities.SOW.list();
        for (const s of sows) {
          const updates = {};
          if (s.pdf_url) updates.pdf_url = '';
          if (s.rate_cards?.length) updates.rate_cards = [];
          if (s.commercial_tables?.length) updates.commercial_tables = [];
          if (s.payment_schedule_tables?.length) updates.payment_schedule_tables = [];
          if (s.normalized_rate_items?.length) updates.normalized_rate_items = [];
          if (Object.keys(updates).length) {
            try {
              await base44.asServiceRole.entities.SOW.update(s.id, {
                title: s.title || 'SOW',
                vendor_name: s.vendor_name || 'Unknown',
                ...updates
              });
              recordsUpdatedCount++;
              metadataClearedCount++;
            } catch (e) {
              errors.push(`Failed to clear SOW ${s.id}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Failed to list SOWs: ${e.message}`);
      }

      // MSAs — clear pdf_url only (include title + vendor_name to satisfy required fields)
      try {
        const msas = await base44.asServiceRole.entities.MSA.list();
        for (const m of msas) {
          if (m.pdf_url) {
            try {
              await base44.asServiceRole.entities.MSA.update(m.id, {
                title: m.title || 'MSA',
                vendor_name: m.vendor_name || 'Unknown',
                pdf_url: ''
              });
              recordsUpdatedCount++;
            } catch (e) {
              errors.push(`Failed to clear pdf_url for MSA ${m.id}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Failed to list MSAs: ${e.message}`);
      }

      // MOUs — clear pdf_url and rate_cards (include required fields in patch)
      try {
        const mous = await base44.asServiceRole.entities.MOU.list();
        for (const m of mous) {
          const updates = {};
          if (m.pdf_url) updates.pdf_url = '';
          if (m.rate_cards?.length) updates.rate_cards = [];
          if (Object.keys(updates).length) {
            try {
              await base44.asServiceRole.entities.MOU.update(m.id, {
                title: m.title || 'MOU',
                partner_name: m.partner_name || 'Unknown',
                ...updates
              });
              recordsUpdatedCount++;
              metadataClearedCount++;
            } catch (e) {
              errors.push(`Failed to clear MOU ${m.id}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Failed to list MOUs: ${e.message}`);
      }
    }

    // ── 4. Delete extracted deliverables / milestones from PDFs ─────────────
    if (['files_and_extracted_items', 'full_file_cleanup'].includes(scope) || include_extracted_items) {
      // Grant deliverables from PDFs
      try {
        const grantDels = await base44.asServiceRole.entities.GrantDeliverable.filter({ extracted_from_pdf: true });
        for (const d of grantDels) {
          try {
            await base44.asServiceRole.entities.GrantDeliverable.delete(d.id);
            extractedItemsDeletedCount++;
          } catch (e) {
            errors.push(`Failed to delete GrantDeliverable ${d.id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`Failed to list GrantDeliverables: ${e.message}`);
      }

      // Grant milestones from PDFs
      try {
        const grantMils = await base44.asServiceRole.entities.Milestone.filter({ extracted_from_pdf: true });
        for (const m of grantMils) {
          try {
            await base44.asServiceRole.entities.Milestone.delete(m.id);
            extractedItemsDeletedCount++;
          } catch (e) {
            errors.push(`Failed to delete Milestone ${m.id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`Failed to list Milestones: ${e.message}`);
      }

      // SOW deliverables from PDFs
      try {
        const sowDels = await base44.asServiceRole.entities.SowDeliverable.filter({ extracted_from_pdf: true });
        for (const d of sowDels) {
          try {
            await base44.asServiceRole.entities.SowDeliverable.delete(d.id);
            extractedItemsDeletedCount++;
          } catch (e) {
            errors.push(`Failed to delete SowDeliverable ${d.id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`Failed to list SowDeliverables: ${e.message}`);
      }

      // SOW milestones from PDFs
      try {
        const sowMils = await base44.asServiceRole.entities.SowMilestone.filter({ extracted_from_pdf: true });
        for (const m of sowMils) {
          try {
            await base44.asServiceRole.entities.SowMilestone.delete(m.id);
            extractedItemsDeletedCount++;
          } catch (e) {
            errors.push(`Failed to delete SowMilestone ${m.id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`Failed to list SowMilestones: ${e.message}`);
      }
    }

    const completedAt = new Date().toISOString();
    const scopeLabel = {
      files_only: 'Files Only',
      files_and_validation_logs: 'Files + Validation Logs',
      files_metadata_and_tables: 'Files + Metadata + Tables',
      files_and_extracted_items: 'Files + Extracted Items',
      full_file_cleanup: 'Full File Cleanup',
    }[scope] || scope;

    // ── 5. Write CleanupLog (non-critical — don't fail cleanup if this errors) ──
    try {
      await base44.asServiceRole.entities.CleanupLog.create({
        cleanup_type: 'file_cleanup',
        cleanup_scope: scope,
        initiated_by: user.full_name || user.email,
        initiated_by_email: user.email,
        started_at: startedAt,
        completed_at: completedAt,
        status: errors.length > 0 ? 'failed' : 'completed',
        files_deleted_count: documentLogsDeletedCount,
        document_logs_deleted_count: documentLogsDeletedCount,
        validation_logs_deleted_count: validationLogsDeletedCount,
        metadata_cleared_count: metadataClearedCount,
        records_updated_count: recordsUpdatedCount,
        extracted_items_deleted_count: extractedItemsDeletedCount,
        errors,
        backup_exported: backup_exported || false,
        summary: `[${scopeLabel}] Deleted ${documentLogsDeletedCount} upload logs, ${validationLogsDeletedCount} validation logs, cleared ${metadataClearedCount} metadata tables, updated ${recordsUpdatedCount} records, deleted ${extractedItemsDeletedCount} extracted items.`
      });
    } catch (logErr) {
      console.warn('CleanupLog write failed (non-critical):', logErr.message);
    }

    // ── 6. Write AuditLog (non-critical) ────────────────────────────────────
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action_type: 'file_cleanup',
        entity_type: 'System',
        entity_name: scopeLabel,
        user_email: user.email,
        user_name: user.full_name || user.email,
        description: `Admin performed file cleanup. Scope: ${scopeLabel}. Deleted ${documentLogsDeletedCount} upload logs, ${validationLogsDeletedCount} validation logs, ${extractedItemsDeletedCount} extracted items. Updated ${recordsUpdatedCount} records.`,
        status: errors.length > 0 ? 'warning' : 'success'
      });
    } catch (auditErr) {
      console.warn('AuditLog write failed (non-critical):', auditErr.message);
    }

    const hasErrors = errors.length > 0;
    const totalDeleted = documentLogsDeletedCount + validationLogsDeletedCount + extractedItemsDeletedCount;

    return Response.json({
      success: true,
      message: hasErrors
        ? 'File cleanup completed with some warnings.'
        : 'File cleanup completed successfully.',
      stats: {
        document_logs_deleted: documentLogsDeletedCount,
        validation_logs_deleted: validationLogsDeletedCount,
        metadata_cleared: metadataClearedCount,
        records_updated: recordsUpdatedCount,
        extracted_items_deleted: extractedItemsDeletedCount,
        total_deleted: totalDeleted,
      },
      errors
    });

  } catch (error) {
    return Response.json({ success: false, message: 'File cleanup failed.', error: error.message }, { status: 500 });
  }
});