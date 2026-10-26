import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { AssistantService } from './assistant.service';

/**
 * Dashboard assistant.
 *
 * Authenticated, and the service re-derives what the caller may read from
 * their own record — the browser never decides which data reaches the model.
 */
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Each call costs a model request, so it is rate limited per user. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('ask')
  @HttpCode(200)
  ask(
    @Body()
    body: {
      question: string;
      scope?: string;
      history?: Array<{ role: string; text: string }>;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assistant.ask(body ?? ({} as any), user);
  }
}
