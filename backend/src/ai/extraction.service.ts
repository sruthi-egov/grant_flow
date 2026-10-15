import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import type { AuthenticatedUser } from '../common/decorators';
import { AiService } from './ai.service';
import { PdfTextService } from './pdf-text.service';
import {
  buildContactsPrompt,
  buildDeliverablesAndMilestonesPrompt,
  buildMouPrompt,
  buildMsaClausesPrompt,
  buildMsaServicesPrompt,
  buildTranchesPrompt,
} from './prompts';

export class ScannedPdfError extends BadRequestException {
  constructor(pageCount: number, charCount: number) {
    super({
      error: 'pdf_has_no_text_layer',
      message:
        `This PDF has no extractable text layer (${pageCount} page(s), only ${charCount} characters found). ` +
        'It is almost certainly a scan or an image-only export. OCR is not configured in this deployment, ' +
        'so no data was extracted. Use a text-based PDF, or enter the details manually.',
      page_count: pageCount,
      char_count: charCount,
      ocr_available: false,
    });
  }
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly ai: AiService,
    private readonly pdf: PdfTextService,
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolves a `/api/files/<id>/download` URL to PDF text.
   * Throws loudly when the document has no text layer — the UI shows that
   * message rather than an empty, apparently-successful result.
   */
  private async textFromUrl(pdfUrl: string): Promise<string> {
    const fileId = FilesService.idFromUrl(pdfUrl);
    if (!fileId) {
      throw new BadRequestException({
        error: 'unsupported_file_url',
        message:
          `"${pdfUrl}" is not a document stored in this system. ` +
          'Re-upload the PDF — URLs from the old Base44 host are no longer reachable.',
      });
    }

    const { buffer, mime } = await this.files.readBuffer(fileId);
    if (mime !== 'application/pdf') {
      throw new BadRequestException({
        error: 'not_a_pdf',
        message: `Extraction supports PDF files only; this file is ${mime}.`,
      });
    }

    const result = await this.pdf.extract(buffer);
    if (result.isLikelyScanned) {
      throw new ScannedPdfError(result.pageCount, result.charCount);
    }

    this.logger.log(
      `Extracted ${result.charCount} chars from ${result.pageCount} pages (file ${fileId})`,
    );
    return this.pdf.truncate(result.text, this.config.get<number>('ai.maxInputChars')!);
  }

