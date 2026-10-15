-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "EnvironmentName" AS ENUM ('production', 'staging');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('active', 'pending', 'completed', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "ReportingCycle" AS ENUM ('monthly', 'quarterly', 'bi-annual', 'annual', 'ad-hoc');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pending', 'invoiced', 'paid', 'overdue');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('Payment', 'Reporting', 'Program', 'Compliance', 'Audit', 'Review', 'Other');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('pending', 'in_progress', 'completed', 'overdue');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('Low', 'Medium', 'High');

-- CreateEnum
CREATE TYPE "GrantDeliverableCategory" AS ENUM ('Program', 'Financial', 'Reporting', 'Compliance', 'Documentation', 'Technical', 'Other');

-- CreateEnum
CREATE TYPE "TrancheStatus" AS ENUM ('pending', 'invoiced', 'received', 'overdue');

-- CreateEnum
CREATE TYPE "ObligationType" AS ENUM ('Quarterly Report', 'Annual Report', 'Audit Submission', 'Ad Hoc');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('Pending', 'Submitted', 'Overdue');

-- CreateEnum
CREATE TYPE "ReportingDeadlineStatus" AS ENUM ('upcoming', 'submitted', 'overdue');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('Green', 'Amber', 'Red');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('active', 'expired', 'draft', 'terminated');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('government', 'ngo', 'private', 'academic', 'multilateral', 'other');

-- CreateEnum
CREATE TYPE "ReviewCycle" AS ENUM ('6 months', 'annual', 'bi-annual', 'as needed');

-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM ('Operational', 'Legal', 'Reporting', 'Financial', 'Confidentiality', 'Governance', 'Collaboration', 'Other');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('eGov', 'Partner', 'Both Parties', 'Other');

-- CreateEnum
CREATE TYPE "ClauseType" AS ENUM ('Commercial', 'Legal', 'Operational', 'Compliance', 'Risk', 'Other');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('Low', 'Medium', 'High');

-- CreateEnum
CREATE TYPE "SowMilestoneType" AS ENUM ('Payment', 'Delivery', 'Review', 'Release', 'Support', 'Documentation', 'Other');

-- CreateEnum
CREATE TYPE "SowDeliverableCategory" AS ENUM ('Technical', 'Documentation', 'Support', 'Training', 'Configuration', 'Deployment', 'Reporting', 'Other');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('Grant', 'SOW', 'MSA', 'MOU');

-- CreateEnum
CREATE TYPE "SelectedModule" AS ENUM ('Grant', 'SOW', 'MSA', 'MOU', 'Milestone', 'Deliverable', 'Invoice', 'ReportingObligation');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('Valid', 'Invalid', 'Duplicate', 'PendingReview', 'NeedsReview', 'ForceApproved');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('approved', 'reclassified', 'deleted', 'force_approved');

-- CreateEnum
CREATE TYPE "DeletionType" AS ENUM ('admin_discard', 'duplicate_cleanup', 'invalid_file_cleanup', 'irrelevant_file_cleanup');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('milestone_due', 'deliverable_due', 'reporting_due', 'payment_due', 'contract_expiry', 'document_review');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('milestone_upcoming', 'milestone_overdue', 'deliverable_upcoming', 'deliverable_overdue', 'reporting_upcoming', 'reporting_overdue', 'payment_upcoming', 'payment_overdue', 'contract_expiry', 'document_review', 'test_email');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('upcoming', 'overdue', 'test');

-- CreateEnum
CREATE TYPE "RecipientSource" AS ENUM ('Record Contact', 'Additional Recipient');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('success', 'warning', 'error');

-- CreateEnum
CREATE TYPE "CleanupType" AS ENUM ('file_cleanup', 'full_cleanup');

-- CreateEnum
CREATE TYPE "CleanupScope" AS ENUM ('files_only', 'files_and_validation_logs', 'files_metadata_and_tables', 'files_and_extracted_items', 'full_file_cleanup');

-- CreateEnum
CREATE TYPE "CleanupStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "display_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "allowed_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "can_upload_pdf" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "tokens_valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "days_before" INTEGER NOT NULL DEFAULT 7,
    "alert_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "environment_name" "EnvironmentName" NOT NULL DEFAULT 'production',
    "environment_label_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grants" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "funder" TEXT,
    "grant_number" TEXT,
    "description" TEXT,
    "total_amount" DECIMAL(18,2),
    "start_date" DATE,
    "end_date" DATE,
    "status" "GrantStatus" NOT NULL DEFAULT 'active',
    "reporting_cycle" "ReportingCycle",
    "pdf_url" TEXT,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "notification_days_before" INTEGER NOT NULL DEFAULT 7,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "milestone_type" "MilestoneType" NOT NULL DEFAULT 'Other',
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "percentage" TEXT,
    "due_date" DATE,
    "paid_date" DATE,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pending',
    "acceptance_criteria" TEXT,
    "source_section" TEXT,
    "extraction_confidence" DOUBLE PRECISION,
    "extracted_from_pdf" BOOLEAN NOT NULL DEFAULT false,
    "source_document_id" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_deliverables" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "phase" TEXT,
    "category" "GrantDeliverableCategory" NOT NULL DEFAULT 'Other',
    "due_date" DATE,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'pending',
    "acceptance_criteria" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'Medium',
    "source_section" TEXT,
    "extraction_confidence" DOUBLE PRECISION,
    "extracted_from_pdf" BOOLEAN NOT NULL DEFAULT false,
    "source_document_id" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "grant_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_tranches" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "tranche_name" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "invoice_trigger_date" DATE,
    "due_date" DATE,
    "invoice_date" DATE,
    "received_date" DATE,
    "status" "TrancheStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "grant_tranches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_reporting_obligations" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "obligation_name" TEXT NOT NULL,
    "obligation_type" "ObligationType",
    "due_date" DATE NOT NULL,
    "submitted_date" DATE,
    "status" "ObligationStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "grant_reporting_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_deadlines" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "ReportingDeadlineStatus" NOT NULL DEFAULT 'upcoming',
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "reporting_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_health_score_configs" (
    "id" TEXT NOT NULL,
    "parameter_key" TEXT NOT NULL,
    "parameter_name" TEXT NOT NULL,
    "weightage" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "grant_health_score_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_health_score_snapshots" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "grant_name" TEXT,
    "milestone_score" DOUBLE PRECISION,
    "financial_score" DOUBLE PRECISION,
    "reporting_score" DOUBLE PRECISION,
    "document_score" DOUBLE PRECISION,
    "timeline_score" DOUBLE PRECISION,
    "milestone_weightage" DOUBLE PRECISION,
    "financial_weightage" DOUBLE PRECISION,
    "reporting_weightage" DOUBLE PRECISION,
    "document_weightage" DOUBLE PRECISION,
    "timeline_weightage" DOUBLE PRECISION,
    "milestone_weighted_score" DOUBLE PRECISION,
    "financial_weighted_score" DOUBLE PRECISION,
    "reporting_weighted_score" DOUBLE PRECISION,
    "document_weighted_score" DOUBLE PRECISION,
    "timeline_weighted_score" DOUBLE PRECISION,
    "overall_score" DOUBLE PRECISION,
    "health_status" "HealthStatus",
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calculated_date" TIMESTAMP(3),
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "grant_health_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mous" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "partner_name" TEXT NOT NULL,
    "mou_number" TEXT,
    "partner_type" "PartnerType",
    "partner_address" TEXT,
    "partner_contact_name" TEXT,
    "partner_contact_email" TEXT,
    "partner_signatory_name" TEXT,
    "partner_signatory_designation" TEXT,
    "our_contact_name" TEXT,
    "our_contact_email" TEXT,
    "our_signatory_name" TEXT,
    "our_signatory_designation" TEXT,
    "signed_date" DATE,
    "effective_date" DATE,
    "end_date" DATE,
    "initial_term_years" DOUBLE PRECISION,
    "review_cycle" "ReviewCycle",
    "status" "AgreementStatus" NOT NULL DEFAULT 'active',
    "purpose" TEXT,
    "scope_of_collaboration" TEXT,
    "governing_law" TEXT,
    "pdf_url" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "rate_cards" JSONB NOT NULL DEFAULT '[]',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "mous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mou_commitments" (
    "id" TEXT NOT NULL,
    "mou_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "commitment_type" "CommitmentType" NOT NULL DEFAULT 'Operational',
    "responsible_party" "ResponsibleParty" NOT NULL DEFAULT 'Both Parties',
    "due_date" DATE,
    "frequency" TEXT,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'pending',
    "source_section" TEXT,
    "source_clause" TEXT,
    "source_page" TEXT,
    "extraction_confidence" DOUBLE PRECISION,
    "extracted_from_pdf" BOOLEAN NOT NULL DEFAULT false,
    "source_document_id" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "mou_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "msas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "msa_number" TEXT,
    "vendor_address" TEXT,
    "vendor_contact_name" TEXT,
    "vendor_contact_email" TEXT,
    "our_contact_name" TEXT,
    "our_contact_email" TEXT,
    "effective_date" DATE,
    "end_date" DATE,
    "initial_term_years" DOUBLE PRECISION,
    "status" "AgreementStatus" NOT NULL DEFAULT 'active',
    "governing_law" TEXT,
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "notice_period" TEXT,
    "liability_cap" TEXT,
    "ip_ownership" TEXT,
    "description" TEXT,
    "key_terms" TEXT,
    "pdf_url" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "structured_services" JSONB NOT NULL DEFAULT '[]',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "msas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "msa_key_clauses" (
    "id" TEXT NOT NULL,
    "msa_id" TEXT NOT NULL,
    "clause_title" TEXT NOT NULL,
    "clause_name" TEXT,
    "clause_type" "ClauseType" NOT NULL DEFAULT 'Legal',
    "clause_number" TEXT,
    "clause_reference" TEXT,
    "summary" TEXT,
    "full_text" TEXT,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'Medium',
    "obligation_owner" TEXT,
    "notice_period_days" TEXT,
    "amount_or_cap" TEXT,
    "source_section" TEXT,
    "source_page" TEXT,
    "confidence" DOUBLE PRECISION,
    "extracted_from_pdf" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "msa_key_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sows" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "sow_number" TEXT,
    "grant_id" TEXT,
    "msa_id" TEXT,
    "vendor_email" TEXT,
    "description" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "status" "AgreementStatus" NOT NULL DEFAULT 'active',
    "monthly_rate" DECIMAL(18,2),
    "total_value" DECIMAL(18,2),
    "payment_day" INTEGER,
    "advance_amount" DECIMAL(18,2),
    "pdf_url" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "personnel" JSONB NOT NULL DEFAULT '[]',
    "rate_cards" JSONB NOT NULL DEFAULT '[]',
    "commercial_tables" JSONB NOT NULL DEFAULT '[]',
    "payment_schedule_tables" JSONB NOT NULL DEFAULT '[]',
    "normalized_rate_items" JSONB NOT NULL DEFAULT '[]',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "sows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sow_milestones" (
    "id" TEXT NOT NULL,
    "sow_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "milestone_type" "SowMilestoneType" NOT NULL DEFAULT 'Payment',
    "due_date" DATE,
    "percentage" TEXT,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pending',
    "acceptance_criteria" TEXT,
    "source_section" TEXT,
    "extraction_confidence" DOUBLE PRECISION,
    "extracted_from_pdf" BOOLEAN NOT NULL DEFAULT false,
    "source_document_id" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "sow_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sow_deliverables" (
    "id" TEXT NOT NULL,
    "sow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "SowDeliverableCategory" NOT NULL DEFAULT 'Other',
    "due_date" DATE,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'pending',
    "acceptance_criteria" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'Medium',
    "source_section" TEXT,
    "extraction_confidence" DOUBLE PRECISION,
    "extracted_from_pdf" BOOLEAN NOT NULL DEFAULT false,
    "source_document_id" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "sow_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sow_invoices" (
    "id" TEXT NOT NULL,
    "sow_id" TEXT NOT NULL,
    "invoice_number" TEXT,
    "period" TEXT,
    "amount" DECIMAL(18,2),
    "invoice_date" DATE,
    "due_date" DATE,
    "paid_date" DATE,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "sow_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "entity_type" "DocumentEntityType",
    "entity_id" TEXT,
    "uploaded_by" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_upload_logs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_hash" TEXT,
    "entity_type" "DocumentEntityType" NOT NULL,
    "entity_id" TEXT,
    "entity_name" TEXT,
    "uploaded_by" TEXT,
    "is_dpi_relevant" BOOLEAN,
    "dpi_relevance_reason" TEXT,
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "is_invalid" BOOLEAN NOT NULL DEFAULT false,
    "invalid_reason" TEXT,
    "is_rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "document_upload_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_validation_logs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT,
    "file_hash" TEXT,
    "selected_module" "SelectedModule" NOT NULL,
    "linked_entity_id" TEXT,
    "linked_entity_name" TEXT,
    "detected_document_type" TEXT,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'PendingReview',
    "confidence_score" DOUBLE PRECISION,
    "rejection_reason" TEXT,
    "extracted_metadata" JSONB,
    "duplicate_of_document_id" TEXT,
    "uploaded_by" TEXT,
    "reviewed_by" TEXT,
    "reviewed_date" TIMESTAMP(3),
    "review_action" "ReviewAction",
    "force_approved_reason" TEXT,
    "reclassified_to" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by" TEXT,
    "deleted_date" TIMESTAMP(3),
    "deletion_reason" TEXT,
    "deletion_type" "DeletionType",
    "deleted_from_section" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "document_validation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "name" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "trigger_type" "TriggerType" NOT NULL,
    "reminder_days_before" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "overdue_frequency_days" INTEGER NOT NULL DEFAULT 7,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "template_type_upcoming" TEXT,
    "template_type_overdue" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_type" "TemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "rule_name" TEXT NOT NULL,
    "notification_type" "NotificationType" NOT NULL DEFAULT 'upcoming',
    "record_type" TEXT,
    "record_id" TEXT,
    "item_type" TEXT,
    "item_id" TEXT NOT NULL,
    "item_title" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_source" "RecipientSource",
    "scheduled_for_date" DATE NOT NULL,
    "sent_date" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'sent',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "initiated_by" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "entity_name" TEXT,
    "grant_id" TEXT,
    "user_email" TEXT,
    "user_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "description" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'success',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleanup_logs" (
    "id" TEXT NOT NULL,
    "cleanup_type" "CleanupType",
    "cleanup_scope" "CleanupScope" NOT NULL,
    "initiated_by" TEXT,
    "initiated_by_email" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" "CleanupStatus" NOT NULL DEFAULT 'running',
    "files_deleted_count" INTEGER NOT NULL DEFAULT 0,
    "document_logs_deleted_count" INTEGER NOT NULL DEFAULT 0,
    "validation_logs_deleted_count" INTEGER NOT NULL DEFAULT 0,
    "metadata_cleared_count" INTEGER NOT NULL DEFAULT 0,
    "records_updated_count" INTEGER NOT NULL DEFAULT 0,
    "extracted_items_deleted_count" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "backup_exported" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "cleanup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "grants_status_idx" ON "grants"("status");

-- CreateIndex
CREATE INDEX "grants_archived_idx" ON "grants"("archived");

-- CreateIndex
CREATE INDEX "milestones_grant_id_idx" ON "milestones"("grant_id");

-- CreateIndex
CREATE INDEX "milestones_due_date_idx" ON "milestones"("due_date");

-- CreateIndex
CREATE INDEX "grant_deliverables_grant_id_idx" ON "grant_deliverables"("grant_id");

-- CreateIndex
CREATE INDEX "grant_deliverables_due_date_idx" ON "grant_deliverables"("due_date");

-- CreateIndex
CREATE INDEX "grant_tranches_grant_id_idx" ON "grant_tranches"("grant_id");

-- CreateIndex
CREATE INDEX "grant_reporting_obligations_grant_id_idx" ON "grant_reporting_obligations"("grant_id");

-- CreateIndex
CREATE INDEX "grant_reporting_obligations_due_date_idx" ON "grant_reporting_obligations"("due_date");

-- CreateIndex
CREATE INDEX "reporting_deadlines_grant_id_idx" ON "reporting_deadlines"("grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_health_score_configs_parameter_key_key" ON "grant_health_score_configs"("parameter_key");

-- CreateIndex
CREATE INDEX "grant_health_score_snapshots_grant_id_idx" ON "grant_health_score_snapshots"("grant_id");

-- CreateIndex
CREATE INDEX "mous_status_idx" ON "mous"("status");

-- CreateIndex
CREATE INDEX "mous_archived_idx" ON "mous"("archived");

-- CreateIndex
CREATE INDEX "mou_commitments_mou_id_idx" ON "mou_commitments"("mou_id");

-- CreateIndex
CREATE INDEX "msas_status_idx" ON "msas"("status");

-- CreateIndex
CREATE INDEX "msas_archived_idx" ON "msas"("archived");

-- CreateIndex
CREATE INDEX "msa_key_clauses_msa_id_idx" ON "msa_key_clauses"("msa_id");

-- CreateIndex
CREATE INDEX "sows_grant_id_idx" ON "sows"("grant_id");

-- CreateIndex
CREATE INDEX "sows_msa_id_idx" ON "sows"("msa_id");

-- CreateIndex
CREATE INDEX "sows_status_idx" ON "sows"("status");

-- CreateIndex
CREATE INDEX "sows_archived_idx" ON "sows"("archived");

-- CreateIndex
CREATE INDEX "sow_milestones_sow_id_idx" ON "sow_milestones"("sow_id");

-- CreateIndex
CREATE INDEX "sow_milestones_due_date_idx" ON "sow_milestones"("due_date");

-- CreateIndex
CREATE INDEX "sow_deliverables_sow_id_idx" ON "sow_deliverables"("sow_id");

-- CreateIndex
CREATE INDEX "sow_deliverables_due_date_idx" ON "sow_deliverables"("due_date");

-- CreateIndex
CREATE INDEX "sow_invoices_sow_id_idx" ON "sow_invoices"("sow_id");

-- CreateIndex
CREATE INDEX "sow_invoices_due_date_idx" ON "sow_invoices"("due_date");

-- CreateIndex
CREATE INDEX "stored_files_sha256_idx" ON "stored_files"("sha256");

-- CreateIndex
CREATE INDEX "stored_files_entity_type_entity_id_idx" ON "stored_files"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "document_upload_logs_entity_type_entity_id_idx" ON "document_upload_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "document_upload_logs_file_hash_idx" ON "document_upload_logs"("file_hash");

-- CreateIndex
CREATE INDEX "document_validation_logs_validation_status_idx" ON "document_validation_logs"("validation_status");

-- CreateIndex
CREATE INDEX "document_validation_logs_is_deleted_idx" ON "document_validation_logs"("is_deleted");

-- CreateIndex
CREATE INDEX "document_validation_logs_file_hash_idx" ON "document_validation_logs"("file_hash");

-- CreateIndex
CREATE INDEX "notification_logs_scheduled_for_date_idx" ON "notification_logs"("scheduled_for_date");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_rule_id_item_id_recipient_email_scheduled_key" ON "notification_logs"("rule_id", "item_id", "recipient_email", "scheduled_for_date", "is_test");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_date_idx" ON "audit_logs"("created_date");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_deliverables" ADD CONSTRAINT "grant_deliverables_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_tranches" ADD CONSTRAINT "grant_tranches_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_reporting_obligations" ADD CONSTRAINT "grant_reporting_obligations_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_deadlines" ADD CONSTRAINT "reporting_deadlines_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_health_score_snapshots" ADD CONSTRAINT "grant_health_score_snapshots_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mou_commitments" ADD CONSTRAINT "mou_commitments_mou_id_fkey" FOREIGN KEY ("mou_id") REFERENCES "mous"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "msa_key_clauses" ADD CONSTRAINT "msa_key_clauses_msa_id_fkey" FOREIGN KEY ("msa_id") REFERENCES "msas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sows" ADD CONSTRAINT "sows_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sows" ADD CONSTRAINT "sows_msa_id_fkey" FOREIGN KEY ("msa_id") REFERENCES "msas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sow_milestones" ADD CONSTRAINT "sow_milestones_sow_id_fkey" FOREIGN KEY ("sow_id") REFERENCES "sows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sow_deliverables" ADD CONSTRAINT "sow_deliverables_sow_id_fkey" FOREIGN KEY ("sow_id") REFERENCES "sows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sow_invoices" ADD CONSTRAINT "sow_invoices_sow_id_fkey" FOREIGN KEY ("sow_id") REFERENCES "sows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
