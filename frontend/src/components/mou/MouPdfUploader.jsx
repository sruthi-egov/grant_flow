import { useState, useRef } from "react";
import { api } from "@/api/apiClient";
import { Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { computeFileHash, checkDuplicate, logDocumentUpload, logRejectedUpload } from "@/hooks/usePdfUpload";
import DuplicateUploadDialog from "@/components/shared/DuplicateUploadDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePermissions, canUploadPDF } from "@/hooks/useCanUploadPdf";
import { logAudit } from "@/utils/auditLogger";

const STAGES = [
  { key: "uploading",  label: "Uploading file…" },
  { key: "hashing",   label: "Checking for duplicates…" },
  { key: "extracting",label: "Extracting & analysing document…" },
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

export default function MouPdfUploader({ onExtracted }) {
  const [stage, setStage]             = useState(null);
  const [fileName, setFileName]       = useState("");
  const [duplicateRecord, setDuplicate] = useState(null);
  const [pendingFile, setPending]     = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, message: "" });
  const [slowWarning, setSlowWarning] = useState(false);
  const slowTimer = useRef(null);
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

      // Stage 3: single combined AI call
      setStage("extracting");
      const extraction = await extractMouData(file_url);

      // Stage 4: fire-and-forget logging
      setStage("logging");
      Promise.all([
        logDocumentUpload({
          fileName: file.name, fileUrl: file_url, fileHash: hash,
          entityType: "MOU", uploadedBy: user?.email || "",
          isDpiRelevant: extraction.dpi_centre_reference?.is_present ?? true,
          dpiReason: extraction.dpi_centre_reference?.role || "",
          isDuplicate, isInvalid: false, invalidReason: "",
        }),
        api.entities.DocumentValidationLog.create({
          file_name: file.name,
          file_url,
          file_hash: hash,
          selected_module: "MOU",
          detected_document_type: extraction.document_type || "MOU",
          validation_status: deriveValidationStatus(extraction),
          confidence_score: extraction.confidence_score || 0,
          rejection_reason: "",
          extracted_metadata: buildExtractedMetadata(extraction),
          uploaded_by: user?.email || "",
        }).catch(() => {}),
        logAudit({
          action_type: "document_uploaded",
          entity_type: "MOU",
          description: `MoU PDF "${file.name}" uploaded. Status: ${deriveValidationStatus(extraction)}. Confidence: ${extraction.confidence_score || 0}%.`,
          status: "success",
        }),
      ]).catch(() => {});

      setStage("done");
      clearTimeout(slowTimer.current);
      setSlowWarning(false);
      onExtracted(mapExtractionToMouFields(extraction), file_url, extraction);

    } catch (err) {
      clearTimeout(slowTimer.current);
      setStage(null);
      setFileName("");
      const status = err?.response?.status || err?.status;
      let msg;
      if (status === 502 || status === 503 || status === 504) {
        msg = "The server is temporarily unavailable (502). Please wait a moment and try uploading again.";
      } else if (err?.message?.includes("timeout")) {
        msg = "MoU extraction timed out. You can save the file manually or retry.";
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
    if (!canUploadPDF(permissions, "MOUs")) {
      setRejectDialog({ open: true, message: "You do not have permission to upload PDFs in this module." });
      return;
    }
    await processFile(file, false);
  };

  if (checkingPermission) return null;
  if (!canUploadPDF(permissions, "MOUs")) return null;

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
            <p className="text-sm font-medium">Upload MoU PDF</p>
            <p className="text-xs text-muted-foreground text-center">AI will extract parties, dates, signatories, and key terms automatically</p>
          </div>
        )}
      </label>
    </>
  );
}

