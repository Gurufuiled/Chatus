# NestJS API + Prisma (HTTP 4000, WS 4001, signaling 4002)
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/

RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000 4001 4002

# Prisma CLI остаётся из devDependencies — нужен для migrate deploy при старте контейнера
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
