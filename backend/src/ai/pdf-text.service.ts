import { Injectable, Logger } from '@nestjs/common';

// Import the library entry point directly: `require('pdf-parse')` runs a debug
// block that tries to read a bundled sample PDF and crashes outside its repo.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

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

/** Below this, a PDF of any real length is treated as having no text layer. */
const MIN_USEFUL_CHARS = 200;

@Injectable()
export class PdfTextService {
  private readonly logger = new Logger(PdfTextService.name);

  /**
   * Extracts text from a PDF, preserving the `--- PAGE n ---` markers the
   * original Base44 prompts relied on for source-page attribution.
   */
  async extract(buffer: Buffer): Promise<PdfTextResult> {
    let raw = '';
    let pageCount = 0;
    const pages: string[] = [];

    try {
      const parsed = await pdfParse(buffer, {
        // Called once per page; lets us rebuild per-page text with markers.
        pagerender: async (pageData: any) => {
          const content = await pageData.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false,
          });
          const text = content.items.map((i: any) => i.str).join(' ');
          pages.push(text);
          return text;
        },
      });
      raw = parsed.text ?? '';
      pageCount = parsed.numpages ?? pages.length;
    } catch (error: any) {
      this.logger.warn(`pdf-parse failed: ${error?.message ?? error}`);
      throw new Error(
        `Could not read this PDF: ${error?.message ?? 'unknown parser error'}. ` +
          'The file may be corrupt, password-protected, or not a PDF.',
      );
    }

    const text = pages.length
      ? pages.map((p, i) => `\n\n--- PAGE ${i + 1} ---\n${p}`).join('')
      : raw;

    const charCount = text.trim().length;

    return {
      text,
      pageCount,
      charCount,
      isLikelyScanned: charCount < MIN_USEFUL_CHARS,
    };
  }

  /** Truncates to the model's input budget, marking the cut explicitly. */
  truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n[TRUNCATED — document continues beyond ${maxChars} characters]`;
  }
}
