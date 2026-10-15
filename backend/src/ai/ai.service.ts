import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export class AiNotConfiguredError extends ServiceUnavailableException {
  constructor() {
    super({
      error: 'ai_not_configured',
      message:
        'AI document extraction is not configured. Set OPENAI_API_KEY in the backend environment and restart. ' +
        'All other features work without it.',
      feature: 'document-extraction',
    });
  }
}

export interface LlmCallResult<T = any> {
  data: T;
  model: string;
  /** Always 'openai' here — a simulated path would be labelled explicitly. */
  provider: 'openai';
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Thin wrapper over the OpenAI Chat Completions API.
 *
 * The API key lives only in the backend process: the browser never receives it
 * and never calls a model provider directly (on Base44 the UI called
 * `InvokeLLM` from client code).
 *
 * This service never invents output. If the key is missing it throws
 * AiNotConfiguredError; if the model fails or returns unparseable JSON it
 * throws — callers surface the error rather than substituting empty results.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  get isEnabled(): boolean {
    return this.config.get<boolean>('ai.enabled') === true;
  }

  get status() {
    return {
      enabled: this.isEnabled,
      provider: 'openai',
      model: this.config.get<string>('ai.model'),
      note: this.isEnabled
        ? 'Document extraction is available.'
        : 'OPENAI_API_KEY is not set — document extraction endpoints will return 503. Every other feature is unaffected.',
    };
  }

  private getClient(): OpenAI {
    if (!this.isEnabled) throw new AiNotConfiguredError();
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.get<string>('ai.apiKey')!,
        baseURL: this.config.get<string>('ai.baseUrl') || undefined,
      });
    }
    return this.client;
  }

  /**
   * Runs a prompt and returns parsed JSON.
   * Uses JSON response mode so the model cannot wrap output in prose.
   */
  async completeJson<T = any>(options: {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
  }): Promise<LlmCallResult<T>> {
    const client = this.getClient();
    const model = this.config.get<string>('ai.model')!;

    const system =
      options.systemPrompt ??
      'You are a precise contract-analysis assistant. Respond with a single valid JSON object and nothing else. ' +
        'Never invent facts: if the document does not contain a value, use an empty string or null.';

    let response;
    try {
      response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: options.prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: options.maxTokens ?? 8000,
      });
    } catch (error: any) {
      const detail = error?.message ?? String(error);
      this.logger.error(`OpenAI request failed: ${detail}`);
      throw new ServiceUnavailableException({
        error: 'ai_request_failed',
        message: `The AI provider rejected or failed the request: ${detail}`,
      });
    }

    const content = response.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
      throw new ServiceUnavailableException({
        error: 'ai_empty_response',
        message: 'The AI provider returned an empty response. Nothing was extracted.',
      });
    }

    const data = this.parseJson<T>(content);

    return {
      data,
      model,
      provider: 'openai',
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
      },
    };
  }

  /** Tolerates a stray code fence, but never fabricates a result. */
  private parseJson<T>(content: string): T {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          /* fall through */
        }
      }
      this.logger.error(`Unparseable model output (first 300 chars): ${cleaned.slice(0, 300)}`);
      throw new ServiceUnavailableException({
        error: 'ai_invalid_json',
        message:
          'The AI provider returned output that was not valid JSON. The extraction was not applied.',
      });
    }
  }
}
