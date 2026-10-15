import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CLAUSE_HEADINGS = [
  "Payment", "Fees", "Invoice", "Commercial", "Tax", "Term", "Termination",
  "Notice", "Renewal", "Confidentiality", "Intellectual Property", "Ownership",
  "Data Protection", "Privacy", "Warranty", "Warranties", "Liability",
  "Indemnity", "Indemnification", "Dispute", "Governing Law", "Arbitration",
  "Force Majeure", "Assignment", "Subcontract", "Compliance", "Audit",
  "Notices", "Communication", "SLA", "Service Level", "Support"
];

function clauseTypeFor(title) {
  const t = title.toLowerCase();
  if (t.includes("payment") || t.includes("fee") || t.includes("invoice") || t.includes("tax") || t.includes("commercial")) return "Commercial";
  if (t.includes("terminat") || t.includes("liability") || t.includes("indemnit") || t.includes("dispute") || t.includes("governing") || t.includes("arbitrat") || t.includes("force majeure") || t.includes("assignment")) return "Legal";
  if (t.includes("confidential") || t.includes("intellectual") || t.includes("data protection") || t.includes("privacy") || t.includes("warrant")) return "Compliance";
  if (t.includes("audit") || t.includes("sla") || t.includes("support") || t.includes("notice")) return "Operational";
  return "Legal";
}

function riskFor(title) {
  const t = title.toLowerCase();
  if (t.includes("liability") || t.includes("indemnit") || t.includes("terminat") || t.includes("arbitrat")) return "High";
  if (t.includes("payment") || t.includes("confidential") || t.includes("intellectual") || t.includes("data protection")) return "Medium";
  return "Low";
}

