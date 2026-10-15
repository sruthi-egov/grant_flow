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
  { key: "uploading",   label: "Uploading file…" },
  { key: "hashing",     label: "Checking for duplicates…" },
  { key: "extracting",  label: "Extracting & analysing document…" },
  { key: "logging",     label: "Saving upload record…" },
  { key: "done",        label: "Extraction complete!" },
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

export default function SowPdfUploader({ onExtracted }) {
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
      const extraction = await extractSowData(file_url);

      // Stage 4: fire-and-forget logging
      setStage("logging");
      Promise.all([
        logDocumentUpload({
          fileName: file.name, fileUrl: file_url, fileHash: hash,
          entityType: "SOW", uploadedBy: user?.email || "",
          isDpiRelevant: true, dpiReason: "",
          isDuplicate, isInvalid: false, invalidReason: "",
        }),
        api.entities.DocumentValidationLog.create({
          file_name: file.name,
          file_url,
          file_hash: hash,
          selected_module: "SOW",
          detected_document_type: extraction.document_type || "SOW",
          validation_status: deriveValidationStatus(extraction),
          confidence_score: extraction.confidence_score || 0,
          rejection_reason: "",
          extracted_metadata: buildExtractedMetadata(extraction),
          uploaded_by: user?.email || "",
        }).catch(() => {}),
        logAudit({
          action_type: "document_uploaded",
          entity_type: "SOW",
          description: `SoW PDF "${file.name}" uploaded. Status: ${deriveValidationStatus(extraction)}. Confidence: ${extraction.confidence_score || 0}%.`,
          status: "success",
        }),
      ]).catch(() => {});

      setStage("done");
      clearTimeout(slowTimer.current);
      setSlowWarning(false);
      onExtracted(mapExtractionToSowFields(extraction), file_url, extraction);

    } catch (err) {
      clearTimeout(slowTimer.current);
      setStage(null);
      setFileName("");
      const status = err?.response?.status || err?.status;
      let msg;
      if (status === 502 || status === 503 || status === 504) {
        msg = "The server is temporarily unavailable (502). Please wait a moment and try uploading again.";
      } else if (err?.message?.includes("timeout")) {
        msg = "SoW extraction timed out. You can save the file manually or retry.";
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
    if (!canUploadPDF(permissions, "SOWs")) {
      setRejectDialog({ open: true, message: "You do not have permission to upload PDFs in this module." });
      return;
    }
    await processFile(file, false);
  };

  if (checkingPermission) return null;
  if (!canUploadPDF(permissions, "SOWs")) return null;

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
            <p className="text-sm font-medium">Upload SoW PDF</p>
            <p className="text-xs text-muted-foreground text-center">AI will extract vendor, scope, deliverables, dates, and payment terms automatically</p>
          </div>
        )}
      </label>
    </>
  );
}

// ─── Extraction ────────────────────────────────────────────────────────────────

