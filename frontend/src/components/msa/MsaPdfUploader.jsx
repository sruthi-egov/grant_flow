import { useState, useRef } from "react";
import { api } from "@/api/apiClient";
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
  { key: "extracting", label: "Extracting MSA details…" },
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

export default function MsaPdfUploader({ onExtracted }) {
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
        api.integrations.Core.UploadFile({ file }),
        api.auth.me().catch(() => null),
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
      const extraction = await extractMsaData(file_url);

      // Stage 4: fire-and-forget logging
      setStage("logging");
      Promise.all([
        logDocumentUpload({
          fileName: file.name, fileUrl: file_url, fileHash: hash,
          entityType: "MSA", uploadedBy: user?.email || "",
          isDpiRelevant: true, dpiReason: "",
          isDuplicate, isInvalid: false, invalidReason: "",
        }),
        api.entities.DocumentValidationLog.create({
          file_name: file.name,
          file_url,
          file_hash: hash,
          selected_module: "MSA",
          detected_document_type: extraction.document_type || "MSA",
          validation_status: deriveValidationStatus(extraction),
          confidence_score: extraction.confidence_score || 0,
          rejection_reason: "",
          extracted_metadata: buildExtractedMetadata(extraction),
          uploaded_by: user?.email || "",
        }).catch(() => {}),
        logAudit({
          action_type: "document_uploaded",
          entity_type: "MSA",
          description: `MSA PDF "${file.name}" uploaded. Status: ${deriveValidationStatus(extraction)}. Confidence: ${extraction.confidence_score || 0}%.`,
          status: "success",
        }),
      ]).catch(() => {});

      setStage("done");
      clearTimeout(slowTimer.current);
      setSlowWarning(false);
      onExtracted(mapExtractionToMsaFields(extraction), file_url, extraction);

    } catch (err) {
      clearTimeout(slowTimer.current);
      setStage(null);
      setFileName("");
      const status = err?.response?.status || err?.status;
      let msg;
      if (status === 502 || status === 503 || status === 504) {
        msg = "The server is temporarily unavailable. Please wait a moment and try uploading again.";
      } else if (err?.message?.includes("timeout")) {
        msg = "MSA extraction timed out. You can fill in the details manually or retry.";
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
    if (!canUploadPDF(permissions, "MSAs")) {
      setRejectDialog({ open: true, message: "You do not have permission to upload PDFs in this module." });
      return;
    }
    await processFile(file, false);
  };

  if (checkingPermission) return null;
  if (!canUploadPDF(permissions, "MSAs")) return null;

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
            <p className="text-sm font-medium">Upload MSA PDF</p>
            <p className="text-xs text-muted-foreground text-center">AI will extract vendor, client, services, terms, clauses, and dates automatically</p>
          </div>
        )}
      </label>
    </>
  );
}

// ─── Extraction ────────────────────────────────────────────────────────────────

