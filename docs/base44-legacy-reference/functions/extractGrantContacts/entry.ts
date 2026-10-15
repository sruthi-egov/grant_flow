import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pdf_url, parent_id, existing_contacts = [] } = await req.json();
    if (!pdf_url) return Response.json({ error: 'pdf_url is required' }, { status: 400 });

    const existingStr = existing_contacts.length > 0
      ? `\n\nExisting contacts already saved (use these to detect duplicates):\n${JSON.stringify(existing_contacts.map(c => ({ name: c.name, email: c.email, organization: c.organization })), null, 2)}`
      : '';

    const prompt = `You are an expert at extracting contact information from grant agreement PDFs and legal documents.

Extract ALL contacts from the following document, including but not limited to:
- Notice/Notices sections
- Contact Details sections
- Authorized Representatives / Signatories
- Signature blocks ("Signed by", "For and on behalf of")
- Party details
- Project Manager / Grant Manager / Program Manager
- Finance Contact / Invoice Contact
- Reporting Contact / Legal Contact
- Communication/Address sections
- Annexures with contact info

Read the FULL document carefully. Contacts often appear near the END of the agreement in notice sections, signature pages, and annexures.

Extract every unique person or functional contact (email-only contacts like "finance@org.org" are valid contacts too).

For each contact extract:
- name: Full name if available; if only an email prefix is available, derive a reasonable name from it (e.g. "contractsdepartment@org.org" → "Contracts Department"); otherwise use the organization name or "Contact"
- email: email address
- phone: phone number including country code if present
- role_title: job title or role (e.g. "Director", "Finance Contact", "Contracts Manager")
- organization: organization or company name
- contact_type: one of [Signatory, Notice Contact, Finance Contact, Reporting Contact, Grant Manager, Project Manager, Legal Contact, Organization Contact, Other] — can be multiple separated by " / "
- address: physical address if mentioned near this contact
- source_section: which section of the document this was found in (e.g. "Notices", "Signature Block", "Party Details")
- confidence: 0.0–1.0 — how confident you are this is a real contact record
- notes: any extra context

IMPORTANT rules:
- Do NOT skip contacts just because phone is missing.
- Do NOT skip contacts that are only an email address.
- Extract signatories from signature blocks.
- Extract from ALL sections of the document.
- If an email like "finance@domain.org" exists without a name, still create a contact with name inferred from prefix.
- Return an empty contacts array ONLY if there are truly zero contact details, emails, or phone numbers in the entire document.
${existingStr}

Return JSON in this exact format:
{
  "contacts": [
    {
      "name": "",
      "email": "",
      "phone": "",
      "role_title": "",
      "organization": "",
      "contact_type": "",
      "address": "",
      "source_section": "",
      "confidence": 0.9,
      "notes": ""
    }
  ],
  "extraction_notes": "Summary of what was found and any issues",
  "total_found": 0
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [pdf_url],
      response_json_schema: {
        type: "object",
        properties: {
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                role_title: { type: "string" },
                organization: { type: "string" },
                contact_type: { type: "string" },
                address: { type: "string" },
                source_section: { type: "string" },
                confidence: { type: "number" },
                notes: { type: "string" }
              }
            }
          },
          extraction_notes: { type: "string" },
          total_found: { type: "number" }
        }
      }
    });

    // Mark duplicates
    const existingEmails = new Set(existing_contacts.map(c => (c.email || '').toLowerCase().trim()).filter(Boolean));
    const existingNames = new Set(existing_contacts.map(c => `${(c.name || '').toLowerCase()}|${(c.organization || '').toLowerCase()}`).filter(s => s !== '|'));

    const contacts = (result.contacts || []).map(c => {
      const emailMatch = c.email && existingEmails.has(c.email.toLowerCase().trim());
      const nameOrgMatch = c.name && existingNames.has(`${c.name.toLowerCase()}|${(c.organization || '').toLowerCase()}`);
      return { ...c, possible_duplicate: emailMatch || nameOrgMatch };
    });

    // Log audit
    if (parent_id) {
      await base44.asServiceRole.entities.AuditLog.create({
        action_type: "contact_extraction_completed",
        entity_type: "Grant",
        entity_id: parent_id,
        user_email: user.email,
        user_name: user.full_name,
        description: `Extracted ${contacts.length} contacts from PDF`,
        status: "success"
      });
    }

    return Response.json({ contacts, extraction_notes: result.extraction_notes || '', total_found: contacts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});