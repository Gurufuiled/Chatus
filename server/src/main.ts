import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'path';
import { AppModule } from './app.module';
import { SnakeCaseInterceptor } from './common';

/** Публичный JSON для мобильного клиента (обновления APK). Обходит 404 на raw GitHub для приватных репозиториев. */
function resolveClientUpdateManifestPath(): string | null {
  const candidates = [
    join(process.cwd(), 'client-update-manifest.json'),
    join(process.cwd(), 'config', 'client-update-manifest.json'),
    join(process.cwd(), '..', 'config', 'client-update-manifest.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/client-update-manifest.json', (_req, res) => {
    const manifestPath = resolveClientUpdateManifestPath();
    if (!manifestPath) {
      res.status(404).type('text/plain').send('client-update-manifest.json not found on server');
      return;
    }
    try {
      const body = readFileSync(manifestPath, 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.send(body);
    } catch {
      res.status(500).type('text/plain').send('Error reading manifest');
    }
  });

  app.setGlobalPrefix('api');
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new SnakeCaseInterceptor());
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
