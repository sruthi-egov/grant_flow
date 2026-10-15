/**
 * Prompts ported from the Base44 Deno backend functions in
 * docs/base44-legacy-reference/functions/. Wording is kept close to the
 * originals so extraction quality matches what the client already validated.
 */

const JSON_ONLY = `
Return ONLY a single valid JSON object. No markdown, no code fences, no commentary.
If the document genuinely contains none of the requested items, return the empty
arrays and explain why in "extraction_notes". Never invent values that are not
present in the document.`;

function withDocument(docText: string): string {
  return docText
    ? `FULL DOCUMENT TEXT (all pages, with "--- PAGE n ---" markers):\n\`\`\`\n${docText}\n\`\`\`\n\n`
    : '';
}

/** Port of `extractDeliverablesAndMilestones`. */
export function buildDeliverablesAndMilestonesPrompt(
  docText: string,
  extractType: 'both' | 'deliverables' | 'milestones',
  parentType: string,
): string {
  const isSow = parentType === 'sow';
  const isMou = parentType === 'mou' || parentType === 'msa';
  const documentLabel = isSow
    ? 'Statement of Work (SoW)'
    : isMou
      ? 'MOU / MOA / Agreement'
      : 'Grant Agreement / MOA';

  const deliverableCategories = isSow
    ? '["Technical","Documentation","Support","Training","Configuration","Deployment","Reporting","Other"]'
    : '["Program","Financial","Reporting","Compliance","Documentation","Technical","Other"]';

  const milestoneTypes = isSow
    ? '["Payment","Delivery","Review","Release","Support","Documentation","Other"]'
    : '["Payment","Reporting","Program","Compliance","Audit","Review","Other"]';

  let prompt = `You are an expert contract analyst. Analyze this ${documentLabel} and extract structured data.\n\n`;
  prompt += withDocument(docText);

  if (extractType === 'both' || extractType === 'deliverables') {
    prompt += `
═══════════════════════════════════════
DELIVERABLES EXTRACTION
═══════════════════════════════════════

Extract ALL deliverables. Search every section:
- Annex A | Objectives — each numbered objective = one deliverable
- Annex A | Project Deliverables table — each table row = one deliverable
- Scope of Work, Activities, Outputs, Technical Components
- Reporting obligations (each report type can be a deliverable)
- Any "Tracks", "Sub-components", "Work Streams"

CRITICAL TABLE PARSING:
- If a "Project Deliverables" table has 15 rows → extract 15 separate records.
- If an "Objectives" list has 8 items → extract 8 separate records.
- NEVER merge rows into one record.

Each deliverable object:
{
  "title": "Short title (max 120 chars)",
  "description": "Full description from the document",
  "category": one of ${deliverableCategories},
  "source_section": "Exact section name, e.g. Annex A | Project Deliverables",
  "due_date": "YYYY-MM-DD or empty string",
  "acceptance_criteria": "",
  "priority": "Medium",
  "confidence": 0-100
}
`;
  }

  if (extractType === 'both' || extractType === 'milestones') {
    prompt += `
═══════════════════════════════════════
MILESTONES EXTRACTION
═══════════════════════════════════════

Extract ALL milestones:
- Reporting Requirements table → each row = one Reporting milestone
- Annex B / Disbursement Schedule table → each row = one Payment milestone
- Program phases / work plan key dates

CRITICAL: a Reporting table with 7 rows yields 7 milestones.

Each milestone object:
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
RESPONSE
═══════════════════════════════════════
{
  "deliverables": ${extractType === 'milestones' ? '[]' : '[ ...deliverable objects... ]'},
  "milestones": ${extractType === 'deliverables' ? '[]' : '[ ...milestone objects... ]'},
  "extraction_notes": "X deliverables from [sections]. Y milestones from [sections].",
  "total_contract_value": number or null,
  "currency": "USD"
}
${JSON_ONLY}`;

  return prompt;
}

/** Port of `extractGrantTranches`. */
export function buildTranchesPrompt(docText: string): string {
  return `You are an expert grant contract analyst specializing in financial schedules. Analyze this grant agreement and extract ALL payment/disbursement/tranche/invoice schedule entries.

${withDocument(docText)}
═══════════════════════════════════════
TRANCHE / PAYMENT SCHEDULE EXTRACTION
═══════════════════════════════════════

Search EVERY section for payment or disbursement information:
- Tranches / Tranche Schedule
- Disbursement Schedule / Fund Disbursement
- Payment Schedule / Payment Terms / Payment Milestones
- Invoice Schedule / Invoice Date table
- Budget and Disbursement Details, Annex B
- Funding Schedule / Fund Release Schedule
- Grant Payment / Installment / Instalment
- Allocation of Funds / Budget Details, Consideration / Financial Terms
- Any table with columns like: Invoice Date | Deliverable | Amount | Due Date | Percentage

CRITICAL TABLE PARSING RULES:
- A table with 5 payment rows yields 5 tranche records. NEVER merge rows.
- A "tranche" may be called payment, disbursement, installment, milestone payment,
  invoice, grant release, funding tranche or budget line.
- Do NOT rely only on the word "tranche".

FIELD RULES:
- tranche_name: name/description of the payment
- amount: numeric only, no symbols or commas (e.g. 100499.00)
- currency: ISO code; default "USD" when $ is used
- invoice_trigger_date: when the invoice should be raised. If the document says
  "upon contract execution", leave empty and describe it in trigger_condition.
- due_date: YYYY-MM-DD
- trigger_condition: what triggers this payment
- percentage: if expressed as a % of total
- source_section / source_page: where it was found (use the PAGE markers)
- confidence: 0-100

DATE RULES: convert to YYYY-MM-DD ("31 March 2025" → "2025-03-31"). If the date
is a condition rather than a date, leave it empty and use trigger_condition.

AMOUNT RULES: "$100,499.00" → 100499.00 / "USD". If only a percentage is given
with no total, set amount to null and fill percentage.

STATUS: default "pending" unless the document confirms the payment was received.

═══════════════════════════════════════
RESPONSE
═══════════════════════════════════════
{
  "tranches": [
    {
      "tranche_name": "string (required)",
      "amount": number or null,
      "currency": "USD",
      "invoice_trigger_date": "YYYY-MM-DD or empty string",
      "due_date": "YYYY-MM-DD or empty string",
      "trigger_condition": "",
      "percentage": "",
      "status": "pending",
      "source_section": "",
      "source_page": "",
      "confidence": 0-100,
      "notes": ""
    }
  ],
  "extraction_notes": "",
  "total_contract_value": number or null,
  "currency": "USD"
}
${JSON_ONLY}`;
}

/** Port of `extractGrantContacts`. */
export function buildContactsPrompt(docText: string, existingContacts: any[]): string {
  const existingStr = existingContacts?.length
    ? `\n\nExisting contacts already saved (use these to detect duplicates):\n${JSON.stringify(
        existingContacts.map((c) => ({
          name: c.name,
          email: c.email,
          organization: c.organization,
        })),
        null,
        2,
      )}`
    : '';

  return `You are an expert at extracting contact information from grant agreements and legal documents.

${withDocument(docText)}
Extract ALL contacts, including from:
- Notice / Notices sections
- Contact Details sections
- Authorized Representatives / Signatories
- Signature blocks ("Signed by", "For and on behalf of")
- Party details
- Project Manager / Grant Manager / Program Manager
- Finance Contact / Invoice Contact
- Reporting Contact / Legal Contact
- Communication / Address sections
- Annexures with contact info

Contacts often appear near the END of the agreement, in notice sections,
signature pages and annexures. Extract every unique person or functional
contact — email-only contacts like "finance@org.org" are valid.

For each contact extract:
- name: full name; if only an email prefix exists, derive a reasonable name
  ("contractsdepartment@org.org" → "Contracts Department"); otherwise use the
  organization name or "Contact"
- email, phone (with country code if present)
- role_title: job title or role
- organization
- contact_type: one of [Signatory, Notice Contact, Finance Contact, Reporting
  Contact, Grant Manager, Project Manager, Legal Contact, Organization Contact,
  Other] — may combine with " / "
- address, source_section, confidence (0.0–1.0), notes

RULES:
- Do NOT skip contacts because phone is missing.
- Do NOT skip contacts that are only an email address.
- Extract signatories from signature blocks.
- Return an empty contacts array ONLY if the document truly contains zero
  contact details, emails or phone numbers.
${existingStr}

RESPONSE:
{
  "contacts": [
    { "name": "", "email": "", "phone": "", "role_title": "", "organization": "",
      "contact_type": "", "address": "", "source_section": "", "confidence": 0.9, "notes": "" }
  ],
  "extraction_notes": "Summary of what was found and any issues",
  "total_found": 0
}
${JSON_ONLY}`;
}

/** Port of `extractMsaServicesAndKeyClauses` — services half. */
export function buildMsaServicesPrompt(docText: string): string {
  return `You are a contract analyst. Read this entire MSA document and extract the scope of services.

${withDocument(docText)}
Find all service categories under headings like "Services", "Scope of Services",
"Schedule A", "Annex", "Exhibit", or similar.

Each item:
- service_category: name (e.g. "Research and Development")
- description: 1-3 sentences max
- bullet_points: array of sub-activity strings, or []
- responsibility: "Vendor", "Client", "Both", or "—"
- limitations_or_notes: exclusions or notes, or ""
- source_section: heading name
- source_clause: clause number or ""

RESPONSE: { "structured_services": [ ... ], "extraction_notes": "" }
${JSON_ONLY}`;
}

/** Port of `extractMsaServicesAndKeyClauses` — key clauses half. */
export function buildMsaClausesPrompt(docText: string): string {
  return `You are a senior legal contract analyst. Read this ENTIRE MSA document from start to finish including all pages, schedules and annexures.

${withDocument(docText)}
Extract ALL important clauses. Look for: Payment Terms, Invoice Terms, Fees,
Taxes, Term, Renewal, Termination, Notice Period, Confidentiality, Intellectual
Property, Data Protection, Warranties, Limitation of Liability, Indemnity,
Dispute Resolution, Governing Law, Arbitration, Force Majeure, Assignment,
Compliance, Audit Rights, Notices, Service Levels.

IMPORTANT: key clauses often appear on later pages — read all of them.

Aim for 8-20 clauses. Each item:
- clause_title: descriptive title
- clause_type: one of "Commercial", "Legal", "Operational", "Compliance", "Risk"
- clause_number: section number from the document, or ""
- summary: 2-4 plain-English sentences on what it says and its business impact
- full_text: verbatim or near-verbatim clause text
- risk_level: "Low", "Medium" or "High"
- obligation_owner: "Vendor", "Client", "Both" or "—"
- notice_period_days: days as a string (e.g. "30") or ""
- amount_or_cap: monetary amount or ""
- source_section: section heading
- confidence: 0-100

RESPONSE: { "key_clauses": [ ... ], "extraction_notes": "brief note" }
${JSON_ONLY}`;
}

/** Port of `extractMouAll`. */
export function buildMouPrompt(
  docText: string,
  extractType: 'all' | 'commitments' | 'deliverables' | 'milestones' | 'contacts' | 'key_clauses',
): string {
  const base = `You are an expert MoU (Memorandum of Understanding) analyst. Carefully read ALL pages of the document.

${withDocument(docText)}
Extract ALL items found. Do not truncate arrays.
`;

  const sections: Record<string, string> = {
    commitments: `
Extract ALL commitments, obligations and responsibilities from sections like
General Responsibilities, Mutual Roles and Responsibilities, Monitoring /
Evaluation / Reporting, Term and Termination, Confidentiality, Notice,
Assignment and Financial terms.
Each: title, description, commitment_type, responsible_party, source_section,
source_clause, source_page, confidence (0-100), notes.`,

    deliverables: `
Extract ALL deliverables, outputs, activities and strategic goals. Look in
Annexure I Terms of Reference, Strategic Goals, Key Areas, Platform Services
and Purpose sections.
Each: title, description, category, responsible_party, target_date,
source_section, confidence (0-100).`,

    milestones: `
Extract ALL time-bound milestones, dates, terms, targets and deadlines:
effective dates, term lengths, notice periods, reporting frequencies, strategic
numeric targets, confidentiality survival periods.
Each: title, description, milestone_type, due_date (YYYY-MM-DD if known),
frequency, target_value, source_section, confidence (0-100).`,

    contacts: `
Extract ALL contact details including notice contacts, signatories and named
persons from Notice clauses, signature blocks and party definitions.
Each: name, organization, role, designation, email, phone, address,
signing_date (YYYY-MM-DD), source_section.`,

    key_clauses: `
Extract ALL key legal clauses by clause number and title.
Each: clause_number, clause_title, summary (2-3 sentences), clause_type,
obligation_owner, risk_level, source_section, confidence (0-100).`,
  };

  if (extractType !== 'all') {
    return `${base}${sections[extractType]}

RESPONSE: { "${extractType}": [ ... ], "extraction_notes": "" }
${JSON_ONLY}`;
  }

  return `${base}
Extract ALL of the following in one pass:
1. COMMITMENTS${sections.commitments}
2. DELIVERABLES${sections.deliverables}
3. MILESTONES${sections.milestones}
4. CONTACTS${sections.contacts}
5. KEY_CLAUSES${sections.key_clauses}

RESPONSE:
{
  "commitments": [...], "deliverables": [...], "milestones": [...],
  "contacts": [...], "key_clauses": [...], "extraction_notes": ""
}
${JSON_ONLY}`;
}
