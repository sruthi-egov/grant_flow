import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { AiService } from './ai.service';
import { ExtractionService } from './extraction.service';

/**
 * Replaces the Base44 `functions.invoke(...)` calls and
 * `integrations.Core.InvokeLLM` with first-party endpoints.
 *
 * Every route requires authentication, and the model credential stays on the
 * server — the browser never talks to a model provider.
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly extraction: ExtractionService,
  ) {}

  /** Lets the UI tell "not configured" apart from "failed". */
  @Get('ai/status')
  status() {
    return this.ai.status;
  }

  @Post('ai/invoke')
  @HttpCode(200)
  invoke(
    @Body() body: { prompt: string; file_urls?: string[]; response_json_schema?: any },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.extraction.invokeLlm(body, user);
  }

  /** Pure text extraction — works without an AI key. */
  @Post('ai/pdf-text')
  @HttpCode(200)
  pdfText(@Body() body: { pdf_url: string }) {
    return this.extraction.extractRawText(body?.pdf_url);
  }

  // ── Ported Base44 backend functions ────────────────────────────────────────

  @Post('extraction/extractDeliverablesAndMilestones')
  @HttpCode(200)
  deliverablesAndMilestones(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.extraction.deliverablesAndMilestones(body, user);
  }

  @Post('extraction/extractGrantTranches')
  @HttpCode(200)
  grantTranches(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.extraction.grantTranches(body, user);
  }

  @Post('extraction/extractGrantContacts')
  @HttpCode(200)
  grantContacts(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.extraction.grantContacts(body, user);
  }

  @Post('extraction/extractMsaServicesAndKeyClauses')
  @HttpCode(200)
  msaServices(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.extraction.msaServicesAndClauses(body, user);
  }

  @Post('extraction/extractMouAll')
  @HttpCode(200)
  mouAll(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.extraction.mouAll(body, user);
  }
}
