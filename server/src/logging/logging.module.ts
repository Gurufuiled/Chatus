import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';

/**
 * Pino + pino-http: JSON в проде, читаемые строки в разработке.
 * Логи HTTP автоматически; у каждого запроса есть req.id (или X-Request-Id с клиента).
 */
export function buildPinoParams(): Params {
  const isProd = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');

  const pinoHttp: PinoHttpOptions = {
    level,
    genReqId: (req, _res) => {
      const raw = req.headers['x-request-id'];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim().slice(0, 128);
      }
      return randomUUID();
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[Redacted]',
    },
  };

  if (!isProd) {
    pinoHttp.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };
  }

  return { pinoHttp };
}

/** Тот же инстанс, что в imports — иначе Nest не реэкспортит провайдеры из forRoot (в т.ч. PinoLogger:*). */
const pinoLoggerModule = LoggerModule.forRoot(buildPinoParams());

@Module({
  imports: [pinoLoggerModule],
  exports: [pinoLoggerModule],
})
export class LoggingModule {}
