import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function extractPdfText(pdfBytes) {
  try {
    const { extractText } = await import('npm:unpdf@0.11.0');
    const result = await extractText(pdfBytes, { mergePages: false });
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    let fullText = '';
    pages.forEach((pageText, i) => {
      fullText += `\n\n--- PAGE ${i + 1} ---\n${pageText}`;
    });
    console.log('[tranches] unpdf pages:', pages.length, 'chars:', fullText.length);
    return fullText;
  } catch (err) {
    console.error('[tranches] unpdf failed:', err.message);
    return null;
  }
}

async function fetchPdfBytes(pdf_url, authToken) {
  const headers = { 'Accept': 'application/pdf,*/*' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(pdf_url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function buildTranchesPrompt(docText) {
  const textSection = docText
    ? `FULL DOCUMENT TEXT (all pages):\n\`\`\`\n${docText}\n\`\`\`\n\n`
    : `Analyze the attached PDF document.\n\n`;

  return `You are an expert grant contract analyst specializing in financial schedules. Analyze this grant agreement document and extract ALL payment/disbursement/tranche/invoice schedule entries.

${textSection}
═══════════════════════════════════════
TRANCHE / PAYMENT SCHEDULE EXTRACTION
═══════════════════════════════════════

Search EVERY section of the document for payment or disbursement information. Sections to look for include (but are not limited to):

- Tranches / Tranche Schedule
- Disbursement Schedule / Fund Disbursement
- Payment Schedule / Payment Terms / Payment Milestones
- Invoice Schedule / Invoice Date table
- Budget and Disbursement Details
- Annex B (often contains payment/budget tables)
- Funding Schedule / Fund Release Schedule
- Grant Payment / Installment / Instalment
- Allocation of Funds / Budget Details
- Consideration / Financial Terms
- Reporting Schedule linked to payment release
- Release Conditions
- Any table with columns like: Invoice Date | Deliverable | Amount | Due Date | Percentage

CRITICAL TABLE PARSING RULES:
- If a table has 5 payment rows → extract 5 separate tranche records. NEVER merge rows.
- A "tranche" may be called: payment, disbursement, installment, milestone payment, invoice, grant release, funding tranche, budget line.
- Do NOT rely only on the word "tranche" — look for any structured payment/disbursement data.
- Each meaningful payment/funding row in any table = one tranche record.

FIELD EXTRACTION RULES:
- tranche_name: The name/description of the payment (e.g., "First Disbursement", "Technical Scoping & Use-Case Definition", "Signing of Contract")
- amount: Numeric value only (e.g., 100499.00). Remove currency symbols and commas.
- currency: ISO code (USD, EUR, GBP etc). Default "USD" if $ is used.
- invoice_trigger_date: The date when an invoice should be raised. If text says "upon contract execution" or "contract date", set this to empty and put the condition in trigger_condition.
- due_date: The milestone/payment due date in YYYY-MM-DD format.
- trigger_condition: Text description of what triggers this payment (e.g., "Upon contract signing", "Upon delivery of inception report").
- percentage: If payment is expressed as a % of total (e.g., "20%"), store here.
- source_section: The exact section/annex name where this was found (e.g., "Annex B | Disbursement Schedule").
- source_page: Page number where found (from the "--- PAGE X ---" markers in the text).
- confidence: 0-100 score of extraction confidence.

DATE FORMAT RULES:
- Convert all dates to YYYY-MM-DD format.
- "31 March 2025" → "2025-03-31"
- "Jun 30, 2025" → "2025-06-30"
- If date is a condition like "Contract date" or "Upon signing", leave due_date/invoice_trigger_date empty and use trigger_condition field.
- If date is ambiguous, leave blank and note raw text in notes field.

AMOUNT RULES:
- "$100,499.00" → amount: 100499.00, currency: "USD"
- "USD 39,790" → amount: 39790, currency: "USD"
- If only a percentage is given and total contract value is available, calculate amount and note it.
- If only percentage with no total, set amount to null and fill percentage field.

STATUS DEFAULTING:
- Default to "pending" unless the document explicitly confirms payment was received/completed.

═══════════════════════════════════════
RESPONSE (STRICT JSON ONLY)
═══════════════════════════════════════

Return ONLY this JSON — no markdown, no code fences, no explanation:
{
  "tranches": [
    {
      "tranche_name": "string (required)",
      "amount": number or null,
      "currency": "USD",
      "invoice_trigger_date": "YYYY-MM-DD or empty string",
      "due_date": "YYYY-MM-DD or empty string",
      "trigger_condition": "string describing payment trigger condition",
      "percentage": "e.g. 20% or empty string",
      "status": "pending",
      "notes": "any extra context",
      "source_section": "exact section/annex name",
      "source_page": number or null,
      "confidence": 0-100
    }
  ],
  "extraction_notes": "Brief summary: X tranches found in [sections]. Total contract value if found.",
  "total_contract_value": number or null,
  "currency": "USD"
}

RULES:
- NEVER return an empty tranches array if the document contains ANY payment/disbursement/invoice/funding schedule data.
- If truly no payment schedule exists, return tranches: [] and explain in extraction_notes.
- Just return JSON.
`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pdf_url, grant_id, existing_tranches = [] } = body;

    if (!pdf_url) return Response.json({ error: 'pdf_url is required' }, { status: 400 });
    if (!grant_id) return Response.json({ error: 'grant_id is required' }, { status: 400 });

    console.log('[tranches] Starting extraction for grant:', grant_id, 'pdf:', pdf_url?.substring(0, 80));

    // ── 1. Fetch PDF ─────────────────────────────────────────────────────────
    let pdfBytes;
    try {
      const authToken = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
      pdfBytes = await fetchPdfBytes(pdf_url, authToken);
    } catch (e) {
      return Response.json({
        tranches: [],
        extraction_notes: `PDF fetch failed: ${e.message}. Please check the PDF URL is accessible.`,
        total_contract_value: null,
        currency: 'USD'
      });
    }

    // ── 2. Extract text ──────────────────────────────────────────────────────
    let extractedText = await extractPdfText(pdfBytes);

    if (!extractedText || extractedText.trim().length < 200) {
      console.log('[tranches] Text extraction failed, trying vision LLM...');
      try {
        const base64Pdf = btoa(String.fromCharCode(...pdfBytes.slice(0, 500000)));
        const dataUrl = `data:application/pdf;base64,${base64Pdf}`;
        const visionRaw = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: buildTranchesPrompt(''),
          file_urls: [dataUrl],
          model: 'claude_sonnet_4_6'
        });
        let visionResult = {};
        try {
          let vs = typeof visionRaw === 'string' ? visionRaw : JSON.stringify(visionRaw);
          vs = vs.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
          visionResult = JSON.parse(vs);
        } catch {}
        const tranches = (visionResult?.tranches || []).map((t, i) => ({
          ...t,
          _key: `t_${i}`,
          _is_duplicate: checkDuplicate(t, existing_tranches)
        }));
        return Response.json({
          tranches,
          extraction_notes: visionResult?.extraction_notes || 'Extracted via vision fallback.',
          total_contract_value: visionResult?.total_contract_value || null,
          currency: visionResult?.currency || 'USD'
        });
      } catch (visionErr) {
        return Response.json({
          tranches: [],
          extraction_notes: `PDF text extraction failed and vision fallback also failed: ${visionErr.message}. The PDF may be password-protected or scanned.`,
          total_contract_value: null,
          currency: 'USD'
        });
      }
    }

    console.log('[tranches] Text extracted, chars:', extractedText.length);
    console.log('[tranches] Has Annex B:', extractedText.includes('Annex B'));
    console.log('[tranches] Has Disbursement:', extractedText.includes('Disbursement'));
    console.log('[tranches] Has Payment Schedule:', extractedText.includes('Payment Schedule'));
    console.log('[tranches] Has Tranche:', extractedText.toLowerCase().includes('tranche'));
    console.log('[tranches] Has Invoice:', extractedText.includes('Invoice'));

    // ── 3. Call LLM ──────────────────────────────────────────────────────────
    const textForLLM = extractedText.length > 120000 ? extractedText.slice(0, 120000) + '\n[TRUNCATED]' : extractedText;
    const prompt = buildTranchesPrompt(textForLLM);

    let rawLLMResponse;
    try {
      rawLLMResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        model: 'claude_sonnet_4_6'
      });
    } catch (llmErr) {
      return Response.json({
        tranches: [],
        extraction_notes: `LLM extraction failed: ${llmErr.message}`,
        total_contract_value: null,
        currency: 'USD'
      });
    }

    console.log('[tranches] LLM response length:', rawLLMResponse?.length ?? 0);

    // ── 4. Parse JSON ────────────────────────────────────────────────────────
    let result = {};
    try {
      let jsonStr = typeof rawLLMResponse === 'string' ? rawLLMResponse : JSON.stringify(rawLLMResponse);
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      const jsonMatch = (typeof rawLLMResponse === 'string' ? rawLLMResponse : '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { result = JSON.parse(jsonMatch[0]); } catch {}
      }
    }

    let finalTranches = result?.tranches || [];
    let notes = result?.extraction_notes || '';

    if (finalTranches.length === 0) {
      notes = notes || 'No tranche/payment/disbursement schedule was detected in this PDF. The document may not contain a structured payment schedule, or the payment terms may be described in narrative form. Please use manual entry.';
    }

    // ── 5. Duplicate detection ───────────────────────────────────────────────
    const tranches = finalTranches.map((t, i) => ({
      ...t,
      _key: `t_${i}`,
      _is_duplicate: checkDuplicate(t, existing_tranches)
    }));

    console.log('[tranches] Final tranches:', tranches.length);

    return Response.json({
      tranches,
      extraction_notes: notes.trim(),
      total_contract_value: result?.total_contract_value || null,
      currency: result?.currency || 'USD'
    });

  } catch (err) {
    console.error('[tranches] Unexpected error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});

function checkDuplicate(tranche, existing) {
  if (!existing || existing.length === 0) return false;
  const name = (tranche.tranche_name || '').toLowerCase().slice(0, 60);
  const amt = tranche.amount;
  const due = tranche.due_date;
  return existing.some(e => {
    const eName = (e.tranche_name || '').toLowerCase().slice(0, 60);
    const nameMatch = name && eName && (name === eName || name.includes(eName.slice(0, 40)) || eName.includes(name.slice(0, 40)));
    const amtMatch = amt && e.amount && Math.abs(amt - e.amount) < 1;
    const dueMatch = due && e.due_date && due === e.due_date;
    return nameMatch || (amtMatch && dueMatch);
  });
}