function fallbackExtractClauses(text) {
  const clauses = [];
  const lines = text.split('\n');
  let currentHeading = null;
  let currentLines = [];

  const isHeadingLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) return false;
    return CLAUSE_HEADINGS.some(h => trimmed.toLowerCase().includes(h.toLowerCase()));
  };

  const flush = () => {
    if (currentHeading && currentLines.length > 0) {
      const full = currentLines.join('\n').trim();
      if (full.length > 20) {
        clauses.push({
          clause_title: currentHeading.trim(),
          clause_type: clauseTypeFor(currentHeading),
          clause_number: "",
          summary: full.slice(0, 250) + (full.length > 250 ? "…" : ""),
          full_text: full.slice(0, 2000),
          risk_level: riskFor(currentHeading),
          obligation_owner: "—",
          notice_period_days: "",
          amount_or_cap: "",
          source_section: currentHeading.trim(),
          confidence: 50
        });
      }
    }
  };

  for (const line of lines) {
    if (isHeadingLine(line)) {
      flush();
      currentHeading = line.trim();
      currentLines = [];
    } else if (currentHeading) {
      currentLines.push(line);
    }
  }
  flush();
  return clauses;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pdf_url, msa_id, extract_type = "both" } = body;

    console.log("extract_type:", extract_type, "| msa_id:", msa_id, "| pdf_url:", pdf_url ? "provided" : "MISSING");

    if (!pdf_url) {
      return Response.json({
        success: false,
        key_clauses: [],
        structured_services: [],
        error_type: "no_pdf",
        message: "No uploaded agreement found for this MSA. Please upload an agreement first."
      }, { status: 400 });
    }

    const doServices = extract_type === "services" || extract_type === "both";
    const doClauses = extract_type === "key_clauses" || extract_type === "both";

    const servicesPrompt = `You are a contract analyst. Read this entire MSA document and extract the scope of services.

Find all service categories under headings like "Services", "Scope of Services", "Schedule A", "Annex", "Exhibit", or similar.

Return JSON with key "structured_services" as an array. Each item:
- service_category: name (e.g. "Research and Development")
- description: 1-3 sentences max
- bullet_points: array of sub-activity strings, or []
- responsibility: "Vendor", "Client", "Both", or "—"
- limitations_or_notes: exclusions or notes, or ""
- source_section: heading name
- source_clause: clause number or ""

Return ONLY valid JSON: { "structured_services": [...] }`;

    const clausesPrompt = `You are a senior legal contract analyst. Read this ENTIRE MSA document from start to finish including all pages, schedules, and annexures.

Extract ALL important clauses. Look for: Payment Terms, Invoice Terms, Fees, Taxes, Term, Renewal, Termination, Notice Period, Confidentiality, Intellectual Property, Data Protection, Warranties, Limitation of Liability, Indemnity, Dispute Resolution, Governing Law, Arbitration, Force Majeure, Assignment, Compliance, Audit Rights, Notices, Service Levels.

IMPORTANT: Read ALL pages — key clauses often appear on later pages.

Return JSON with key "key_clauses" (aim for 8-20). Each item:
- clause_title: descriptive title
- clause_type: one of "Commercial", "Legal", "Operational", "Compliance", "Risk"
- clause_number: section number from document, or ""
- summary: 2-4 plain English sentences on what it says and business impact
- full_text: verbatim or near-verbatim clause text
- risk_level: "Low", "Medium", or "High"
- obligation_owner: "Vendor", "Client", "Both", or "—"
- notice_period_days: days as string (e.g. "30") or ""
- amount_or_cap: monetary amount or ""
- source_section: section heading
- confidence: 0-100

Return ONLY valid JSON: { "key_clauses": [...], "extraction_notes": "brief note" }`;

    // Build parallel calls for only what's needed
    const calls = [];
    if (doServices) {
      calls.push(base44.integrations.Core.InvokeLLM({
        prompt: servicesPrompt,
        file_urls: [pdf_url],
        model: 'gpt_5_4',
        response_json_schema: {
          type: 'object',
          properties: {
            structured_services: { type: 'array', items: { type: 'object', properties: {
              service_category: { type: 'string' }, description: { type: 'string' },
              bullet_points: { type: 'array', items: { type: 'string' } },
              responsibility: { type: 'string' }, limitations_or_notes: { type: 'string' },
              source_section: { type: 'string' }, source_clause: { type: 'string' }
            }}}
          }
        }
      }));
    }
    if (doClauses) {
      calls.push(base44.integrations.Core.InvokeLLM({
        prompt: clausesPrompt,
        file_urls: [pdf_url],
        model: 'gpt_5_4',
        response_json_schema: {
          type: 'object',
          properties: {
            key_clauses: { type: 'array', items: { type: 'object', properties: {
              clause_title: { type: 'string' }, clause_type: { type: 'string' },
              clause_number: { type: 'string' }, summary: { type: 'string' },
              full_text: { type: 'string' }, risk_level: { type: 'string' },
              obligation_owner: { type: 'string' }, notice_period_days: { type: 'string' },
              amount_or_cap: { type: 'string' }, source_section: { type: 'string' },
              confidence: { type: 'number' }
            }}},
            extraction_notes: { type: 'string' }
          }
        }
      }));
    }

    let results;
    try {
      results = await Promise.all(calls);
    } catch (llmError) {
      console.error("LLM extraction error:", llmError.message);
      return Response.json({
        success: false,
        key_clauses: [],
        structured_services: [],
        error_type: "llm_failed",
        message: `AI extraction failed: ${llmError.message}`
      }, { status: 500 });
    }

    let servicesResult = { structured_services: [] };
    let clausesResult = { key_clauses: [], extraction_notes: "" };

    let idx = 0;
    if (doServices) { servicesResult = results[idx++]; }
    if (doClauses) { clausesResult = results[idx++]; }

    console.log("Services found:", servicesResult.structured_services?.length || 0);
    console.log("Key clauses found:", clausesResult.key_clauses?.length || 0);

    let keyClauses = clausesResult.key_clauses || [];
    let extractionNotes = clausesResult.extraction_notes || "";

    // Fallback if AI returned no clauses
    if (doClauses && keyClauses.length === 0) {
      console.log("AI returned 0 clauses — running fallback...");
      try {
        const fetchRes = await fetch(pdf_url);
        const pdfText = await fetchRes.text();
        const hasHeadings = CLAUSE_HEADINGS.some(h => pdfText.toLowerCase().includes(h.toLowerCase()));
        if (hasHeadings) {
          keyClauses = fallbackExtractClauses(pdfText);
          extractionNotes = "Fallback extraction used — AI returned no clauses. Results may be less accurate.";
          console.log("Fallback clauses:", keyClauses.length);
        } else {
          extractionNotes = "Agreement text was extracted but no known clause headings were detected. Please add clauses manually.";
        }
      } catch (fetchErr) {
        console.error("Fallback fetch failed:", fetchErr.message);
        extractionNotes = "AI extraction returned no clauses. Please retry or add clauses manually.";
      }
    }

    const processingMs = Date.now() - startTime;
    console.log("Total processing time:", processingMs, "ms");

    return Response.json({
      success: true,
      structured_services: servicesResult.structured_services || [],
      key_clauses: keyClauses,
      extraction_notes: extractionNotes,
      processing_time_ms: processingMs
    });

  } catch (error) {
    console.error("extractMsaServicesAndKeyClauses error:", error.message);
    return Response.json({
      success: false,
      key_clauses: [],
      structured_services: [],
      error_type: "unexpected",
      message: error.message
    }, { status: 500 });
  }
});