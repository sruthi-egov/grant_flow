import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pdf_url, mou_id, extract_type = 'all', existing_items = [] } = body;

    if (!pdf_url) return Response.json({ error: 'No PDF URL provided. Please upload a MoU PDF first.' }, { status: 400 });
    if (!mou_id) return Response.json({ error: 'MoU ID is required.' }, { status: 400 });

    const startTime = Date.now();

    // ---------------------------------------------------------------
    // Step 1: Fetch PDF bytes and pass as file_url to LLM with vision
    // The LLM will use visual page extraction for scanned PDFs.
    // ---------------------------------------------------------------
    const prompt = buildPrompt(extract_type);

    let extractionResult;
    let scanned_pdf_detected = false;
    let ocr_used = false;
    let extractionError = null;

    try {
      // Use InvokeLLM with file_urls — this handles both text-based and scanned/image PDFs
      // via vision model, effectively providing OCR for scanned documents.
      const llmResult = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [pdf_url],
        model: 'gpt_5_4',
        response_json_schema: buildSchema(extract_type),
      });

      extractionResult = llmResult;
      // If commitments/deliverables returned are very few or extraction_notes mentions "scanned"
      if (extractionResult?.extraction_notes?.toLowerCase().includes('scanned') ||
          extractionResult?.extraction_notes?.toLowerCase().includes('image-based') ||
          extractionResult?.extraction_notes?.toLowerCase().includes('ocr')) {
        scanned_pdf_detected = true;
        ocr_used = true;
      }
    } catch (e) {
      extractionError = e.message;
      // Fallback: try with internet context disabled and gemini
      try {
        const fallback = await base44.integrations.Core.InvokeLLM({
          prompt,
          file_urls: [pdf_url],
          model: 'claude_sonnet_4_6',
          response_json_schema: buildSchema(extract_type),
        });
        extractionResult = fallback;
        scanned_pdf_detected = true;
        ocr_used = true;
      } catch (e2) {
        return Response.json({
          error: `Extraction failed: ${extractionError}. Fallback also failed: ${e2.message}`,
          success: false,
        }, { status: 500 });
      }
    }

    if (!extractionResult) {
      return Response.json({ error: 'No extraction result returned from AI.', success: false }, { status: 500 });
    }

    const processingTime = Date.now() - startTime;

    // Enrich items with duplicate detection
    const commitments = deduplicateCommitments(extractionResult.commitments || [], existing_items.commitments || []);
    const deliverables = deduplicateItems(extractionResult.deliverables || [], existing_items.deliverables || [], 'title');
    const milestones = deduplicateItems(extractionResult.milestones || [], existing_items.milestones || [], 'title');
    const contacts = deduplicateContacts(extractionResult.contacts || [], existing_items.contacts || []);
    const key_clauses = deduplicateClauses(extractionResult.key_clauses || [], existing_items.key_clauses || []);

    const notes = [
      extractionResult.extraction_notes || '',
      scanned_pdf_detected ? 'Scanned PDF detected. OCR/visual extraction was used.' : '',
      `Processing time: ${(processingTime / 1000).toFixed(1)}s`,
    ].filter(Boolean).join(' | ');

    return Response.json({
      success: true,
      commitments,
      deliverables,
      milestones,
      contacts,
      key_clauses,
      extraction_notes: notes,
      scanned_pdf_detected,
      ocr_used,
      source_document_id: pdf_url,
      processing_time_ms: processingTime,
    });
  } catch (err) {
    return Response.json({ error: err.message, success: false }, { status: 500 });
  }
});

function buildPrompt(extract_type) {
  const base = `You are an expert MoU (Memorandum of Understanding) analyst. Carefully read ALL pages of the provided PDF document. 
This document may be a scanned/image-based PDF. Extract content visually from each page even if no selectable text exists.
The document is an MoU between two parties (e.g. eGovernments Foundation and DPI Centre Limited or similar).

Return ONLY valid JSON matching the exact schema provided. Do not truncate arrays. Extract ALL items found.
If you detect this is a scanned document, note "Scanned PDF detected. OCR/visual extraction was used." in extraction_notes.
`;

  if (extract_type === 'commitments') return base + `
Extract ALL commitments, obligations, and responsibilities from sections like:
- General Responsibilities, Mutual Roles and Responsibilities, Monitoring/Evaluation/Reporting, Term and Termination, Confidentiality, Notice, Assignment, Financial terms.
For each commitment extract: title (concise), description (full sentence), commitment_type, responsible_party, source_section, source_clause, source_page (if visible), confidence (0-100).
`;

  if (extract_type === 'deliverables') return base + `
Extract ALL deliverables, outputs, activities, and strategic goals. Look in: Annexure I Terms of Reference, Strategic Goals, Key Areas, Platform Services, Purpose sections.
For each deliverable: title (concise), description, category (Strategic/Technical/Reporting/Governance/Capacity Building/Documentation/Partnership/Other), responsible_party, target_date, source_section, confidence (0-100).
`;

  if (extract_type === 'milestones') return base + `
Extract ALL time-bound milestones, dates, terms, targets, and deadlines. Look for: effective dates, term lengths, notice periods, reporting frequencies, strategic numeric targets, confidentiality survival periods.
For each milestone: title, description, milestone_type (Effective Date/Term Expiry/Reporting/Strategic Target/Termination/Confidentiality/Notice/Other), due_date (YYYY-MM-DD if known), frequency, target_value (e.g. "30 countries", "6 lighthouse"), source_section, confidence (0-100).
`;

  if (extract_type === 'contacts') return base + `
Extract ALL contact details including notice contacts, signatories, and named persons from Notice clauses, Signature blocks, and party definitions.
For each contact: name, organization, role (signatory/notice contact/representative), email, phone, address, designation, signing_date (YYYY-MM-DD), source_section.
`;

  if (extract_type === 'key_clauses') return base + `
Extract ALL key legal clauses by their clause numbers and titles. For each clause: clause_number, clause_title, summary (2-3 sentences), clause_type (Commercial/Legal/Operational/Compliance/Risk/Other), obligation_owner (Vendor/Client/Both), risk_level (Low/Medium/High), source_section, confidence (0-100).
`;

  // all
  return base + `
Extract ALL of the following in one pass:
1. COMMITMENTS: All obligations and responsibilities (General Responsibilities, Mutual Roles, Confidentiality, Notice, Term/Termination, Reporting).
2. DELIVERABLES: All outputs, activities, strategic goals (Annexure I, Purpose, Platform Services, Key Areas).
3. MILESTONES: All dates, terms, notice periods, strategic targets, reporting frequencies.
4. CONTACTS: All notice contacts and signatories.
5. KEY_CLAUSES: All numbered/titled clauses with summaries.
Extract comprehensively. Do not leave arrays empty unless truly nothing is found.
`;
}

