/**
 * Document Intelligence — validation, classification, metadata extraction.
 * Shared utility used by all module uploaders.
 */
import { api } from "@/api/apiClient";
import { logAudit } from "./auditLogger";

/**
 * Broad, equivalent-aware keyword sets per module.
 * Exact matches are not required — the AI is instructed to use context.
 */
const MODULE_KEYWORDS = {
  Grant: [
    "grant", "grant agreement", "funding agreement", "donor", "funder",
    "grant amount", "award", "budget", "recipient", "reporting obligation",
    "utilization certificate", "grant period", "disbursement"
  ],
  SOW: [
    "scope of work", "statement of work", "work order", "deliverables",
    "vendor", "service provider", "implementation partner", "payment terms",
    "contract period", "services", "milestones", "SOW"
  ],
  MSA: [
    "master service agreement", "service agreement", "MSA", "legal terms",
    "liability", "termination", "renewal", "governing law", "parties",
    "indemnification", "confidentiality", "intellectual property"
  ],
  MOU: [
    "memorandum of understanding", "MOU", "MoU", "agreement", "parties",
    "purpose", "responsibilities", "collaboration", "validity period",
    "terms of collaboration", "authorized signatory", "signature",
    "DPI Centre", "DPI Centre Ltd", "DPI Centre Limited", "DPI-Centre",
    "Digital Public Infrastructure Centre", "DPIC",
    "Technology Implementation Partner", "Implementation Partner",
    "partner organization", "recipient organization"
  ],
  Milestone: [
    "milestone", "completion criteria", "deliverable reference",
    "due date", "acceptance criteria", "payment milestone"
  ],
  Deliverable: [
    "deliverable", "output", "submission", "acceptance criteria",
    "completion evidence", "deliverable report"
  ],
  Invoice: [
    "invoice", "invoice number", "invoice date", "billing", "vendor",
    "tax invoice", "due date", "payment terms", "amount due", "amount payable"
  ],
  ReportingObligation: [
    "progress report", "financial report", "donor report", "quarterly report",
    "annual report", "utilization report", "submission date", "reporting",
    "narrative report", "compliance report"
  ],
};

/**
 * Positive evidence phrases — if any appear in validation_reason,
 * the result should never be left as Invalid without clear cause.
 */
const POSITIVE_EVIDENCE_PHRASES = [
  "formal party", "is a party", "parties to the agreement",
  "identifies dpi centre", "dpi centre ltd", "dpi centre limited",
  "digital public infrastructure centre", "technology implementation partner",
  "implementation partner", "signed on behalf", "signature", "signatory",
  "memorandum of understanding", "valid mou", "valid agreement",
  "agreement between", "grant agreement", "service agreement",
  "master service agreement", "statement of work", "scope of work",
  "invoice number", "valid invoice", "progress report", "donor report",
  "clearly relates", "is valid", "is relevant", "acceptable document"
];

/**
 * Clear invalid signal phrases — only these justify keeping Invalid status
 * even when some evidence exists.
 */
const CLEAR_INVALID_PHRASES = [
  "not an mou", "not an agreement", "not a grant", "not an invoice",
  "not a sow", "not an msa", "no parties identified", "unrelated document",
  "resume", "brochure", "unreadable", "blank document", "wrong document type",
  "no dpi centre", "no agreement evidence", "no relevant content"
];

