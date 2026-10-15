import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Pure-JS PDF text extractor (no native deps) ────────────────────────────
// Uses the unpdf package which is Deno/edge-compatible
async function extractPdfText(pdfBytes) {
  try {
    const { extractText } = await import('npm:unpdf@0.11.0');
    const result = await extractText(pdfBytes, { mergePages: false });
    // result.text is an array of per-page strings
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    let fullText = '';
    pages.forEach((pageText, i) => {
      fullText += `\n\n--- PAGE ${i + 1} ---\n${pageText}`;
    });
    console.log('[PDF] unpdf extracted pages:', pages.length, 'total chars:', fullText.length);
    return fullText;
  } catch (err) {
    console.error('[PDF] unpdf failed:', err.message);
    return null;
  }
}

// ── Fetch PDF bytes ────────────────────────────────────────────────────────
async function fetchPdfBytes(pdf_url, authToken) {
  const headers = { 'Accept': 'application/pdf,*/*' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  console.log('[PDF] Fetching from:', pdf_url.substring(0, 120));
  const res = await fetch(pdf_url, { headers });
  console.log('[PDF] HTTP status:', res.status, 'Content-Type:', res.headers.get('content-type'));
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);
  const buf = await res.arrayBuffer();
  console.log('[PDF] Bytes fetched:', buf.byteLength);
  return new Uint8Array(buf);
}

