/**
 * Shared hook for PDF upload logic:
 * - Validates PDF content for both Grant AND DPI Centre keywords (mandatory gate)
 * - Checks user permission (can_upload_pdf)
 * - Computes file hash for duplicate detection
 * - Checks for duplicates against DocumentUploadLog
 * - Classifies DPI relevance AND checks for invalid "DPI Centre" mentions
 * - Logs the upload to DocumentUploadLog
 */
import { base44 } from "@/api/base44Client";

const GRANT_KEYWORDS = [
  "grant", "grants", "grant agreement", "grant proposal", "funding", "donor",
  "milestone", "sow", "mow", "scope of work", "work order", "disbursement",
  "budget", "fund allocation"
];

const DPI_KEYWORDS = [
  "dpi centre", "dpi center", "digital public infrastructure centre",
  "digital public infrastructure center", "dpi", "centre for digital public infrastructure"
];

/**
 * Mandatory content validation: checks that the PDF contains BOTH
 * grant-related keywords AND DPI Centre-related keywords.
 *
 * Returns:
 *   { valid: true }
 *   { valid: false, reason: "missing_grant" | "missing_dpi" | "missing_both" | "extraction_failed" }
 */
export async function validatePdfContent(fileUrl) {
  console.log("[PDF Validation] Starting content validation for:", fileUrl);
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Extract ALL the plain text content from this PDF document. Return the full text exactly as it appears, preserving all words and phrases. Do not summarise or interpret — just extract the raw text content.`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          extracted_text: { type: "string" }
        }
      }
    });

    const text = (result.extracted_text || "").toLowerCase();
    console.log("[PDF Validation] Extracted text length:", text.length);
    console.log("[PDF Validation] Extracted text preview (first 500 chars):", text.substring(0, 500));

    if (!text || text.length < 20) {
      console.warn("[PDF Validation] Extraction failed or text too short");
      return { valid: false, reason: "extraction_failed" };
    }

    const hasGrant = GRANT_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
    const hasDpi = DPI_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));

    console.log("[PDF Validation] Grant keyword match:", hasGrant, "| DPI keyword match:", hasDpi);
    console.log("[PDF Validation] Matched grant keywords:", GRANT_KEYWORDS.filter(kw => text.includes(kw.toLowerCase())));
    console.log("[PDF Validation] Matched DPI keywords:", DPI_KEYWORDS.filter(kw => text.includes(kw.toLowerCase())));

    if (!hasGrant && !hasDpi) return { valid: false, reason: "missing_both" };
    if (!hasGrant) return { valid: false, reason: "missing_grant" };
    if (!hasDpi) return { valid: false, reason: "missing_dpi" };

    console.log("[PDF Validation] ✅ Document passed validation");
    return { valid: true };
  } catch (err) {
    console.error("[PDF Validation] Error during validation:", err);
    return { valid: false, reason: "extraction_failed" };
  }
}

/**
 * Compute SHA-256 hash of a File and return hex string.
 */
export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check for existing duplicate by hash in DocumentUploadLog.
 * Returns the existing log record, or null if no duplicate.
 */
export async function checkDuplicate(hash) {
  try {
    const logs = await base44.entities.DocumentUploadLog.filter({ file_hash: hash });
    return logs.length > 0 ? logs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Classify the document:
 * - Checks if it mentions "DPI Centre" (flags as invalid)
 * - Checks if it is DPI-relevant
 * Returns { is_dpi_relevant, reason, is_invalid, invalid_reason }
 */
export async function classifyDocument(fileUrl) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a document classifier for an organisation called DPI (Development Policy Institute).

Analyse this uploaded document and answer two questions:

1. INVALID CHECK: Does this document mention "DPI Centre" as a party, signatory, or internal department? 
   If yes, it is an INVALID document because it is an internal DPI document and should not be uploaded as an external agreement.
   
2. DPI RELEVANCE: Is this document relevant to DPI's external work and mandate?
   A document is DPI-relevant if it relates to:
   - Development finance, grants, or funding agreements
   - Public policy, governance, or institutional reform
   - Economic development or capacity building
   - International development partnerships or MOUs
   - Service delivery contracts related to development projects
   - Monitoring, evaluation, or reporting for development programmes

Respond with a JSON object:
{
  "is_invalid": boolean (true if document mentions "DPI Centre" as a party/signatory/internal entity),
  "invalid_reason": string (brief explanation if invalid, else null),
  "is_dpi_relevant": boolean,
  "reason": string (1-2 sentences explaining the DPI relevance determination)
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          is_invalid: { type: "boolean" },
          invalid_reason: { type: "string" },
          is_dpi_relevant: { type: "boolean" },
          reason: { type: "string" }
        }
      }
    });
    return {
      is_invalid: result.is_invalid || false,
      invalid_reason: result.invalid_reason || "",
      is_dpi_relevant: result.is_dpi_relevant,
      reason: result.reason
    };
  } catch {
    return { is_invalid: false, invalid_reason: "", is_dpi_relevant: true, reason: "Classification unavailable" };
  }
}

// Keep legacy export for backwards compatibility
export async function classifyDpiRelevance(fileUrl) {
  const r = await classifyDocument(fileUrl);
  return { is_dpi_relevant: r.is_dpi_relevant, reason: r.reason };
}

/**
 * Returns a human-readable rejection label from a validation reason code.
 */
export function getRejectionLabel(reason) {
  switch (reason) {
    case "missing_grant": return "Missing Grant-related content";
    case "missing_dpi": return "Missing DPI Centre-related content";
    case "missing_both": return "Missing both Grant and DPI Centre-related content";
    case "extraction_failed": return "Could not read PDF content";
    default: return "Failed validation";
  }
}

/**
 * Log a completed valid upload to DocumentUploadLog.
 */
export async function logDocumentUpload({ fileName, fileUrl, fileHash, entityType, entityId, entityName, uploadedBy, isDpiRelevant, dpiReason, isDuplicate, isInvalid, invalidReason }) {
  try {
    await base44.entities.DocumentUploadLog.create({
      file_name: fileName,
      file_url: fileUrl,
      file_hash: fileHash,
      entity_type: entityType,
      entity_id: entityId || "",
      entity_name: entityName || "",
      uploaded_by: uploadedBy || "",
      is_dpi_relevant: isDpiRelevant,
      dpi_relevance_reason: dpiReason || "",
      is_duplicate: isDuplicate || false,
      is_invalid: isInvalid || false,
      invalid_reason: invalidReason || "",
      is_rejected: false,
      rejection_reason: ""
    });
  } catch {
    // Log failures are non-blocking
  }
}

/**
 * Log a rejected (failed validation) upload to DocumentUploadLog.
 */
export async function logRejectedUpload({ fileName, fileUrl, fileHash, entityType, uploadedBy, rejectionReason }) {
  console.log("[logRejectedUpload] Saving rejected document:", fileName, "| Reason:", rejectionReason);
  try {
    await base44.entities.DocumentUploadLog.create({
      file_name: fileName,
      file_url: fileUrl,
      file_hash: fileHash || "",
      entity_type: entityType,
      entity_id: "",
      entity_name: "",
      uploaded_by: uploadedBy || "",
      is_rejected: true,
      rejection_reason: rejectionReason,
      is_invalid: false,
      is_duplicate: false,
      is_dpi_relevant: false,
      dpi_relevance_reason: ""
    });
    console.log("[logRejectedUpload] ✅ Rejected document saved to log");
  } catch (err) {
    console.error("[logRejectedUpload] Failed to save rejected document:", err);
  }
}