async function extractMouData(fileUrl) {
  const raw = await api.integrations.Core.InvokeLLM({
    model: "claude_sonnet_4_6",
    prompt: `You are an expert legal document analyser specialising in Memoranda of Understanding (MoUs).

This document may be bilingual (e.g. English + Portuguese). Prefer English sections. Accept Portuguese equivalents:
- Memorando de Entendimento = Memorandum of Understanding
- Partes / Entre = Parties / Between
- Duração / Vigência = Term
- Legislação aplicável = Governing Law
- Assinaturas / Em testemunho = Signatures

EXTRACTION RULES:
1. Extract ALL information explicitly stated in the document. Do NOT leave fields empty if the information is present.
2. OCR noise or broken formatting is acceptable — do your best to read the content.
3. Extract ALL party names even if there are 3 parties (eGovernments Foundation, Ministry of Health, DPI Centre Ltd).
4. For DPI Centre: detect "DPI Centre", "DPI Centre Ltd", "DPI Centre Limited", "DPI Centro LDA", "Technology Implementation Partner".
5. For term: if exact dates are missing but "Two years from Effective Date" is stated, use that as validity_period.
6. For signatories: look in signature blocks for names, designations, "For and on behalf of", "IN WITNESS WHEREOF".
7. For governing law: look for "governed by the laws of", "Republic of Mozambique", or similar.
8. Set is_valid_mou to true if the document is clearly an MoU.
9. Do NOT set confidence_score — leave it as null, it will be calculated separately.
10. missing_fields: only list fields that are genuinely absent from the document.

RATE CARD / COMMERCIAL TABLE EXTRACTION (HIGH PRIORITY):
11. Carefully inspect the PDF for ALL tables. Rate card tables are HIGH PRIORITY extraction fields.
12. Do NOT ignore tables. Do NOT summarize tables as plain text. Do NOT merge table rows into one paragraph.
13. Detect tables with headings or nearby text such as: "Rate Card", "Commercials", "Commercial Terms", "Fee Schedule", "Pricing", "Payment Schedule", "Resource Rate", "Role Rate", "Hourly Rate", "Monthly Rate", "Daily Rate", "Consultant Rate", "Retainer Fee", "Cost Breakdown", "Budget", "Milestone Payment", "Financial Terms".
14. For each rate/commercial table found, extract: table title, table type (Hourly Rate / Monthly Rate / Mixed Rate / Payment Schedule / Commercial Terms / Other), all column names, all rows as key-value pairs, currency (₹/INR/USD/$), billing frequency.
15. If no rate card table exists in this MoU, return rate_cards as an empty array — do NOT invent one.
16. MoUs may sometimes contain financial annexures, payment commitments, or contribution tables — capture those too.

Return ONLY a raw JSON object (no markdown, no code blocks). Use this structure:
{
  "document_type": "MoU",
  "is_valid_mou": true,
  "mou_title": "extracted title or Memorandum of Understanding",
  "agreement_type": "",
  "effective_date": "",
  "start_date": "",
  "end_date": "",
  "validity_period": "e.g. Two years from the Effective Date",
  "signing_date": "",
  "parties": [
    {
      "party_name": "full party name",
      "organization": "organisation name",
      "role": "role in this MoU",
      "representative_name": "signatory name if found",
      "designation": "designation/title if found",
      "signature_present": true
    }
  ],
  "dpi_centre_reference": {
    "is_present": true,
    "matched_text": "exact text matched",
    "role": "Technology Implementation Partner"
  },
  "purpose": "purpose of the MoU",
  "scope_of_collaboration": "scope details",
  "governing_law": "Republic of Mozambique",
  "renewal_terms": "",
  "termination_clause": "",
  "confidentiality_clause": "",
  "signature_evidence": "summary of signature block findings",
  "rate_cards": [
    {
      "table_title": "Rate Card",
      "table_type": "Monthly Rate",
      "columns": ["Role", "Monthly Rate", "Currency"],
      "rows": [
        { "Role": "Consultant", "Monthly Rate": "150000", "Currency": "INR" }
      ],
      "currency": "INR",
      "billing_frequency": "Monthly",
      "extraction_confidence": 85,
      "notes": ""
    }
  ],
  "missing_fields": ["list only fields not found in the document"],
  "extraction_notes": "any notes about the extraction quality",
  "validation_reason": ""
}`,
    file_urls: [fileUrl],
  });

  // raw is a string when no response_json_schema is used — parse it
  let parsed;
  if (typeof raw === "string") {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try extracting the first {...} block
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      } else {
        parsed = {};
      }
    }
  } else {
    parsed = raw || {};
  }

  // Calculate confidence client-side so it is never wrong
  parsed.confidence_score = calculateConfidence(parsed);
  return parsed;
}

function calculateConfidence(r) {
  let score = 0;
  if (r.mou_title && r.mou_title.trim())                                score += 15;
  if (r.parties && r.parties.length >= 2)                               score += 20;
  if (r.dpi_centre_reference?.is_present)                               score += 15;
  if (r.purpose && r.purpose.trim())                                     score += 10;
  if (r.scope_of_collaboration && r.scope_of_collaboration.trim())       score += 10;
  if (r.validity_period || r.effective_date || r.end_date)              score += 10;
  if (r.governing_law && r.governing_law.trim())                         score += 10;
  if (r.signature_evidence && r.signature_evidence.trim())              score += 5;
  const hasSignatory = r.parties?.some(p => p.representative_name && p.representative_name.trim());
  if (hasSignatory)                                                       score += 5;
  return score;
}