// ── Deterministic fallback when AI returns empty ───────────────────────────
function fallbackExtract(text, extract_type) {
  const deliverables = [];
  const milestones = [];

  if (extract_type === 'both' || extract_type === 'deliverables') {
    // Objectives numbered list
    const objBlock = text.match(/Objectives?\s*\n([\s\S]{0,5000})(?=Project\s+Deliverables|Annex\s*B|\n\n\n)/i);
    if (objBlock) {
      const bullets = [...objBlock[1].matchAll(/(?:^|\n)\s*\d+[\.\)]\s+(.{20,250})/gm)];
      bullets.forEach((m, i) => {
        deliverables.push({ title: m[1].replace(/\s+/g, ' ').trim().slice(0, 150), description: m[1].trim(), category: 'Technical', source_section: 'Annex A | Objectives', confidence: 72 });
      });
    }

    // Project Deliverables block — lines starting uppercase after the heading
    const pdBlock = text.match(/Project\s+Deliverables\s*\n([\s\S]{0,8000})(?=Annex\s*B|Reporting\s+Requirements|\n\n\n\n)/i);
    if (pdBlock) {
      const lines = pdBlock[1].split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 25 && /^[A-Z]/.test(l));
      lines.forEach(l => {
        const title = l.slice(0, 150);
        if (!deliverables.find(d => d.title.slice(0, 40) === title.slice(0, 40))) {
          deliverables.push({ title, description: title, category: 'Technical', source_section: 'Annex A | Project Deliverables', confidence: 65 });
        }
      });
    }
  }

  if (extract_type === 'both' || extract_type === 'milestones') {
    // Reporting Requirements
    ['Inception Report', 'Interim Progress Report', 'Progress Report', 'Final Report'].forEach(rt => {
      if (text.includes(rt)) {
        milestones.push({ title: rt, description: rt, milestone_type: 'Reporting', due_date: '', source_section: 'Reporting Requirements', confidence: 65 });
      }
    });

    // Disbursement amounts from Annex B
    const annexB = text.match(/Annex\s*B[\s\S]{0,200}(Disbursement|Budget)([\s\S]{0,5000})/i);
    if (annexB) {
      const amts = [...annexB[2].matchAll(/([A-Z][A-Za-z\s\-&\/]{10,80}?)\s+([\d]{2,3}[,\d]*\.\d{2})\s*(?:USD|US\$)?/g)];
      amts.forEach(m => {
        const title = m[1].replace(/\s+/g, ' ').trim();
        const amount = parseFloat(m[2].replace(/,/g, ''));
        if (amount > 1000 && title.length > 5) {
          milestones.push({ title, description: title, milestone_type: 'Payment', amount, currency: 'USD', due_date: '', source_section: 'Annex B | Disbursement Schedule', confidence: 62 });
        }
      });
    }
  }

  return { deliverables, milestones };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pdf_url, parent_type, parent_id, extract_type = 'both', existing_deliverables = [], existing_milestones = [] } = body;

    console.log('[extract] Payload:', { parent_type, parent_id, extract_type, pdf_url: pdf_url?.substring(0, 100) });

    if (!pdf_url) return Response.json({ error: 'pdf_url is required' }, { status: 400 });
    if (!parent_type || !parent_id) return Response.json({ error: 'parent_type and parent_id required' }, { status: 400 });

    const isSow = parent_type === 'sow';
    const isMou = parent_type === 'mou' || parent_type === 'msa';
    const documentLabel = isSow ? 'Statement of Work (SoW)' : isMou ? 'MOU / MOA / Agreement' : 'Grant Agreement / MOA';

    const deliverableCategories = isSow
      ? '["Technical","Documentation","Support","Training","Configuration","Deployment","Reporting","Other"]'
      : '["Program","Financial","Reporting","Compliance","Documentation","Technical","Implementation","Governance","Other"]';

    const milestoneTypes = isSow
      ? '["Payment","Delivery","Review","Release","Support","Documentation","Other"]'
      : '["Payment","Reporting","Disbursement","Program","Compliance","Audit","Review","Other"]';

    // ── 1. Fetch PDF ─────────────────────────────────────────────────────────
    let pdfBytes;
    try {
      const authToken = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
      pdfBytes = await fetchPdfBytes(pdf_url, authToken);
    } catch (e) {
      console.error('[extract] Fetch failed:', e.message);
      return Response.json({ deliverables: [], milestones: [], extraction_notes: `PDF fetch failed: ${e.message}`, total_contract_value: null, currency: 'USD' });
    }

    // ── 2. Extract text ──────────────────────────────────────────────────────
    let extractedText = await extractPdfText(pdfBytes);

    if (!extractedText || extractedText.trim().length < 200) {
      console.error('[extract] Text extraction failed or empty. Chars:', extractedText?.length ?? 0);

      // Last-resort fallback: encode PDF as base64 and send to vision LLM
      console.log('[extract] Trying vision LLM fallback with raw PDF bytes...');
      const base64Pdf = btoa(String.fromCharCode(...pdfBytes.slice(0, 500000))); // max ~375kb decoded
      const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

      try {
        const visionRaw = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: buildLLMPrompt('', extract_type, documentLabel, deliverableCategories, milestoneTypes),
          file_urls: [dataUrl],
          model: 'claude_sonnet_4_6'
        });
        let visionResult = {};
        try {
          let vs = typeof visionRaw === 'string' ? visionRaw : JSON.stringify(visionRaw);
          vs = vs.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
          visionResult = JSON.parse(vs);
        } catch {}
        console.log('[extract] Vision LLM deliverables:', visionResult?.deliverables?.length, 'milestones:', visionResult?.milestones?.length);
        const delvs = (visionResult?.deliverables || []).map((d, i) => ({ ...d, _key: `d_${i}`, _is_duplicate: false }));
        const miles = (visionResult?.milestones || []).map((m, i) => ({ ...m, _key: `m_${i}`, _is_duplicate: false }));
        return Response.json({ deliverables: delvs, milestones: miles, extraction_notes: visionResult?.extraction_notes || 'Extracted via vision fallback (image-based PDF).', total_contract_value: visionResult?.total_contract_value || null, currency: visionResult?.currency || 'USD' });
      } catch (visionErr) {
        console.error('[extract] Vision fallback failed:', visionErr.message);
        return Response.json({ deliverables: [], milestones: [], extraction_notes: `PDF text extraction yielded ${extractedText?.length ?? 0} chars. Vision fallback also failed: ${visionErr.message}. PDF may be password-protected or corrupt.`, total_contract_value: null, currency: 'USD' });
      }
    }

    console.log('[extract] Text length:', extractedText.length);
    console.log('[extract] First 600 chars:', extractedText.slice(0, 600));
    console.log('[extract] Contains Annex A:', extractedText.includes('Annex A'));
    console.log('[extract] Contains Annex B:', extractedText.includes('Annex B'));
    console.log('[extract] Contains Project Deliverables:', extractedText.includes('Project Deliverables'));
    console.log('[extract] Contains Objectives:', extractedText.includes('Objectives'));
    console.log('[extract] Contains Disbursement:', extractedText.includes('Disbursement'));
    console.log('[extract] Contains Reporting Requirements:', extractedText.includes('Reporting Requirements'));

    // ── 3. Call LLM with extracted text ─────────────────────────────────────
    const textForLLM = extractedText.length > 120000 ? extractedText.slice(0, 120000) + '\n[TRUNCATED]' : extractedText;
    const prompt = buildLLMPrompt(textForLLM, extract_type, documentLabel, deliverableCategories, milestoneTypes);

    console.log('[extract] Prompt length:', prompt.length, '| Calling claude_sonnet_4_6...');

    let rawLLMResponse;
    try {
      // Use free-text response and parse JSON ourselves — avoids schema constraints causing empty arrays
      rawLLMResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        model: 'claude_sonnet_4_6'
        // No response_json_schema — we parse manually to avoid empty-array truncation
      });
    } catch (llmErr) {
      console.error('[extract] LLM failed:', llmErr.message);
      return Response.json({ deliverables: [], milestones: [], extraction_notes: `LLM call failed: ${llmErr.message}`, total_contract_value: null, currency: 'USD' });
    }

    console.log('[extract] LLM raw response length:', rawLLMResponse?.length ?? 0);
    console.log('[extract] LLM first 300 chars:', typeof rawLLMResponse === 'string' ? rawLLMResponse.slice(0, 300) : JSON.stringify(rawLLMResponse).slice(0, 300));

    // Parse the JSON from LLM response
    let result = {};
    try {
      let jsonStr = typeof rawLLMResponse === 'string' ? rawLLMResponse : JSON.stringify(rawLLMResponse);
      // Strip markdown code fences if present
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[extract] JSON parse failed:', parseErr.message);
      // Try to extract JSON object from the text
      const jsonMatch = (typeof rawLLMResponse === 'string' ? rawLLMResponse : '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { result = JSON.parse(jsonMatch[0]); } catch {}
      }
    }

    console.log('[extract] Parsed deliverables:', result?.deliverables?.length ?? 0, '| milestones:', result?.milestones?.length ?? 0);
    console.log('[extract] extraction_notes:', result?.extraction_notes);

    let finalDeliverables = result?.deliverables || [];
    let finalMilestones = result?.milestones || [];
    let notes = result?.extraction_notes || '';

    // ── 4. Fallback if AI returned empty ────────────────────────────────────
    const needDFb = (extract_type === 'both' || extract_type === 'deliverables') && finalDeliverables.length === 0;
    const needMFb = (extract_type === 'both' || extract_type === 'milestones') && finalMilestones.length === 0;

    if (needDFb || needMFb) {
      console.log('[extract] AI returned empty — running deterministic fallback');
      const fb = fallbackExtract(extractedText, extract_type);
      if (needDFb && fb.deliverables.length > 0) {
        finalDeliverables = fb.deliverables;
        notes += ` | Fallback used: ${fb.deliverables.length} deliverables.`;
      }
      if (needMFb && fb.milestones.length > 0) {
        finalMilestones = fb.milestones;
        notes += ` | Fallback used: ${fb.milestones.length} milestones.`;
      }
    }

    // ── 5. Diagnostic notes if still empty ──────────────────────────────────
    if (finalDeliverables.length === 0 && (extract_type === 'both' || extract_type === 'deliverables')) {
      notes += ` | No deliverables found. Text=${extractedText.length}ch. HasAnnexA=${extractedText.includes('Annex A')}. HasProjDel=${extractedText.includes('Project Deliverables')}.`;
    }
    if (finalMilestones.length === 0 && (extract_type === 'both' || extract_type === 'milestones')) {
      notes += ` | No milestones found. HasReporting=${extractedText.includes('Reporting Requirements')}. HasDisbursement=${extractedText.includes('Disbursement')}.`;
    }

    // ── 6. Duplicate detection ───────────────────────────────────────────────
    const dupD = (a, b) => {
      const t1 = (a.title || '').toLowerCase().slice(0, 60);
      const t2 = (b.name || b.title || '').toLowerCase().slice(0, 60);
      return t1 && t2 && (t1 === t2 || t1.includes(t2.slice(0, 40)) || t2.includes(t1.slice(0, 40)));
    };
    const dupM = (a, b) => {
      const t1 = (a.title || '').toLowerCase().slice(0, 60);
      const t2 = (b.title || '').toLowerCase().slice(0, 60);
      const titleHit = t1 && t2 && (t1 === t2 || t1.includes(t2.slice(0, 40)) || t2.includes(t1.slice(0, 40)));
      const amtHit = a.amount && b.amount && Math.abs(a.amount - b.amount) < 1;
      return titleHit || amtHit;
    };

    const deliverables = finalDeliverables.map((d, i) => ({ ...d, _key: `d_${i}`, _is_duplicate: existing_deliverables.some(e => dupD(d, e)) }));
    const milestones = finalMilestones.map((m, i) => ({ ...m, _key: `m_${i}`, _is_duplicate: existing_milestones.some(e => dupM(m, e)) }));

    console.log('[extract] FINAL deliverables:', deliverables.length, '| milestones:', milestones.length);

    return Response.json({
      deliverables,
      milestones,
      extraction_notes: notes.trim(),
      total_contract_value: result?.total_contract_value || null,
      currency: result?.currency || 'USD'
    });

  } catch (err) {
    console.error('[extract] Unexpected error:', err.message, err.stack);
    return Response.json({ error: err.message }, { status: 500 });
  }
});

