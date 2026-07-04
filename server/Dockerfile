# NestJS API + Prisma (HTTP 4000, WS 4001, signaling 4002)
# Собирать из корня репозитория: docker compose в каталоге server/ (context: ..).
FROM node:22-bookworm-slim

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CI=1

RUN apt-get update -y \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates gosu \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma/

RUN npm ci \
  && rm -rf /root/.cache/ms-playwright /root/.cache/playwright

COPY server/tsconfig.json server/tsconfig.build.json server/nest-cli.json ./
COPY server/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh
COPY server/src ./src/
COPY server/public ./public/
COPY config/client-update-manifest.json ./client-update-manifest.json

RUN npx prisma generate && npm run build

RUN chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000 4001 4002

USER node

# Prisma CLI остаётся из devDependencies — нужен для migrate deploy при старте контейнера
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