/** Compute SHA-256 hash */
export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Check duplicate by hash in DocumentValidationLog */
export async function checkDuplicate(hash) {
  try {
    const logs = await api.entities.DocumentValidationLog.filter({ file_hash: hash });
    return logs.length > 0 ? logs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Guardrail: resolve contradictory AI outputs.
 * If reason contains strong positive evidence but status is Invalid → upgrade.
 * If reason is mixed with low confidence → Needs Review.
 */
function resolveValidationStatus(isValid, validationReason, rejectionReason, confidenceScore) {
  const reasonLower = (validationReason || "").toLowerCase();
  const rejectionLower = (rejectionReason || "").toLowerCase();

  // Check for strong positive evidence in reason
  const hasPositiveEvidence = POSITIVE_EVIDENCE_PHRASES.some(phrase => reasonLower.includes(phrase));
  // Check for clear invalid signals in rejection reason
  const hasClearInvalidSignal = CLEAR_INVALID_PHRASES.some(phrase =>
    rejectionLower.includes(phrase) || reasonLower.includes(phrase)
  );

  if (isValid) {
    // AI says valid — trust it
    return "Valid";
  }

  if (!isValid && hasPositiveEvidence && !hasClearInvalidSignal) {
    // Contradictory result: reason is positive but AI returned invalid
    // Upgrade to Valid if confidence is reasonable, else NeedsReview
    if (confidenceScore >= 60) {
      return "Valid";
    }
    return "NeedsReview";
  }

  if (!isValid && hasPositiveEvidence && hasClearInvalidSignal) {
    // Mixed signals
    return "NeedsReview";
  }

  // Genuinely invalid
  return "Invalid";
}

/**
 * Validate and classify a document for a given module.
 * Returns full analysis including metadata extraction.
 */
export async function validateAndClassifyDocument(fileUrl, selectedModule) {
  const keywords = MODULE_KEYWORDS[selectedModule] || [];

  const result = await api.integrations.Core.InvokeLLM({
    prompt: `You are a document intelligence system. Analyze this PDF document for the module: "${selectedModule}".

IMPORTANT INSTRUCTIONS:
- Do NOT require exact keyword matches. Use contextual understanding.
- Accept equivalent phrases, abbreviations, and legal variations.
- DPI Centre variations to accept: "DPI Centre", "DPI Centre Ltd", "DPI Centre Limited", "DPI-Centre", "Digital Public Infrastructure Centre", "DPIC", "Technology Implementation Partner" (when linked to DPI Centre).
- If the document clearly relates to the module's purpose, mark it VALID even if exact keywords are absent.
- Only mark INVALID if the document is clearly unrelated (e.g. a resume uploaded as a Grant).
- If evidence is present but partial or ambiguous, set is_valid=false and note "Needs Review" in validation_reason.

STEP 1 - CLASSIFICATION:
Detect the document type (e.g. "Grant Agreement", "Invoice", "MOU", "SOW", "MSA", "Progress Report", etc.)

STEP 2 - VALIDATION for module "${selectedModule}":
Broad accepted evidence for this module: ${keywords.join(", ")}.
A document is VALID if it clearly relates to the module and contains relevant content or equivalent evidence.
A document is INVALID only if it is clearly for a completely different purpose with no relevant overlap.
A document that has some relevant evidence but lacks confidence should have is_valid=false and validation_reason should say "Needs Review".

STEP 3 - METADATA EXTRACTION: Extract any available metadata.

Return JSON with this exact structure:
{
  "is_valid": boolean,
  "detected_document_type": string,
  "confidence_score": number (0-100),
  "rejection_reason": string (only if invalid; else empty string),
  "validation_reason": string (explain why valid, invalid, or needs review — be specific about evidence found),
  "metadata": {
    "document_title": string,
    "parties_involved": string,
    "donor_funder": string,
    "vendor_service_provider": string,
    "grant_amount": string,
    "invoice_amount": string,
    "start_date": string,
    "end_date": string,
    "due_date": string,
    "reporting_frequency": string,
    "payment_terms": string,
    "key_clauses": string
  }
}`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        is_valid: { type: "boolean" },
        detected_document_type: { type: "string" },
        confidence_score: { type: "number" },
        rejection_reason: { type: "string" },
        validation_reason: { type: "string" },
        metadata: {
          type: "object",
          properties: {
            document_title: { type: "string" },
            parties_involved: { type: "string" },
            donor_funder: { type: "string" },
            vendor_service_provider: { type: "string" },
            grant_amount: { type: "string" },
            invoice_amount: { type: "string" },
            start_date: { type: "string" },
            end_date: { type: "string" },
            due_date: { type: "string" },
            reporting_frequency: { type: "string" },
            payment_terms: { type: "string" },
            key_clauses: { type: "string" }
          }
        }
      }
    }
  });
  return result;
}

/**
 * Full document processing pipeline.
 * Validates, classifies, logs to DocumentValidationLog, and writes AuditLog.
 * Returns { isValid, isDuplicate, validationLog, metadata, detectedType, confidenceScore, rejectionReason, validationStatus }
 */
export async function processDocumentUpload({ file, fileUrl, selectedModule, linkedEntityId, linkedEntityName }) {
  const user = await api.auth.me().catch(() => null);
  const hash = await computeFileHash(file);

  // 1. Duplicate check
  const existingDuplicate = await checkDuplicate(hash);
  const isDuplicate = !!existingDuplicate;

  // 2. AI validation + classification + metadata extraction
  const analysis = await validateAndClassifyDocument(fileUrl, selectedModule);

  // 3. Resolve final validation status with guardrail for contradictory results
  const resolvedStatus = isDuplicate
    ? "Duplicate"
    : resolveValidationStatus(
        analysis.is_valid,
        analysis.validation_reason,
        analysis.rejection_reason,
        analysis.confidence_score || 0
      );

  const isValid = resolvedStatus === "Valid";
  const needsReview = resolvedStatus === "NeedsReview";

  const logData = {
    file_name: file.name,
    file_url: fileUrl,
    file_hash: hash,
    selected_module: selectedModule,
    linked_entity_id: linkedEntityId || "",
    linked_entity_name: linkedEntityName || "",
    detected_document_type: analysis.detected_document_type || "",
    validation_status: resolvedStatus,
    confidence_score: analysis.confidence_score || 0,
    rejection_reason: resolvedStatus === "Invalid" ? (analysis.rejection_reason || "") : "",
    extracted_metadata: {
      ...(analysis.metadata || {}),
      validation_reason: analysis.validation_reason || "",
      document_type: analysis.detected_document_type || "",
    },
    duplicate_of_document_id: existingDuplicate?.id || "",
    uploaded_by: user?.email || "",
  };

  let validationLog = null;
  try {
    validationLog = await api.entities.DocumentValidationLog.create(logData);
  } catch {
    // non-blocking
  }

  // 4. Audit log
  await logAudit({
    action_type: "document_uploaded",
    entity_type: selectedModule,
    entity_id: linkedEntityId,
    entity_name: linkedEntityName,
    description: `Document "${file.name}" uploaded for ${selectedModule}. Status: ${resolvedStatus}. Type: ${analysis.detected_document_type || "Unknown"}. Reason: ${analysis.validation_reason || ""}`,
    status: isValid ? "success" : "warning",
  });

  return {
    isValid,
    isDuplicate,
    existingDuplicate,
    validationLog,
    metadata: analysis.metadata || {},
    detectedType: analysis.detected_document_type || "",
    confidenceScore: analysis.confidence_score || 0,
    rejectionReason: analysis.rejection_reason || "",
    validationReason: analysis.validation_reason || "",
    validationStatus: resolvedStatus,
  };
}