// ── Shared prompt builder ──────────────────────────────────────────────────
function buildLLMPrompt(docText, extract_type, documentLabel, deliverableCategories, milestoneTypes) {
  let prompt = `You are an expert contract analyst. Analyze this ${documentLabel} and extract structured data.\n\n`;

  if (docText) {
    prompt += `FULL DOCUMENT TEXT (all pages):\n\`\`\`\n${docText}\n\`\`\`\n\n`;
  } else {
    prompt += `Analyze the attached PDF document.\n\n`;
  }

  if (extract_type === 'both' || extract_type === 'deliverables') {
    prompt += `
═══════════════════════════════════════
DELIVERABLES EXTRACTION
═══════════════════════════════════════

Extract ALL deliverables from the document. Search every section:

- **Annex A | Objectives** — each numbered objective = one deliverable
- **Annex A | Project Deliverables** table — each table row = one deliverable
- Scope of Work, Activities, Outputs, Technical Components
- Reporting obligations (each report type can be a deliverable)
- Any "Tracks", "Sub-components", "Work Streams"

CRITICAL TABLE PARSING:
- If "Project Deliverables" table has 15 rows → extract 15 separate deliverable records.
- If "Objectives" list has 8 items → extract 8 separate deliverable records.
- NEVER merge rows into one record.

Each deliverable JSON object:
{
  "title": "Short title (max 120 chars)",
  "description": "Full description from document",
  "category": one of ${deliverableCategories},
  "source_section": "Exact section name e.g. Annex A | Project Deliverables",
  "due_date": "YYYY-MM-DD or empty string",
  "acceptance_criteria": "",
  "priority": "Medium",
  "confidence": 0-100
}

`;
  }

  if (extract_type === 'both' || extract_type === 'milestones') {
    prompt += `
═══════════════════════════════════════
MILESTONES EXTRACTION
═══════════════════════════════════════

Extract ALL milestones from the document:

- **Reporting Requirements table** → each row = one Reporting milestone
  (Inception Report, Interim Progress Report, Progress Report, Final Report + deadlines)
- **Annex B / Disbursement Schedule table** → each row = one Payment milestone
  (invoice dates, deliverable names, USD amounts)
- Program phases / work plan key dates

CRITICAL: If Reporting table has 7 rows → extract 7 milestones. Disbursement with 7 rows → 7 milestones.

Each milestone JSON object:
{
  "title": "Short title (max 120 chars)",
  "description": "Full description",
  "milestone_type": one of ${milestoneTypes},
  "due_date": "YYYY-MM-DD or empty string",
  "percentage": "20% or empty string",
  "amount": number or null,
  "currency": "USD",
  "acceptance_criteria": "",
  "source_section": "Section name",
  "confidence": 0-100
}

`;
  }

  prompt += `
═══════════════════════════════════════
RESPONSE (STRICT JSON ONLY)
═══════════════════════════════════════

Return ONLY this JSON — no markdown, no code fences:
{
  "deliverables": ${extract_type === 'milestones' ? '[]' : '[...all deliverable objects...]'},
  "milestones": ${extract_type === 'deliverables' ? '[]' : '[...all milestone objects...]'},
  "extraction_notes": "X deliverables from [sections]. Y milestones from [sections].",
  "total_contract_value": number or null,
  "currency": "USD"
}

RULES:
- extract_type="${extract_type}" — only populate the relevant arrays.
- NEVER return empty arrays if the document contains relevant content.
- Just return JSON.
`;

  return prompt;
}