  private async audit(
    actionType: string,
    entityType: string,
    entityId: string | undefined,
    user: AuthenticatedUser,
    description: string,
    status: 'success' | 'warning' | 'error' = 'success',
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          action_type: actionType,
          entity_type: entityType,
          entity_id: entityId ?? null,
          user_email: user.email,
          user_name: user.display_name ?? user.full_name ?? user.email,
          description,
          status,
        },
      })
      .catch(() => undefined);
  }

  /** Port of `extractDeliverablesAndMilestones`. */
  async deliverablesAndMilestones(
    body: {
      pdf_url: string;
      parent_type: string;
      parent_id: string;
      extract_type?: 'both' | 'deliverables' | 'milestones';
      existing_deliverables?: any[];
      existing_milestones?: any[];
    },
    user: AuthenticatedUser,
  ) {
    const extractType = body.extract_type ?? 'both';
    if (!body.pdf_url) throw new BadRequestException('pdf_url is required');
    if (!body.parent_type || !body.parent_id) {
      throw new BadRequestException('parent_type and parent_id are required');
    }

    const text = await this.textFromUrl(body.pdf_url);
    const { data } = await this.ai.completeJson<any>({
      prompt: buildDeliverablesAndMilestonesPrompt(text, extractType, body.parent_type),
    });

    const deliverables = (data.deliverables ?? []).map((d: any, i: number) => ({
      ...d,
      _key: `d_${i}`,
      _is_duplicate: this.isDuplicateByTitle(d.title, body.existing_deliverables ?? [], ['name', 'title']),
    }));
    const milestones = (data.milestones ?? []).map((m: any, i: number) => ({
      ...m,
      _key: `m_${i}`,
      _is_duplicate:
        this.isDuplicateByTitle(m.title, body.existing_milestones ?? [], ['title']) ||
        this.isDuplicateByAmount(m.amount, body.existing_milestones ?? []),
    }));

    await this.audit(
      'extraction_completed',
      body.parent_type,
      body.parent_id,
      user,
      `Extracted ${deliverables.length} deliverables and ${milestones.length} milestones`,
      deliverables.length + milestones.length > 0 ? 'success' : 'warning',
    );

    return {
      deliverables,
      milestones,
      extraction_notes: this.notesFor(data.extraction_notes, deliverables.length + milestones.length),
      total_contract_value: data.total_contract_value ?? null,
      currency: data.currency ?? 'USD',
      extraction_method: 'ai_text_extraction',
    };
  }

  /** Port of `extractGrantTranches`. */
  async grantTranches(
    body: { pdf_url: string; grant_id: string; existing_tranches?: any[] },
    user: AuthenticatedUser,
  ) {
    if (!body.pdf_url) throw new BadRequestException('pdf_url is required');
    if (!body.grant_id) throw new BadRequestException('grant_id is required');

    const text = await this.textFromUrl(body.pdf_url);
    const { data } = await this.ai.completeJson<any>({ prompt: buildTranchesPrompt(text) });

    const tranches = (data.tranches ?? []).map((t: any, i: number) => ({
      ...t,
      _key: `t_${i}`,
      _is_duplicate:
        this.isDuplicateByTitle(t.tranche_name, body.existing_tranches ?? [], ['tranche_name']) ||
        this.isDuplicateByAmount(t.amount, body.existing_tranches ?? []),
    }));

    await this.audit(
      'tranche_extraction_completed',
      'Grant',
      body.grant_id,
      user,
      `Extracted ${tranches.length} tranches from PDF`,
      tranches.length > 0 ? 'success' : 'warning',
    );

    return {
      tranches,
      extraction_notes:
        data.extraction_notes ||
        (tranches.length === 0
          ? 'No tranche/payment/disbursement schedule was detected in this PDF. The payment terms may be described in narrative form. Please use manual entry.'
          : ''),
      total_contract_value: data.total_contract_value ?? null,
      currency: data.currency ?? 'USD',
      extraction_method: 'ai_text_extraction',
    };
  }

  /** Port of `extractGrantContacts`. */
  async grantContacts(
    body: { pdf_url: string; parent_id?: string; existing_contacts?: any[] },
    user: AuthenticatedUser,
  ) {
    if (!body.pdf_url) throw new BadRequestException('pdf_url is required');

    const existing = body.existing_contacts ?? [];
    const text = await this.textFromUrl(body.pdf_url);
    const { data } = await this.ai.completeJson<any>({
      prompt: buildContactsPrompt(text, existing),
    });

    const existingEmails = new Set(
      existing.map((c: any) => (c.email ?? '').toLowerCase().trim()).filter(Boolean),
    );
    const existingNames = new Set(
      existing
        .map((c: any) => `${(c.name ?? '').toLowerCase()}|${(c.organization ?? '').toLowerCase()}`)
        .filter((s: string) => s !== '|'),
    );

    const contacts = (data.contacts ?? []).map((c: any) => ({
      ...c,
      possible_duplicate:
        Boolean(c.email && existingEmails.has(String(c.email).toLowerCase().trim())) ||
        Boolean(
          c.name &&
            existingNames.has(
              `${String(c.name).toLowerCase()}|${String(c.organization ?? '').toLowerCase()}`,
            ),
        ),
    }));

    await this.audit(
      'contact_extraction_completed',
      'Grant',
      body.parent_id,
      user,
      `Extracted ${contacts.length} contacts from PDF`,
      contacts.length > 0 ? 'success' : 'warning',
    );

    return {
      contacts,
      extraction_notes: this.notesFor(data.extraction_notes, contacts.length),
      total_found: contacts.length,
      extraction_method: 'ai_text_extraction',
    };
  }

  /** Port of `extractMsaServicesAndKeyClauses`. */
  async msaServicesAndClauses(
    body: { pdf_url: string; msa_id?: string; extract_type?: 'services' | 'key_clauses' | 'both' },
    user: AuthenticatedUser,
  ) {
    if (!body.pdf_url) throw new BadRequestException('pdf_url is required');
    const extractType = body.extract_type ?? 'both';

    const text = await this.textFromUrl(body.pdf_url);

    const wantServices = extractType === 'services' || extractType === 'both';
    const wantClauses = extractType === 'key_clauses' || extractType === 'both';

    const [services, clauses] = await Promise.all([
      wantServices
        ? this.ai.completeJson<any>({ prompt: buildMsaServicesPrompt(text) })
        : Promise.resolve(null),
      wantClauses
        ? this.ai.completeJson<any>({ prompt: buildMsaClausesPrompt(text) })
        : Promise.resolve(null),
    ]);

    const structured_services = services?.data?.structured_services ?? [];
    const key_clauses = (clauses?.data?.key_clauses ?? []).map((c: any, i: number) => ({
      ...c,
      _key: `c_${i}`,
    }));

    await this.audit(
      'msa_extraction_completed',
      'MSA',
      body.msa_id,
      user,
      `Extracted ${structured_services.length} services and ${key_clauses.length} key clauses`,
      structured_services.length + key_clauses.length > 0 ? 'success' : 'warning',
    );

    return {
      success: true,
      structured_services,
      key_clauses,
      extraction_notes: this.notesFor(
        clauses?.data?.extraction_notes ?? services?.data?.extraction_notes,
        structured_services.length + key_clauses.length,
      ),
      extraction_method: 'ai_text_extraction',
    };
  }

  /** Port of `extractMouAll`. */
  async mouAll(
    body: {
      pdf_url: string;
      mou_id?: string;
      extract_type?: 'all' | 'commitments' | 'deliverables' | 'milestones' | 'contacts' | 'key_clauses';
    },
    user: AuthenticatedUser,
  ) {
    if (!body.pdf_url) throw new BadRequestException('pdf_url is required');
    const extractType = body.extract_type ?? 'all';

    const text = await this.textFromUrl(body.pdf_url);
    const { data } = await this.ai.completeJson<any>({
      prompt: buildMouPrompt(text, extractType),
      maxTokens: 12000,
    });

    const result = {
      success: true,
      commitments: data.commitments ?? [],
      deliverables: data.deliverables ?? [],
      milestones: data.milestones ?? [],
      contacts: data.contacts ?? [],
      key_clauses: data.key_clauses ?? [],
      extraction_notes: data.extraction_notes ?? '',
      extraction_method: 'ai_text_extraction',
    };

    const total =
      result.commitments.length +
      result.deliverables.length +
      result.milestones.length +
      result.contacts.length +
      result.key_clauses.length;

    result.extraction_notes = this.notesFor(result.extraction_notes, total);

    await this.audit(
      'mou_extraction_completed',
      'MOU',
      body.mou_id,
      user,
      `Extracted ${total} items from MoU PDF`,
      total > 0 ? 'success' : 'warning',
    );

    return result;
  }

  /**
   * Generic replacement for `base44.integrations.Core.InvokeLLM`.
   * Used by the uploader components for document classification and
   * raw-text validation.
   */
  async invokeLlm(
    body: { prompt: string; file_urls?: string[]; response_json_schema?: any },
    _user: AuthenticatedUser,
  ) {
    if (!body?.prompt) throw new BadRequestException('prompt is required');

    let prompt = body.prompt;

    if (body.file_urls?.length) {
      const texts: string[] = [];
      for (const url of body.file_urls) {
        texts.push(await this.textFromUrl(url));
      }
      prompt = `${prompt}\n\nDOCUMENT CONTENT:\n\`\`\`\n${texts.join('\n\n')}\n\`\`\``;
    }

    if (body.response_json_schema) {
      prompt += `\n\nReturn JSON matching exactly this schema:\n${JSON.stringify(
        body.response_json_schema,
      )}`;
    }

    const { data } = await this.ai.completeJson<any>({ prompt });
    return data;
  }

  /**
   * Fast path for the uploader's "extract all raw text" call — no model needed,
   * which makes upload validation work even without an API key.
   */
  async extractRawText(pdfUrl: string): Promise<{ extracted_text: string; page_count: number }> {
    const fileId = FilesService.idFromUrl(pdfUrl);
    if (!fileId) {
      throw new BadRequestException({
        error: 'unsupported_file_url',
        message: `"${pdfUrl}" is not a document stored in this system.`,
      });
    }
    const { buffer, mime } = await this.files.readBuffer(fileId);
    if (mime !== 'application/pdf') {
      return { extracted_text: '', page_count: 0 };
    }
    const result = await this.pdf.extract(buffer);
    if (result.isLikelyScanned) {
      throw new ScannedPdfError(result.pageCount, result.charCount);
    }
    return { extracted_text: result.text, page_count: result.pageCount };
  }

  /** Makes a zero-result extraction explicit instead of silently "successful". */
  private notesFor(notes: string | undefined, count: number): string {
    const base = (notes ?? '').trim();
    if (count > 0) return base;
    const warning =
      'No items were found in this document. The extraction ran successfully but matched nothing — ' +
      'check that the PDF contains the expected sections, or enter the details manually.';
    return base ? `${base} | ${warning}` : warning;
  }

  private isDuplicateByTitle(title: string | undefined, existing: any[], fields: string[]): boolean {
    const a = (title ?? '').toLowerCase().slice(0, 60);
    if (!a) return false;
    return existing.some((e) => {
      for (const f of fields) {
        const b = (e?.[f] ?? '').toLowerCase().slice(0, 60);
        if (b && (a === b || a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40)))) return true;
      }
      return false;
    });
  }

  private isDuplicateByAmount(amount: unknown, existing: any[]): boolean {
    if (typeof amount !== 'number') return false;
    return existing.some(
      (e) => typeof e?.amount === 'number' && Math.abs(e.amount - amount) < 1,
    );
  }
}