async function extractSowData(fileUrl) {
  const raw = await api.integrations.Core.InvokeLLM({
    model: "claude_sonnet_4_6",
    prompt: `You are an expert legal document analyser specialising in Statements of Work (SoW), Scope of Work, Work Orders, and Service Agreements.

CRITICAL EXTRACTION RULES:
1. Extract ALL information explicitly stated in the document. Do NOT leave fields empty if the information is present.
2. The document may use NUMBERED CLAUSES (1, 2, 3, 4, 5, 6, 7, 7.1, 7.2, 7.3, 7.4 etc). Parse each numbered section specifically:
   - Clause 1 / "Description of the Service" → scope_of_work, sow_title
   - Clause 2 / "Description of the Deliverable" → deliverables
   - Clause 3 / "Personnel assigned" → personnel_assigned
   - Clause 4 / "Services Start Date" → start_date
   - Clause 5 / "Period of performance" → duration_or_term
   - Clause 6 / "Consideration" → total_contract_value, payment_terms, invoice_terms, invoice_emails, travel_expense_terms
   - Clause 7 / "Governance" → governance_requirements
   - Clause 7.2 / "Quality and Documentation" → quality_requirements
   - Clause 7.3 / "Release Management" → release_management
   - Clause 7.4 / "Communication and Knowledge Transfer" → knowledge_transfer
   - Signature block → vendor_signatory_name, vendor_signatory_designation, client_signatory_name, client_signatory_designation
3. Vendor/Service Provider aliases: "Vendor", "Service Provider", "Contractor", "Consultant", "Implementation Partner", "Supplier", "Provider", "Agency", "BAO Systems".
4. Client/Service Receiver aliases: "Client", "Customer", "Service Receiver", "Contracting Authority", "Buyer", "DPI Centre", "Ministry", "Government", "eGovernments Foundation".
5. For dates: look for Effective Date, Commencement Date, Start Date, Services Start Date, End Date, Completion Date, "Valid Until", "Term", "Duration", "Period of Performance", "This SoW is made on", "Executed on".
6. For consideration/payment: look for "Consideration", "Payment Terms", "Contract Value", "Fee", "Amount", "Total Cost", "Invoice", "Billing", "Payment Schedule", "Milestone", "Percentage".
7. For invoice emails: look for email addresses near "invoice", "billing", "finance", "accounts".
8. For travel: look for "Travel Expenses", "Out of pocket", "Reimbursable", "Billable at actuals".
9. Set is_valid_sow to true if the document is clearly a SoW, Work Order, Service Order, or Scope of Work.
10. Do NOT set confidence_score — leave it as null.
11. missing_fields: only list fields genuinely absent from the document.

RATE CARD / COMMERCIAL TABLE EXTRACTION (HIGH PRIORITY):
12. Carefully inspect the PDF for ALL tables.
13. Detect tables with headings: "Rate Card", "Commercials", "Fee Schedule", "Pricing", "Payment Schedule", "Consideration", "Milestone Payment", "Tranche Payment".
14. For each table: extract table_title, table_type, all column names, all rows as key-value pairs, currency, billing_frequency.
15. For MILESTONE/PAYMENT SCHEDULE tables (e.g. "Execution of contract - 20%", "UAT - 40%"): extract as payment_schedule_tables with columns ["Milestone", "Percentage", "Amount"].
16. If no rate card table exists, return rate_cards as an empty array.
17. Preserve currency symbols: ₹, INR, USD, $, EUR, GBP.

Return ONLY a raw JSON object (no markdown, no code blocks):
{
  "document_type": "SoW",
  "is_valid_sow": true,
  "sow_title": "",
  "sow_reference_number": "",
  "msa_reference": "",
  "vendor_name": "",
  "vendor_signatory_name": "",
  "vendor_signatory_designation": "",
  "client_organisation": "",
  "client_signatory_name": "",
  "client_signatory_designation": "",
  "personnel_assigned": "",
  "effective_date": "",
  "start_date": "",
  "end_date": "",
  "signing_date": "",
  "duration_or_term": "",
  "scope_of_work": "",
  "deliverables": [],
  "total_contract_value": "",
  "currency": "",
  "payment_terms": "",
  "invoice_terms": "",
  "invoice_emails": "",
  "travel_expense_terms": "",
  "governance_requirements": "",
  "quality_requirements": "",
  "release_management": "",
  "knowledge_transfer": "",
  "governing_law": "",
  "signature_evidence": "",
  "rate_cards": [],
  "payment_schedule_tables": [
    {
      "table_title": "Payment Schedule",
      "table_type": "Milestone-based",
      "currency": "",
      "columns": ["Milestone", "Percentage", "Amount"],
      "rows": []
    }
  ],
  "missing_fields": [],
  "extraction_notes": "",
  "validation_reason": ""
}`,
    file_urls: [fileUrl],
  });

  // Parse response — raw is a string when no response_json_schema is used
  let parsed;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      } else {
        parsed = {};
      }
    }
  } else {
    // Normalize nested response structures
    parsed = normalizeSowResponse(raw) || {};
  }

  // Calculate confidence client-side so it's never anchored to 0
  parsed.confidence_score = calculateSowConfidence(parsed);
  return parsed;
}

function normalizeSowResponse(raw) {
  if (!raw) return null;
  if (raw.document_type || raw.sow_title || raw.vendor_name || raw.scope_of_work) return raw;
  for (const key of ["result", "response", "data", "output", "json", "content"]) {
    const candidate = raw[key];
    if (!candidate) continue;
    if (typeof candidate === "string") {
      try { const p = JSON.parse(candidate); if (p) return p; } catch {}
    }
    if (candidate && (candidate.document_type || candidate.sow_title || candidate.vendor_name)) return candidate;
  }
  return null;
}

