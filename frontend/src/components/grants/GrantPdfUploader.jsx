import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { computeFileHash, checkDuplicate, logDocumentUpload } from "@/hooks/usePdfUpload";
import DuplicateUploadDialog from "@/components/shared/DuplicateUploadDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePermissions, canUploadPDF } from "@/hooks/useCanUploadPdf";
import { logAudit } from "@/utils/auditLogger";

const STAGES = [
  { key: "uploading",  label: "Uploading file…" },
  { key: "hashing",   label: "Checking for duplicates…" },
  { key: "extracting", label: "Extracting grant details…" },
  { key: "logging",   label: "Saving upload record…" },
  { key: "done",      label: "Extraction complete!" },
];

function ProgressBar({ stage }) {
  const idx = STAGES.findIndex(s => s.key === stage);
  const pct = idx < 0 ? 0 : Math.round(((idx + 1) / STAGES.length) * 100);
  const label = STAGES[idx]?.label || "Processing…";
  return (
    <div className="w-full mt-2">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function GrantPdfUploader({ onExtracted }) {
  const [stage, setStage]               = useState(null);
  const [fileName, setFileName]         = useState("");
  const [duplicateRecord, setDuplicate] = useState(null);
  const [pendingFile, setPending]       = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, message: "" });
  const [slowWarning, setSlowWarning]   = useState(false);
  const slowTimer                       = useRef(null);
  const { permissions, checkingPermission } = usePermissions();

  const processFile = async (file, isDuplicate = false) => {
    setFileName(file.name);
    setSlowWarning(false);
    slowTimer.current = setTimeout(() => setSlowWarning(true), 30_000);

    try {
      // Stage 1: upload + auth + hash in parallel
      setStage("uploading");
      const [{ file_url }, user, hash] = await Promise.all([
        base44.integrations.Core.UploadFile({ file }),
        base44.auth.me().catch(() => null),
        computeFileHash(file),
      ]);

      // Stage 2: duplicate check
      setStage("hashing");
      if (!isDuplicate) {
        const existing = await checkDuplicate(hash);
        if (existing) {
          clearTimeout(slowTimer.current);
          setStage(null);
          setPending(file);
          setDuplicate(existing);
          return;
        }
      }

      // Stage 3: single combined AI extraction
      setStage("extracting");
      const extraction = await extractGrantData(file_url);

      // Stage 4: fire-and-forget logging
      setStage("logging");
      Promise.all([
        logDocumentUpload({
          fileName: file.name, fileUrl: file_url, fileHash: hash,
          entityType: "Grant", uploadedBy: user?.email || "",
          isDpiRelevant: true, dpiReason: "",
          isDuplicate, isInvalid: false, invalidReason: "",
        }),
        base44.entities.DocumentValidationLog.create({
          file_name: file.name,
          file_url,
          file_hash: hash,
          selected_module: "Grant",
          detected_document_type: extraction.document_type || "Grant",
          validation_status: deriveValidationStatus(extraction),
          confidence_score: extraction.confidence_score || 0,
          rejection_reason: "",
          extracted_metadata: buildExtractedMetadata(extraction),
          uploaded_by: user?.email || "",
        }).catch(() => {}),
        logAudit({
          action_type: "document_uploaded",
          entity_type: "Grant",
          description: `Grant PDF "${file.name}" uploaded. Status: ${deriveValidationStatus(extraction)}. Confidence: ${extraction.confidence_score || 0}%.`,
          status: "success",
        }),
      ]).catch(() => {});

      setStage("done");
      clearTimeout(slowTimer.current);
      setSlowWarning(false);
      onExtracted(mapExtractionToGrantFields(extraction), file_url, extraction);

    } catch (err) {
      clearTimeout(slowTimer.current);
      setStage(null);
      setFileName("");
      const status = err?.response?.status || err?.status;
      let msg;
      if (status === 502 || status === 503 || status === 504) {
        msg = "The server is temporarily unavailable. Please wait a moment and try uploading again.";
      } else if (err?.message?.includes("timeout")) {
        msg = "Grant extraction timed out. You can fill in the details manually or retry.";
      } else {
        msg = "Could not extract data from this PDF. You can still fill in the details manually.";
      }
      setRejectDialog({ open: true, message: msg });
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!canUploadPDF(permissions, "Grants")) {
      setRejectDialog({ open: true, message: "You do not have permission to upload PDFs in this module." });
      return;
    }
    await processFile(file, false);
  };

  if (checkingPermission) return null;
  if (!canUploadPDF(permissions, "Grants")) return null;

  const isLoading = stage !== null && stage !== "done";

  return (
    <>
      <DuplicateUploadDialog
        open={!!duplicateRecord}
        existingRecord={duplicateRecord}
        onCancel={() => { setPending(null); setDuplicate(null); }}
        onUploadAnyway={async () => {
          const f = pendingFile;
          setDuplicate(null);
          setPending(null);
          await processFile(f, true);
        }}
      />

      <Dialog open={rejectDialog.open} onOpenChange={o => !o && setRejectDialog({ open: false, message: "" })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-600">Upload Issue</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">{rejectDialog.message}</p>
          <Button className="mt-4 w-full" onClick={() => setRejectDialog({ open: false, message: "" })}>OK</Button>
        </DialogContent>
      </Dialog>

      <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 transition-colors bg-muted/30 ${isLoading ? "cursor-wait border-primary/40" : "cursor-pointer hover:border-primary/50 border-border"}`}>
        <input type="file" accept="application/pdf" className="hidden" onChange={handleFile} disabled={isLoading} />
        {isLoading ? (
          <div className="w-full flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-center">{fileName}</p>
            <ProgressBar stage={stage} />
            {slowWarning && (
              <p className="text-xs text-amber-600 text-center mt-1">
                Extraction is taking longer than expected. Please wait — we'll show results once ready.
              </p>
            )}
          </div>
        ) : stage === "done" ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
            <p className="text-sm font-medium text-green-700">Extraction complete</p>
            <p className="text-xs text-muted-foreground">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">Click to upload a different file</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-8 h-8 text-green-600" />
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">Click to upload a different file</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">Upload Grant Agreement PDF</p>
            <p className="text-xs text-muted-foreground text-center">AI will extract donor, recipient, amount, dates, and obligations automatically</p>
          </div>
        )}
      </label>
    </>
  );
}

// ─── Extraction ────────────────────────────────────────────────────────────────

async function extractGrantData(fileUrl) {
  let raw;
  try {
    raw = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are an expert legal document analyser specialising in Grant Agreements, Funding Agreements, Award Letters, and Donation Agreements.

EXTRACTION RULES:
1. Extract ALL information explicitly stated in the document. Do NOT leave fields empty if the information is present.
2. OCR noise or broken formatting is acceptable — do your best to read the content.
3. Donor/Funder patterns: "Donor", "Funder", "Grantor", "Funding Partner", "Foundation", "Agency", "Awarding Organisation", "Contributor", "Sponsor".
4. Recipient/Grantee patterns: "Recipient", "Grantee", "Beneficiary", "Implementing Partner", "Awardee", "Project Implementer".
5. For dates: look for Effective Date, Start Date, End Date, Award Date, Signing Date, Grant Period, Period of Performance, "This Agreement is entered into on".
6. For amounts: look for Grant Amount, Award Amount, Funding Amount, Total Grant, Budget, Contribution, Financial Support.
7. For reporting: look for Reporting Obligations, Progress Report, Financial Report, Quarterly/Annual Report, Audit Report, Reporting Schedule.
8. For tranches/disbursement: look for Tranches, Disbursement Schedule, Payment Schedule, Milestones.
9. For signatories: look in signature blocks for names, designations, "For and on behalf of", "Authorized Signatory".
10. Set is_valid_grant to true if the document is clearly a Grant Agreement, Funding Agreement, or Award Letter.
11. Do NOT set confidence_score — leave it as null, it will be calculated separately.
12. missing_fields: only list fields genuinely absent from the document.
13. Extract whatever is readable — do not return all empty fields if content is present.

Return ONLY a raw JSON object (no markdown, no code blocks). Use this structure:
{
  "document_type": "Grant",
  "is_valid_grant": true,
  "grant_title": "",
  "agreement_type": "",
  "donor_name": "",
  "donor_contact_name": "",
  "donor_contact_email": "",
  "donor_address": "",
  "recipient_organisation": "",
  "recipient_contact_name": "",
  "recipient_contact_email": "",
  "project_or_program_name": "",
  "country_or_region": "",
  "grant_amount": "",
  "currency": "",
  "effective_date": "",
  "start_date": "",
  "end_date": "",
  "award_date": "",
  "signing_date": "",
  "grant_period": "",
  "purpose": "",
  "objectives": "",
  "budget_details": "",
  "fund_disbursement_schedule": [],
  "tranches": [],
  "utilization_requirements": "",
  "reporting_obligations": [],
  "reporting_frequency": "",
  "audit_requirements": "",
  "compliance_requirements": "",
  "eligible_expenses": "",
  "milestones": [],
  "deliverables": [],
  "renewal_terms": "",
  "termination_clause": "",
  "confidentiality_clause": "",
  "governing_law": "",
  "donor_signatory_name": "",
  "donor_signatory_designation": "",
  "recipient_signatory_name": "",
  "recipient_signatory_designation": "",
  "signature_evidence": "",
  "missing_fields": [],
  "extraction_notes": "",
  "validation_reason": ""
}`,
      file_urls: [fileUrl],
    });
  } catch (err) {
    console.warn("[GrantPdfUploader] AI extraction failed, using fallback:", err);
    raw = null;
  }

  let parsed = normalizeGrantResponse(raw);

  if (!parsed) {
    console.warn("[GrantPdfUploader] Normalization failed, parsed is null — returning minimal fallback");
    parsed = {};
  }

  parsed.confidence_score = calculateGrantConfidence(parsed);
  return parsed;
}