function mapExtractionToMouFields(r) {
  const parties = r.parties || [];

  // Identify each party by role
  const dpiParty  = parties.find(p => isDpiParty(p));
  const egovParty = parties.find(p => isEgovParty(p));
  // The "partner" is whichever party is neither DPI nor eGov (e.g. Ministry of Health)
  const partnerParty = parties.find(p => !isDpiParty(p) && !isEgovParty(p))
    || parties.find(p => !isDpiParty(p))
    || parties[0] || {};
  const ourParty = egovParty || parties.find(p => !isDpiParty(p) && p !== partnerParty) || {};

  return {
    title:                         r.mou_title || "",
    partner_name:                  partnerParty.organization || partnerParty.party_name || "",
    partner_type:                  inferPartnerType(partnerParty),
    partner_contact_name:          partnerParty.representative_name || "",
    partner_signatory_name:        partnerParty.representative_name || "",
    partner_signatory_designation: partnerParty.designation || "",
    our_contact_name:              ourParty.representative_name || "",
    our_signatory_name:            ourParty.representative_name || "",
    our_signatory_designation:     ourParty.designation || "",
    effective_date:                r.effective_date || r.start_date || r.signing_date || "",
    end_date:                      r.end_date || "",
    // Show term as text if years can't be parsed, so it's not "Not extracted"
    initial_term_years:            parseTermYears(r.validity_period) || parseTermYears(r.end_date),
    governing_law:                 r.governing_law || "",
    purpose:                       r.purpose || "",
    scope_of_collaboration:        r.scope_of_collaboration || "",
    notes:                         buildNotes(r),
    rate_cards:                    Array.isArray(r.rate_cards) ? r.rate_cards : [],
    // Extra fields for display (stored in notes if needed)
    _term_text:                    r.validity_period || "",
    _dpi_signatory:                dpiParty?.representative_name || "",
    _dpi_designation:              dpiParty?.designation || "",
  };
}

function isEgovParty(party) {
  const text = `${party.party_name} ${party.organization} ${party.role}`.toLowerCase();
  return text.includes("egovernment") || text.includes("egovern") || text.includes("egov");
}

function isDpiParty(party) {
  const text = `${party.party_name} ${party.organization} ${party.role}`.toLowerCase();
  return text.includes("dpi") || text.includes("digital public infrastructure");
}

function inferPartnerType(party) {
  const t = `${party.party_name} ${party.organization} ${party.role}`.toLowerCase();
  if (t.includes("government") || t.includes("ministry") || t.includes("dept")) return "government";
  if (t.includes("ngo") || t.includes("non-governmental") || t.includes("nonprofit")) return "ngo";
  if (t.includes("university") || t.includes("college") || t.includes("institute") || t.includes("academic")) return "academic";
  if (t.includes("united nations") || t.includes("world bank") || t.includes("multilateral")) return "multilateral";
  if (t.includes("pvt") || t.includes("private") || t.includes("ltd") || t.includes("inc")) return "private";
  return "other";
}

function parseTermYears(v) {
  if (!v) return null;
  const y = v.match(/(\d+)\s*year/i);
  if (y) return parseInt(y[1]);
  const m = v.match(/(\d+)\s*month/i);
  if (m) return Math.round(parseInt(m[1]) / 12);
  return null;
}

function buildNotes(r) {
  return [
    r.renewal_terms          && `Renewal: ${r.renewal_terms}`,
    r.termination_clause     && `Termination: ${r.termination_clause}`,
    r.confidentiality_clause && `Confidentiality: ${r.confidentiality_clause}`,
    r.signature_evidence     && `Signatures: ${r.signature_evidence}`,
    r.extraction_notes       && `Notes: ${r.extraction_notes}`,
    r.missing_fields?.length && `Missing: ${r.missing_fields.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function deriveValidationStatus(r) {
  const score = r.confidence_score || 0;
  if (score >= 70) return "Valid";
  if (score >= 20) return "NeedsReview";
  if (!r.is_valid_mou) return "NeedsReview";
  return "NeedsReview";
}

function buildExtractedMetadata(r) {
  const p1 = r.parties?.[0] || {}, p2 = r.parties?.[1] || {};
  return {
    document_title:         r.mou_title || "",
    document_type:          r.document_type || "MOU",
    parties_involved:       r.parties?.map(p => p.organization || p.party_name).filter(Boolean).join(", ") || "",
    start_date:             r.effective_date || r.start_date || "",
    end_date:               r.end_date || "",
    validity_period:        r.validity_period || "",
    signing_date:           r.signing_date || "",
    party1_signatory:       p1.representative_name || "",
    party1_designation:     p1.designation || "",
    party2_signatory:       p2.representative_name || "",
    party2_designation:     p2.designation || "",
    dpi_centre_present:     String(r.dpi_centre_reference?.is_present || false),
    dpi_centre_role:        r.dpi_centre_reference?.role || "",
    governing_law:          r.governing_law || "",
    signature_evidence:     r.signature_evidence || "",
    missing_fields:         (r.missing_fields || []).join(", "),
    extraction_notes:       r.extraction_notes || "",
    validation_reason:      r.validation_reason || "",
  };
}