function calculateSowConfidence(r) {
  let score = 0;
  if (r.sow_title && r.sow_title.trim())                                        score += 15;
  if (r.vendor_name && r.vendor_name.trim())                                     score += 10;
  if (r.client_organisation && r.client_organisation.trim())                     score += 5;
  if (r.scope_of_work && r.scope_of_work.trim())                                 score += 10;
  if (r.deliverables && r.deliverables.length > 0)                               score += 15;
  if (r.start_date || r.effective_date || r.duration_or_term)                    score += 15;
  if (r.total_contract_value && String(r.total_contract_value).trim())           score += 10;
  if (r.payment_terms && r.payment_terms.trim())                                 score += 10;
  if (r.vendor_signatory_name || r.client_signatory_name || r.signature_evidence) score += 10;
  if (r.governance_requirements || r.quality_requirements)                        score += 5;
  // monthly_rate is OPTIONAL — do not penalise for its absence
  return Math.min(score, 100);
}

// ─── Field Mapping ─────────────────────────────────────────────────────────────

function mapExtractionToSowFields(r) {
  // Normalize aliases so no field is silently dropped
  const title           = r.sow_title || r.title || r.statement_of_work_title || "";
  const sowNumber       = r.sow_reference_number || r.sow_number || r.work_order_number || "";
  const vendorName      = r.vendor_name || r.service_provider || r.provider_name || "";
  const clientOrg       = r.client_organisation || r.service_receiver || r.client || r.customer || "";
  const startDate       = r.start_date || r.services_start_date || r.effective_date || r.signing_date || "";
  const durationOrTerm  = r.duration_or_term || r.period_of_performance || r.duration || "";
  const totalValue      = r.total_contract_value || r.consideration || r.contract_value || r.amount || "";
  const currency        = r.currency || r.consideration_currency || "";
  const paymentTerms    = r.payment_terms || r.milestone_payments || "";
  const invoiceTerms    = r.invoice_terms || r.billing_terms || "";
  const vendorSign      = r.vendor_signatory_name || r.service_provider_signatory || "";
  const vendorDes       = r.vendor_signatory_designation || "";
  const clientSign      = r.client_signatory_name || r.service_receiver_signatory || "";
  const clientDes       = r.client_signatory_designation || "";
  const personnel       = r.personnel_assigned || r.personnel || r.assigned_team || "";

  // Build payment schedule tables from milestone payment_terms if not already extracted
  let paymentScheduleTables = Array.isArray(r.payment_schedule_tables) ? r.payment_schedule_tables : [];
  if (paymentScheduleTables.length === 0 && paymentTerms) {
    // Try to parse milestone rows from text like "Execution of contract – 20%"
    const milestoneRows = [];
    const lines = paymentTerms.split(/\n|;|,/).map(l => l.trim()).filter(Boolean);
    const pctRe = /(.+?)[–\-:]\s*(\d+)\s*%/;
    const totalNum = parseFloat(String(totalValue).replace(/[^0-9.]/g, "")) || 0;
    lines.forEach(line => {
      const m = line.match(pctRe);
      if (m) {
        const pct = parseFloat(m[2]);
        const amount = totalNum > 0 ? `${currency} ${Math.round(totalNum * pct / 100).toLocaleString()}` : "";
        milestoneRows.push({ Milestone: m[1].trim(), Percentage: `${pct}%`, Amount: amount });
      }
    });
    if (milestoneRows.length > 0) {
      paymentScheduleTables = [{
        table_title: "Payment Schedule",
        table_type: "Milestone-based",
        currency,
        columns: ["Milestone", "Percentage", "Amount"],
        rows: milestoneRows,
      }];
    }
  }

  return {
    // Core entity fields (saved to DB)
    title,
    sow_number:                    sowNumber,
    vendor_name:                   vendorName,
    vendor_email:                  r.vendor_contact_email || r.invoice_emails || "",
    description:                   buildDescription(r, personnel),
    start_date:                    startDate,
    end_date:                      r.end_date || "",
    notes:                         buildNotes(r),
    rate_cards:                    Array.isArray(r.rate_cards) ? r.rate_cards : [],
    commercial_tables:             Array.isArray(r.commercial_tables) ? r.commercial_tables : [],
    payment_schedule_tables:       paymentScheduleTables,
    // Extended fields stored on the SOW entity
    _client_organisation:          clientOrg,
    _duration_or_term:             durationOrTerm,
    _total_contract_value:         totalValue,
    _currency:                     currency,
    _payment_terms:                paymentTerms,
    _invoice_terms:                invoiceTerms,
    _invoice_emails:               r.invoice_emails || "",
    _travel_expense_terms:         r.travel_expense_terms || "",
    _personnel_assigned:           personnel,
    _msa_reference:                r.msa_reference || "",
    _scope_of_work:                r.scope_of_work || "",
    _deliverables:                 r.deliverables || [],
    _governance_requirements:      r.governance_requirements || "",
    _quality_requirements:         r.quality_requirements || "",
    _release_management:           r.release_management || "",
    _knowledge_transfer:           r.knowledge_transfer || "",
    _vendor_signatory_name:        vendorSign,
    _vendor_signatory_designation: vendorDes,
    _client_signatory_name:        clientSign,
    _client_signatory_designation: clientDes,
    _governing_law:                r.governing_law || "",
    _linked_grant:                 r.linked_grant_or_project || "",
  };
}

