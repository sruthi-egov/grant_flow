import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import type { AuthenticatedUser } from '../common/decorators';

/**
 * Destructive maintenance operations.
 * Ports of the Base44 `performDatabaseReset` and `performFileCleanup`
 * functions. Both are admin-only and both record what they did in CleanupLog.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /**
   * Clears transactional records while preserving users, settings,
   * notification rules and templates — matching what the UI promises
   * on the Database Reset panel.
   */
  async resetDatabase(
    options: {
      backup_exported?: boolean;
      delete_audit_logs?: boolean;
      delete_notification_logs?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    if (options?.backup_exported !== true) {
      throw new BadRequestException(
        'Export a backup before resetting. The reset will not run until backup_exported is true.',
      );
    }

    const startedAt = new Date();
    const errors: string[] = [];
    const deleted: Record<string, number> = {};

    const log = await this.prisma.cleanupLog.create({
      data: {
        cleanup_type: 'full_cleanup',
        cleanup_scope: 'files_metadata_and_tables',
        initiated_by: actor.display_name ?? actor.email,
        initiated_by_email: actor.email,
        started_at: startedAt,
        status: 'running',
        backup_exported: true,
      },
    });

    try {
      // Children first so foreign keys stay satisfied even though most
      // relations cascade.
      const order: Array<[string, any]> = [
        ['SowInvoice', this.prisma.sowInvoice],
        ['SowMilestone', this.prisma.sowMilestone],
        ['SowDeliverable', this.prisma.sowDeliverable],
        ['MsaKeyClause', this.prisma.msaKeyClause],
        ['MouCommitment', this.prisma.mouCommitment],
        ['Milestone', this.prisma.milestone],
        ['GrantDeliverable', this.prisma.grantDeliverable],
        ['GrantTranche', this.prisma.grantTranche],
        ['GrantReportingObligation', this.prisma.grantReportingObligation],
        ['ReportingDeadline', this.prisma.reportingDeadline],
        ['GrantHealthScoreSnapshot', this.prisma.grantHealthScoreSnapshot],
        ['SOW', this.prisma.sow],
        ['MSA', this.prisma.msa],
        ['MOU', this.prisma.mou],
        ['Grant', this.prisma.grant],
        ['DocumentValidationLog', this.prisma.documentValidationLog],
        ['DocumentUploadLog', this.prisma.documentUploadLog],
        ['StoredFile', this.prisma.storedFile],
      ];

      for (const [name, delegate] of order) {
        try {
          const result = await delegate.deleteMany({});
          deleted[name] = result.count;
        } catch (error: any) {
          errors.push(`${name}: ${error?.message ?? error}`);
        }
      }

      if (options.delete_notification_logs) {
        const r = await this.prisma.notificationLog.deleteMany({});
        deleted['NotificationLog'] = r.count;
      }
      if (options.delete_audit_logs) {
        const r = await this.prisma.auditLog.deleteMany({});
        deleted['AuditLog'] = r.count;
      }

      // Stored blobs are now unreferenced.
      const removedBlobs = await this.purgeOrphanBlobs(errors);
      deleted['files_on_disk'] = removedBlobs;

      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      const summary = `Reset by ${actor.email}: ${total} records removed across ${
        Object.keys(deleted).length
      } tables. Users, settings, notification rules and templates preserved.`;

      await this.prisma.cleanupLog.update({
        where: { id: log.id },
        data: {
          completed_at: new Date(),
          status: errors.length ? 'failed' : 'completed',
          records_updated_count: total,
          files_deleted_count: removedBlobs,
          errors,
          summary,
        },
      });

      this.logger.warn(summary);

      return {
        success: errors.length === 0,
        message: summary,
        deleted_counts: deleted,
        errors,
      };
    } catch (error: any) {
      await this.prisma.cleanupLog.update({
        where: { id: log.id },
        data: { completed_at: new Date(), status: 'failed', errors: [error?.message ?? String(error)] },
      });
      throw error;
    }
  }

  /** Port of `performFileCleanup`. */
  async cleanupFiles(
    options: { scope?: string; backup_exported?: boolean },
    actor: AuthenticatedUser,
  ) {
    const scope = options?.scope ?? 'files_only';
    const validScopes = [
      'files_only',
      'files_and_validation_logs',
      'files_metadata_and_tables',
      'files_and_extracted_items',
      'full_file_cleanup',
    ];
    if (!validScopes.includes(scope)) {
      throw new BadRequestException(`Unknown cleanup scope "${scope}"`);
    }
    if (options?.backup_exported !== true) {
      throw new BadRequestException(
        'Export a backup before running file cleanup.',
      );
    }

    const errors: string[] = [];
    const stats: Record<string, number> = {
      files_deleted: 0,
      document_logs_deleted: 0,
      validation_logs_deleted: 0,
      metadata_cleared: 0,
      extracted_items_deleted: 0,
    };

    const log = await this.prisma.cleanupLog.create({
      data: {
        cleanup_type: 'file_cleanup',
        cleanup_scope: scope as any,
        initiated_by: actor.display_name ?? actor.email,
        initiated_by_email: actor.email,
        started_at: new Date(),
        status: 'running',
        backup_exported: true,
      },
    });

    try {
      // Always: drop upload logs and stored-file rows.
      stats.document_logs_deleted = (await this.prisma.documentUploadLog.deleteMany({})).count;

      if (
        ['files_and_validation_logs', 'files_metadata_and_tables', 'full_file_cleanup'].includes(scope)
      ) {
        stats.validation_logs_deleted = (
          await this.prisma.documentValidationLog.deleteMany({})
        ).count;
      }

      if (['files_metadata_and_tables', 'full_file_cleanup'].includes(scope)) {
        // Clear pdf_url on parent records so the UI stops offering dead links.
        const cleared = await Promise.all([
          this.prisma.grant.updateMany({ where: { pdf_url: { not: null } }, data: { pdf_url: null } }),
          this.prisma.sow.updateMany({ where: { pdf_url: { not: null } }, data: { pdf_url: null } }),
          this.prisma.msa.updateMany({ where: { pdf_url: { not: null } }, data: { pdf_url: null } }),
          this.prisma.mou.updateMany({ where: { pdf_url: { not: null } }, data: { pdf_url: null } }),
        ]);
        stats.metadata_cleared = cleared.reduce((sum, r) => sum + r.count, 0);
      }

      if (['files_and_extracted_items', 'full_file_cleanup'].includes(scope)) {
        const extracted = await Promise.all([
          this.prisma.milestone.deleteMany({ where: { extracted_from_pdf: true } }),
          this.prisma.grantDeliverable.deleteMany({ where: { extracted_from_pdf: true } }),
          this.prisma.sowMilestone.deleteMany({ where: { extracted_from_pdf: true } }),
          this.prisma.sowDeliverable.deleteMany({ where: { extracted_from_pdf: true } }),
          this.prisma.mouCommitment.deleteMany({ where: { extracted_from_pdf: true } }),
          this.prisma.msaKeyClause.deleteMany({ where: { extracted_from_pdf: true } }),
        ]);
        stats.extracted_items_deleted = extracted.reduce((sum, r) => sum + r.count, 0);
      }

      const storedFiles = await this.prisma.storedFile.findMany({ select: { id: true } });
      for (const f of storedFiles) {
        const result = await this.files.remove(f.id).catch((e) => {
          errors.push(`file ${f.id}: ${e?.message ?? e}`);
          return { deleted_blob: false };
        });
        if (result.deleted_blob) stats.files_deleted += 1;
      }

      const summary = `File cleanup (${scope}) by ${actor.email}: ${stats.files_deleted} files removed from disk.`;

      await this.prisma.cleanupLog.update({
        where: { id: log.id },
        data: {
          completed_at: new Date(),
          status: errors.length ? 'failed' : 'completed',
          files_deleted_count: stats.files_deleted,
          document_logs_deleted_count: stats.document_logs_deleted,
          validation_logs_deleted_count: stats.validation_logs_deleted,
          metadata_cleared_count: stats.metadata_cleared,
          extracted_items_deleted_count: stats.extracted_items_deleted,
          errors,
          summary,
        },
      });

      this.logger.warn(summary);
      return { success: errors.length === 0, stats, errors };
    } catch (error: any) {
      await this.prisma.cleanupLog.update({
        where: { id: log.id },
        data: { completed_at: new Date(), status: 'failed', errors: [error?.message ?? String(error)] },
      });
      throw error;
    }
  }

  private async purgeOrphanBlobs(errors: string[]): Promise<number> {
    const remaining = await this.prisma.storedFile.findMany({ select: { id: true } });
    let removed = 0;
    for (const f of remaining) {
      try {
        const result = await this.files.remove(f.id);
        if (result.deleted_blob) removed += 1;
      } catch (error: any) {
        errors.push(`blob ${f.id}: ${error?.message ?? error}`);
      }
    }
    return removed;
  }
}
