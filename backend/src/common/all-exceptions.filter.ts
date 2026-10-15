import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Single error shape for the whole API.
 *
 * Unexpected errors are logged with their stack but reported to the client as a
 * generic message — internal details (SQL, file paths, library internals) never
 * reach the browser.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: Record<string, any> = {
      error: 'internal_error',
      message: 'An unexpected error occurred. Check the backend logs for details.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        payload = { error: exception.name, message: body };
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, any>;
        payload = {
          error: obj.error ?? exception.name,
          // class-validator returns `message` as an array of failures.
          message: Array.isArray(obj.message) ? obj.message.join('; ') : (obj.message ?? exception.message),
          ...obj,
        };
        if (Array.isArray(obj.message)) payload.details = obj.message;
      }
    } else {
      this.logger.error(
        `Unhandled ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status}: ${payload.message}`);
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }
}
