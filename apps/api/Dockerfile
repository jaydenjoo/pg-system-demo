# ── Stage 1: base ──
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

# ── Stage 2: builder ──
FROM base AS builder

# Prisma가 OpenSSL 버전을 올바르게 감지하도록 설치
RUN apk add --no-cache openssl

# 의존성 캐시 레이어 (lockfile + workspace 설정만 먼저 복사)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/

RUN pnpm --filter @pg-system/shared build
RUN pnpm --filter @pg-system/api exec prisma generate
RUN pnpm --filter @pg-system/api build

# ── Stage 3: runner ──
FROM node:20-alpine AS runner

# Prisma 엔진 실행에 필요한 OpenSSL 런타임 라이브러리
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

ENV NODE_ENV=production

# pnpm symlink 구조 유지: apps/api/node_modules → ../../../../node_modules/.pnpm/...
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

USER nestjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health || exit 1

# Prisma migration 자동 실행 후 앱 시작
CMD ["sh", "-c", "apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
