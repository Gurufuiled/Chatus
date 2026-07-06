import 'dotenv/config';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'path';
import express = require('express');
import type { Response } from 'express';
import { AppModule } from './app.module';
import { SnakeCaseInterceptor } from './common';

/** CSP for ChatUs embed iframe — must match Loginus embedded_apps registration */
const EMBED_FRAME_ANCESTORS_CSP = 'frame-ancestors https://id.startapus.com';

function setEmbedSecurityHeaders(res: Response) {
  res.setHeader('Content-Security-Policy', EMBED_FRAME_ANCESTORS_CSP);
  // Parent iframe must also set allow="microphone"; this enables getUserMedia in /embed.
  res.setHeader('Permissions-Policy', 'microphone=(self)');
}

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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  // rawBody: true disables the default JSON parser unless re-registered via useBodyParser.
  // Must include application/json (mobile auth, API) and application/webhook+json (LiveKit).
  app.useBodyParser('json', {
    type: ['application/json', 'application/webhook+json'],
  });
  app.useLogger(app.get(Logger));
  app.useWebSocketAdapter(new WsAdapter(app));

  const expressApp = app.getHttpAdapter().getInstance();
  const publicDir = join(process.cwd(), 'public');
  const indexPath = join(publicDir, 'index.html');
  const apkPath = join(publicDir, 'downloads', 'chatus-release.apk');
  const apkNotFoundPath = join(publicDir, 'downloads', 'apk-not-found.html');
  const privacyPolicyPath = join(publicDir, 'privacy-policy.html');

  expressApp.get('/', (_req, res) => {
    if (!existsSync(indexPath)) {
      res.status(404).type('text/plain').send('index.html not found');
      return;
    }
    try {
      const body = readFileSync(indexPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(body);
    } catch {
      res.status(500).type('text/plain').send('Error reading landing page');
    }
  });

  expressApp.get('/download', (_req, res) => {
    res.redirect(302, '/downloads/chatus-release.apk');
  });

  expressApp.get('/downloads/chatus-release.apk', (_req, res) => {
    if (!existsSync(apkPath)) {
      if (existsSync(apkNotFoundPath)) {
        try {
          const body = readFileSync(apkNotFoundPath, 'utf8');
          res.status(404);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(body);
          return;
        } catch {
          /* fall through */
        }
      }
      res.status(404);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send('<p>APK not deployed yet. <a href="/">Home</a></p>');
      return;
    }
    const apkStat = statSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="chatus-release.apk"');
    res.setHeader('Last-Modified', apkStat.mtime.toUTCString());
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(apkPath);
  });

  expressApp.get('/privacy-policy', (_req, res) => {
    if (!existsSync(privacyPolicyPath)) {
      res.status(404).type('text/plain').send('privacy-policy.html not found');
      return;
    }
    try {
      const body = readFileSync(privacyPolicyPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(body);
    } catch {
      res.status(500).type('text/plain').send('Error reading privacy policy');
    }
  });

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

  const embedDir = join(publicDir, 'embed');
  const embedIndexPath = join(embedDir, 'index.html');

  expressApp.use('/embed', (_req, res, next) => {
    setEmbedSecurityHeaders(res);
    next();
  });

  expressApp.use(
    '/embed',
    express.static(embedDir, {
      index: false,
      maxAge: '1h',
    }),
  );

  // Express 5 path-to-regexp: named wildcard (*path), not bare /*
  expressApp.get(['/embed', '/embed/*path'], (_req, res) => {
    if (!existsSync(embedIndexPath)) {
      res
        .status(404)
        .type('text/plain')
        .send('Embed app not deployed. Build web/ and copy dist to public/embed/');
      return;
    }
    setEmbedSecurityHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(embedIndexPath);
  });

  const standaloneAppDir = join(publicDir, 'app');
  const standaloneAppIndexPath = join(standaloneAppDir, 'app.html');

  function setStandaloneAppHeaders(res: Response) {
    res.setHeader('Permissions-Policy', 'microphone=(self)');
  }

  expressApp.use('/app', (_req, res, next) => {
    setStandaloneAppHeaders(res);
    next();
  });

  expressApp.use(
    '/app',
    express.static(standaloneAppDir, {
      index: false,
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json');
        }
      },
    }),
  );

  expressApp.get(['/app', '/app/*path'], (_req, res) => {
    if (!existsSync(standaloneAppIndexPath)) {
      res
        .status(404)
        .type('text/plain')
        .send('Standalone app not deployed. Run npm run build:app in web/');
      return;
    }
    setStandaloneAppHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(standaloneAppIndexPath);
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
