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

function serializeHttpException(exception: HttpException): {
  message: string;
  stack?: string;
} {
  const res = exception.getResponse();
  let message: string;
  if (typeof res === 'string') {
    message = res;
  } else if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    const m = r.message;
    if (Array.isArray(m)) message = m.map(String).join('; ');
    else if (typeof m === 'string') message = m;
    else message = JSON.stringify(res);
  } else {
    message = exception.message;
  }
  return { message, stack: exception.stack };
}

function serializeException(exception: unknown): {
  message: string;
  stack?: string;
} {
  if (exception instanceof HttpException) {
    return serializeHttpException(exception);
  }
  if (exception instanceof Error) {
    return { message: exception.message, stack: exception.stack };
  }
  return { message: String(exception) };
}

/**
 * Логирует HTTP-исключения: для 5xx — error + stack, для 4xx — warn + текст ответа.
 * Сообщение включает req.id, метод, путь и тело ответа клиенту (как в JSON).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      const { message, stack } = serializeException(exception);
      this.logger.error(
        `Unhandled exception (non-HTTP context=${String(host.getType())}): ${message}`,
        stack,
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

    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const messagePayload =
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : { statusCode: status, message: 'Internal server error' };

    const { message: errMessage, stack } = serializeException(exception);
    const reqId =
      request.id ??
      (typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id'].trim().slice(0, 128)
        : undefined) ??
      'n/a';

    const line = [
      `HTTP ${status}`,
      `${request.method} ${request.url}`,
      `reqId=${reqId}`,
      `cause=${errMessage.replace(/\s+/g, ' ').slice(0, 2000)}`,
      `response=${JSON.stringify(messagePayload).slice(0, 4000)}`,
    ].join(' | ');

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(line, stack);
    } else {
      this.logger.warn(line);
    }

    response.status(status).json(messagePayload);
  }
}