async function extractMsaData(fileUrl) {
  let raw;
  try {
    raw = await api.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are an expert legal document analyser specialising in Master Service Agreements (MSA), Master Services Agreements, Framework Agreements, and Professional Services Agreements.

EXTRACTION RULES:
1. Extract ALL information explicitly stated in the document. Do NOT leave fields empty if the information is present.
2. OCR noise or broken formatting is acceptable — do your best to read the content.
3. Service Provider/Vendor patterns: "Service Provider", "Vendor", "Contractor", "Consultant", "Supplier", "Provider".
4. Client/Customer patterns: "Client", "Customer", "Purchaser", "Company", "Organisation", "Organization".
5. For dates: look for Effective Date, Commencement Date, Start Date, End Date, Expiry Date, Term, Initial Term, Renewal Term, Signing Date, "Executed on", "Entered into on".
6. For payment: look for "Payment Terms", "Fees", "Commercial Terms", "Invoices", "Taxes", "Billing".
7. For clauses: look for "Confidentiality", "Data Protection", "Intellectual Property", "Indemnity", "Limitation of Liability", "Termination", "Renewal", "Governing Law", "Dispute Resolution".
8. For services: look for "Scope of Services", "Services", "Statement of Work", "Work Orders", "Service Obligations".
9. For signatories: look in signature blocks for names, designations, "For and on behalf of", "Authorized Signatory".
10. Set is_valid_msa to true if the document is clearly an MSA, Master Agreement, Framework Agreement, or Service Agreement.
11. Do NOT set confidence_score — leave it as null, it will be calculated separately.
12. missing_fields: only list fields genuinely absent from the document.
13. Extract whatever is readable — do not return all empty fields if content is present.

Return ONLY a raw JSON object (no markdown, no code blocks). Use this structure:
{
  "document_type": "MSA",
  "is_valid_msa": true,
  "msa_title": "",
  "agreement_type": "",
  "agreement_reference_number": "",
  "service_provider_name": "",
  "service_provider_contact_name": "",
  "service_provider_contact_email": "",
  "service_provider_address": "",
  "client_organisation": "",
  "client_contact_name": "",
  "client_contact_email": "",
  "client_address": "",
  "effective_date": "",
  "start_date": "",
  "end_date": "",
  "signing_date": "",
  "agreement_term": "",
  "renewal_terms": "",
  "services_covered": "",
  "scope_of_services": "",
  "service_obligations": [],
  "payment_terms": "",
  "fee_or_commercial_terms": "",
  "invoice_terms": "",
  "tax_terms": "",
  "service_levels_sla": "",
  "confidentiality_clause": "",
  "data_protection_clause": "",
  "intellectual_property_clause": "",
  "liability_clause": "",
  "indemnity_clause": "",
  "termination_clause": "",
  "dispute_resolution": "",
  "governing_law": "",
  "service_provider_signatory_name": "",
  "service_provider_signatory_designation": "",
  "client_signatory_name": "",
  "client_signatory_designation": "",
  "signature_evidence": "",
  "missing_fields": [],
  "extraction_notes": "",
  "validation_reason": ""
}`,
      file_urls: [fileUrl],
    });
  } catch (err) {
    console.warn("[MsaPdfUploader] AI extraction failed, using fallback:", err);
    raw = null;
  }

  let parsed = normalizeMsaResponse(raw);

  if (!parsed) {
    console.warn("[MsaPdfUploader] Normalization failed — returning minimal fallback");
    parsed = {};
  }

  parsed.confidence_score = calculateMsaConfidence(parsed);
  return parsed;
}

function normalizeMsaResponse(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try { return JSON.parse(cleaned); } catch {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
  if (raw.document_type || raw.msa_title || raw.service_provider_name || raw.client_organisation) return raw;
  for (const key of ["result", "response", "data", "output", "json", "content"]) {
    const candidate = raw[key];
    if (!candidate) continue;
    if (typeof candidate === "string") {
      try { const p = JSON.parse(candidate); if (p) return p; } catch {}
    }
    if (candidate && (candidate.document_type || candidate.msa_title || candidate.service_provider_name)) return candidate;
  }
  return null;
}

function calculateMsaConfidence(r) {
  let score = 0;
  if (r.msa_title && r.msa_title.trim())                                    score += 15;
  if (r.service_provider_name && r.service_provider_name.trim())            score += 15;
  if (r.client_organisation && r.client_organisation.trim())                score += 15;
  if (r.effective_date || r.start_date || r.agreement_term)                 score += 10;
  if (r.services_covered || r.scope_of_services)                            score += 15;
  if (r.payment_terms || r.fee_or_commercial_terms)                         score += 10;
  const clauses = [r.confidentiality_clause, r.intellectual_property_clause, r.liability_clause, r.termination_clause];
  if (clauses.some(c => c && c.trim()))                                      score += 10;
  if (r.governing_law || r.dispute_resolution)                              score += 5;
  if (r.service_provider_signatory_name || r.client_signatory_name || r.signature_evidence) score += 5;
  return score;
}

function mapExtractionToMsaFields(r) {
  return {
    title:                  r.msa_title || "",
    vendor_name:            r.service_provider_name || "",
    msa_number:             r.agreement_reference_number || "",
    vendor_address:         r.service_provider_address || "",
    vendor_contact_name:    r.service_provider_contact_name || "",
    vendor_contact_email:   r.service_provider_contact_email || "",
    our_contact_name:       r.client_contact_name || "",
    our_contact_email:      r.client_contact_email || "",
    effective_date:         r.effective_date || r.start_date || r.signing_date || "",
    end_date:               r.end_date || "",
    initial_term_years:     parseTermYears(r.agreement_term),
    governing_law:          r.governing_law || "",
    description:            [r.services_covered, r.scope_of_services].filter(Boolean).join("\n\n"),
    key_terms:              buildMsaKeyTerms(r),
    notes:                  buildMsaNotes(r),
    // Extra fields for review panel display
    _client_organisation:   r.client_organisation || "",
    _client_address:        r.client_address || "",
    _agreement_term:        r.agreement_term || "",
    _renewal_terms:         r.renewal_terms || "",
    _payment_terms:         r.payment_terms || "",
    _fee_or_commercial_terms: r.fee_or_commercial_terms || "",
    _invoice_terms:         r.invoice_terms || "",
    _confidentiality_clause: r.confidentiality_clause || "",
    _ip_clause:             r.intellectual_property_clause || "",
    _liability_clause:      r.liability_clause || "",
    _indemnity_clause:      r.indemnity_clause || "",
    _termination_clause:    r.termination_clause || "",
    _dispute_resolution:    r.dispute_resolution || "",
    _service_provider_signatory_name: r.service_provider_signatory_name || "",
    _service_provider_signatory_designation: r.service_provider_signatory_designation || "",
    _client_signatory_name: r.client_signatory_name || "",
    _client_signatory_designation: r.client_signatory_designation || "",
  };
}

function parseTermYears(term) {
  if (!term) return null;
  const num = parseFloat(String(term).replace(/[^0-9.]/g, ""));
  return isNaN(num) ? null : num;
}

function buildMsaKeyTerms(r) {
  return [
    r.payment_terms         && `Payment Terms: ${r.payment_terms}`,
    r.fee_or_commercial_terms && `Fees: ${r.fee_or_commercial_terms}`,
    r.invoice_terms         && `Invoice Terms: ${r.invoice_terms}`,
    r.liability_clause      && `Liability: ${r.liability_clause}`,
    r.indemnity_clause      && `Indemnity: ${r.indemnity_clause}`,
    r.confidentiality_clause && `Confidentiality: ${r.confidentiality_clause}`,
    r.intellectual_property_clause && `IP: ${r.intellectual_property_clause}`,
    r.termination_clause    && `Termination: ${r.termination_clause}`,
    r.renewal_terms         && `Renewal: ${r.renewal_terms}`,
    r.dispute_resolution    && `Dispute Resolution: ${r.dispute_resolution}`,
  ].filter(Boolean).join("\n");
}

function buildMsaNotes(r) {
  return [
    r.service_levels_sla    && `SLA: ${r.service_levels_sla}`,
    r.tax_terms             && `Tax: ${r.tax_terms}`,
    r.signature_evidence    && `Signatures: ${r.signature_evidence}`,
    r.extraction_notes      && `Notes: ${r.extraction_notes}`,
    r.missing_fields?.length && `Missing: ${r.missing_fields.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function deriveValidationStatus(r) {
  const score = r.confidence_score || 0;
  if (score >= 70) return "Valid";
  return "NeedsReview";
}

function buildExtractedMetadata(r) {
  return {
    document_title:          r.msa_title || "",
    document_type:           r.document_type || "MSA",
    vendor_service_provider: r.service_provider_name || "",
    parties_involved:        [r.service_provider_name, r.client_organisation].filter(Boolean).join(", "),
    start_date:              r.effective_date || r.start_date || "",
    end_date:                r.end_date || "",
    payment_terms:           r.payment_terms || "",
    key_clauses:             [r.confidentiality_clause, r.termination_clause, r.liability_clause].filter(Boolean).join("; "),
    governing_law:           r.governing_law || "",
    signature_evidence:      r.signature_evidence || "",
    missing_fields:          (r.missing_fields || []).join(", "),
    extraction_notes:        r.extraction_notes || "",
    validation_reason:       r.validation_reason || "",
  };
}