function buildDescription(r, personnel) {
  const parts = [r.scope_of_work, r.objectives].filter(Boolean);
  let desc = parts.join("\n\n");
  if (personnel) desc += (desc ? "\n\n" : "") + `Personnel Assigned: ${personnel}`;
  if (r.governance_requirements) desc += `\n\nGovernance: ${r.governance_requirements}`;
  if (r.quality_requirements) desc += `\n\nQuality & Documentation: ${r.quality_requirements}`;
  if (r.release_management) desc += `\n\nRelease Management: ${r.release_management}`;
  if (r.knowledge_transfer) desc += `\n\nKnowledge Transfer: ${r.knowledge_transfer}`;
  return desc;
}

function buildNotes(r) {
  const arrayToStr = (arr) => Array.isArray(arr) && arr.length > 0
    ? arr.map(i => typeof i === "string" ? i : JSON.stringify(i)).join("; ")
    : "";

  const paymentTerms   = r.payment_terms || r.milestone_payments || "";
  const totalValue     = r.total_contract_value || r.consideration || r.contract_value || "";
  const currency       = r.currency || r.consideration_currency || "";
  const invoiceTerms   = r.invoice_terms || r.billing_terms || "";
  const durationOrTerm = r.duration_or_term || r.period_of_performance || "";

  return [
    paymentTerms                 && `Payment Terms: ${paymentTerms}`,
    totalValue                   && `Contract Value: ${totalValue}${currency ? ` ${currency}` : ""}`,
    invoiceTerms                 && `Invoice Terms: ${invoiceTerms}`,
    r.invoice_emails             && `Invoice Emails: ${r.invoice_emails}`,
    r.travel_expense_terms       && `Travel Expenses: ${r.travel_expense_terms}`,
    r.tax_details                && `Tax: ${r.tax_details}`,
    durationOrTerm               && `Term/Duration: ${durationOrTerm}`,
    r.msa_reference              && `MSA Reference: ${r.msa_reference}`,
    r.governing_law              && `Governing Law: ${r.governing_law}`,
    r.termination_clause         && `Termination: ${r.termination_clause}`,
    r.confidentiality_clause     && `Confidentiality: ${r.confidentiality_clause}`,
    r.acceptance_criteria        && `Acceptance Criteria: ${r.acceptance_criteria}`,
    r.deliverables?.length       && `Deliverables: ${arrayToStr(r.deliverables)}`,
    r.signature_evidence         && `Signatures: ${r.signature_evidence}`,
    r.extraction_notes           && `Notes: ${r.extraction_notes}`,
    r.missing_fields?.length     && `Missing: ${r.missing_fields.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function deriveValidationStatus(r) {
  const score = r.confidence_score || 0;
  if (score >= 70) return "Valid";
  if (score >= 20) return "NeedsReview";
  return "NeedsReview";
}

function buildExtractedMetadata(r) {
  return {
    document_title:          r.sow_title || r.title || "",
    document_type:           r.document_type || "SOW",
    vendor_service_provider: r.vendor_name || r.service_provider || "",
    parties_involved:        [r.vendor_name || r.service_provider, r.client_organisation || r.service_receiver].filter(Boolean).join(", "),
    start_date:              r.start_date || r.services_start_date || r.effective_date || "",
    end_date:                r.end_date || "",
    payment_terms:           r.payment_terms || r.milestone_payments || "",
    grant_amount:            r.total_contract_value || r.consideration || "",
    invoice_amount:          r.total_contract_value || r.consideration || "",
    key_clauses:             [r.termination_clause, r.confidentiality_clause, r.msa_reference].filter(Boolean).join("; "),
    governing_law:           r.governing_law || "",
    signature_evidence:      r.signature_evidence || "",
    missing_fields:          (r.missing_fields || []).join(", "),
    extraction_notes:        r.extraction_notes || "",
    validation_reason:       r.validation_reason || "",
  };
}