function buildSchema(extract_type) {
  const commitmentSchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        commitment_type: { type: 'string' },
        responsible_party: { type: 'string' },
        source_section: { type: 'string' },
        source_clause: { type: 'string' },
        source_page: { type: 'string' },
        confidence: { type: 'number' },
        notes: { type: 'string' },
      }
    }
  };
  const deliverableSchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        responsible_party: { type: 'string' },
        target_date: { type: 'string' },
        source_section: { type: 'string' },
        confidence: { type: 'number' },
      }
    }
  };
  const milestoneSchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        milestone_type: { type: 'string' },
        due_date: { type: 'string' },
        frequency: { type: 'string' },
        target_value: { type: 'string' },
        source_section: { type: 'string' },
        confidence: { type: 'number' },
      }
    }
  };
  const contactSchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        organization: { type: 'string' },
        role: { type: 'string' },
        designation: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        signing_date: { type: 'string' },
        source_section: { type: 'string' },
      }
    }
  };
  const clauseSchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        clause_number: { type: 'string' },
        clause_title: { type: 'string' },
        summary: { type: 'string' },
        clause_type: { type: 'string' },
        obligation_owner: { type: 'string' },
        risk_level: { type: 'string' },
        source_section: { type: 'string' },
        confidence: { type: 'number' },
      }
    }
  };

  if (extract_type === 'commitments') return { type: 'object', properties: { commitments: commitmentSchema, extraction_notes: { type: 'string' } } };
  if (extract_type === 'deliverables') return { type: 'object', properties: { deliverables: deliverableSchema, extraction_notes: { type: 'string' } } };
  if (extract_type === 'milestones') return { type: 'object', properties: { milestones: milestoneSchema, extraction_notes: { type: 'string' } } };
  if (extract_type === 'contacts') return { type: 'object', properties: { contacts: contactSchema, extraction_notes: { type: 'string' } } };
  if (extract_type === 'key_clauses') return { type: 'object', properties: { key_clauses: clauseSchema, extraction_notes: { type: 'string' } } };

  return {
    type: 'object',
    properties: {
      commitments: commitmentSchema,
      deliverables: deliverableSchema,
      milestones: milestoneSchema,
      contacts: contactSchema,
      key_clauses: clauseSchema,
      extraction_notes: { type: 'string' },
    }
  };
}

function deduplicateCommitments(extracted, existing) {
  return extracted.map(item => ({
    ...item,
    _is_duplicate: existing.some(e =>
      e.name?.toLowerCase().trim() === item.title?.toLowerCase().trim() ||
      (e.source_clause && e.source_clause === item.source_clause)
    )
  }));
}

function deduplicateItems(extracted, existing, titleField) {
  return extracted.map(item => ({
    ...item,
    _is_duplicate: existing.some(e => {
      const eTitle = (e.name || e.title || '').toLowerCase().trim();
      const iTitle = (item.title || '').toLowerCase().trim();
      return eTitle && iTitle && (eTitle === iTitle || eTitle.includes(iTitle.substring(0, 30)));
    })
  }));
}

function deduplicateContacts(extracted, existing) {
  return extracted.map(item => ({
    ...item,
    _is_duplicate: existing.some(e =>
      (e.email && e.email === item.email) ||
      (e.name?.toLowerCase() === item.name?.toLowerCase() && e.organization?.toLowerCase() === item.organization?.toLowerCase())
    )
  }));
}

function deduplicateClauses(extracted, existing) {
  return extracted.map(item => ({
    ...item,
    _is_duplicate: existing.some(e =>
      (e.clause_number && e.clause_number === item.clause_number) ||
      (e.clause_title?.toLowerCase().trim() === item.clause_title?.toLowerCase().trim())
    )
  }));
}