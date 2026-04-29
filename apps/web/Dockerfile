# ── Stage 1: base ──
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

# ── Stage 2: builder ──
FROM base AS builder

# 의존성 캐시 레이어
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/

RUN pnpm --filter @pg-system/shared build

# public 폴더 없을 경우 빈 디렉터리 생성 (COPY 단계 오류 방지)
RUN mkdir -p apps/web/public

ENV NEXT_TELEMETRY_DISABLED=1
ARG INTERNAL_API_URL=http://api:4000
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
RUN pnpm --filter @pg-system/web build

# ── Stage 3: runner ──
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone 출력물 복사 (monorepo 구조: standalone/apps/web/server.js)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
