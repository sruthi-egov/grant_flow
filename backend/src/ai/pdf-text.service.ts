import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * `unpdf` is ESM-only, while this service compiles to CommonJS. A plain
 * `await import('unpdf')` would be downlevelled by TypeScript into `require()`,
 * which throws ERR_REQUIRE_ESM at runtime. Building the import through
 * `new Function` keeps a genuine dynamic ESM import in the emitted JavaScript.
 */
const importEsm: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)',
) as any;

export interface PdfTextResult {
  text: string;
  pageCount: number;
  charCount: number;
  /**
   * True when the PDF carries no usable text layer — almost always a scan.
   * Callers must surface this instead of pretending extraction succeeded.
   */
  isLikelyScanned: boolean;
}

/**
 * Thresholds for "this PDF has no text layer".
 *
 * A scanned document yields essentially zero extractable characters, so the
 * bar is set low deliberately. The original Base44 function used `< 200`, but
 * it could fall back to a vision model; here a false positive blocks the user
 * outright, so a short-but-genuine document must not be misclassified.
 */
const MIN_TOTAL_CHARS = 50;
const MIN_CHARS_PER_PAGE = 15;

@Injectable()
export class PdfTextService {
  private readonly logger = new Logger(PdfTextService.name);
  private unpdf: any = null;

  private async lib(): Promise<any> {
    if (!this.unpdf) this.unpdf = await importEsm('unpdf');
    return this.unpdf;
  }

  /**
   * Extracts text from a PDF, preserving the `--- PAGE n ---` markers the
   * extraction prompts rely on for source-page attribution.
   *
   * Uses `unpdf` (a maintained pdf.js build), which is what the original
   * Base44 backend function used too.
   */
  async extract(buffer: Buffer): Promise<PdfTextResult> {
    const { getDocumentProxy, extractText } = await this.lib();

    let pages: string[] = [];
    let pageCount = 0;

    try {
      const document = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(document, { mergePages: false });
      pages = Array.isArray(result.text) ? result.text.map((t: unknown) => String(t ?? '')) : [String(result.text ?? '')];
      pageCount = result.totalPages ?? pages.length;
    } catch (error: any) {
      // A malformed upload is the caller's problem, not a server fault —
      // report it as 400 with the parser's reason rather than a bare 500.
      this.logger.warn(`PDF parsing failed: ${error?.message ?? error}`);
      throw new BadRequestException({
        error: 'pdf_unreadable',
        message:
          `Could not read this PDF: ${error?.message ?? 'unknown parser error'}. ` +
          'The file may be corrupt, password-protected, or not a valid PDF.',
      });
    }

    const text = pages.map((p, i) => `\n\n--- PAGE ${i + 1} ---\n${p}`).join('');
    const charCount = pages.join('').trim().length;
    const perPage = pageCount > 0 ? charCount / pageCount : charCount;

    return {
      text,
      pageCount,
      charCount,
      isLikelyScanned: charCount < MIN_TOTAL_CHARS || perPage < MIN_CHARS_PER_PAGE,
    };
  }

  /** Truncates to the model's input budget, marking the cut explicitly. */
  truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n[TRUNCATED — document continues beyond ${maxChars} characters]`;
  }
}
