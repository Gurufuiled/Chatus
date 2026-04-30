import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ReqWithId = Request & { id?: string };

/**
 * Логирует все необработанные HTTP-исключения со стеком и контекстом запроса.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error(
        { err: exception },
        `Unhandled exception (context=${String(host.getType())})`,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<ReqWithId>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const messagePayload =
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : { statusCode: status, message: 'Internal server error' };

    this.logger.error(
      {
        err: exception,
        reqId: request.id,
        method: request.method,
        path: request.url,
        statusCode: status,
      },
      `HTTP ${status} ${request.method} ${request.url}`,
    );

    response.status(status).json(messagePayload);
  }
}