function normalizeGrantResponse(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try { return JSON.parse(cleaned); } catch {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
  if (raw.document_type || raw.grant_title || raw.donor_name || raw.grant_amount) return raw;
  for (const key of ["result", "response", "data", "output", "json", "content"]) {
    const candidate = raw[key];
    if (!candidate) continue;
    if (typeof candidate === "string") {
      try { const p = JSON.parse(candidate); if (p) return p; } catch {}
    }
    if (candidate && (candidate.document_type || candidate.grant_title || candidate.donor_name)) return candidate;
  }
  return null;
}

function calculateGrantConfidence(r) {
  let score = 0;
  if (r.grant_title && r.grant_title.trim())                                score += 15;
  if (r.donor_name && r.donor_name.trim())                                  score += 15;
  if (r.recipient_organisation && r.recipient_organisation.trim())          score += 15;
  if (r.grant_amount && r.grant_amount.toString().trim())                   score += 15;
  if (r.effective_date || r.start_date || r.end_date || r.grant_period)    score += 10;
  if (r.purpose && r.purpose.trim())                                        score += 10;
  if (r.reporting_obligations && r.reporting_obligations.length > 0)        score += 10;
  if (r.tranches?.length > 0 || r.fund_disbursement_schedule?.length > 0)  score += 5;
  if (r.donor_signatory_name || r.recipient_signatory_name || r.signature_evidence) score += 5;
  return score;
}

function mapExtractionToGrantFields(r) {
  return {
    title:        r.grant_title || r.project_or_program_name || "",
    funder:       r.donor_name || "",
    grant_number: "",
    description:  [r.purpose, r.objectives].filter(Boolean).join("\n\n"),
    total_amount: parseGrantAmount(r.grant_amount),
    start_date:   r.start_date || r.effective_date || r.award_date || "",
    end_date:     r.end_date || "",
    notes:        buildGrantNotes(r),
    // Extra fields for review panel display
    _donor_contact_name:         r.donor_contact_name || "",
    _donor_contact_email:        r.donor_contact_email || "",
    _recipient_organisation:     r.recipient_organisation || "",
    _recipient_contact_name:     r.recipient_contact_name || "",
    _recipient_contact_email:    r.recipient_contact_email || "",
    _grant_period:               r.grant_period || "",
    _currency:                   r.currency || "",
    _reporting_frequency:        r.reporting_frequency || "",
    _reporting_obligations:      r.reporting_obligations || [],
    _audit_requirements:         r.audit_requirements || "",
    _compliance_requirements:    r.compliance_requirements || "",
    _milestones:                 r.milestones || [],
    _deliverables:               r.deliverables || [],
    _tranches:                   r.tranches || [],
    _donor_signatory_name:       r.donor_signatory_name || "",
    _donor_signatory_designation: r.donor_signatory_designation || "",
    _recipient_signatory_name:   r.recipient_signatory_name || "",
    _recipient_signatory_designation: r.recipient_signatory_designation || "",
    _governing_law:              r.governing_law || "",
    _termination_clause:         r.termination_clause || "",
    _confidentiality_clause:     r.confidentiality_clause || "",
  };
}

function parseGrantAmount(raw) {
  if (!raw) return 0;
  const num = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

function buildGrantNotes(r) {
  const arrayToStr = (arr) => Array.isArray(arr) && arr.length > 0
    ? arr.map(i => typeof i === "string" ? i : JSON.stringify(i)).join("; ")
    : "";

  return [
    r.grant_period              && `Grant Period: ${r.grant_period}`,
    r.currency                  && `Currency: ${r.currency}`,
    r.reporting_frequency       && `Reporting Frequency: ${r.reporting_frequency}`,
    r.audit_requirements        && `Audit Requirements: ${r.audit_requirements}`,
    r.compliance_requirements   && `Compliance: ${r.compliance_requirements}`,
    r.governing_law             && `Governing Law: ${r.governing_law}`,
    r.termination_clause        && `Termination: ${r.termination_clause}`,
    r.confidentiality_clause    && `Confidentiality: ${r.confidentiality_clause}`,
    r.tranches?.length          && `Tranches: ${arrayToStr(r.tranches)}`,
    r.milestones?.length        && `Milestones: ${arrayToStr(r.milestones)}`,
    r.signature_evidence        && `Signatures: ${r.signature_evidence}`,
    r.extraction_notes          && `Notes: ${r.extraction_notes}`,
    r.missing_fields?.length    && `Missing: ${r.missing_fields.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function deriveValidationStatus(r) {
  const score = r.confidence_score || 0;
  if (score >= 70) return "Valid";
  return "NeedsReview";
}

function buildExtractedMetadata(r) {
  return {
    document_title:     r.grant_title || "",
    document_type:      r.document_type || "Grant",
    donor_funder:       r.donor_name || "",
    parties_involved:   [r.donor_name, r.recipient_organisation].filter(Boolean).join(", "),
    grant_amount:       r.grant_amount || "",
    start_date:         r.start_date || r.effective_date || "",
    end_date:           r.end_date || "",
    reporting_frequency: r.reporting_frequency || "",
    key_clauses:        [r.termination_clause, r.confidentiality_clause].filter(Boolean).join("; "),
    governing_law:      r.governing_law || "",
    signature_evidence: r.signature_evidence || "",
    missing_fields:     (r.missing_fields || []).join(", "),
    extraction_notes:   r.extraction_notes || "",
    validation_reason:  r.validation_reason || "",
  };
}