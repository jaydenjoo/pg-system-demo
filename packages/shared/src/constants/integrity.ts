// ============================================================
// PG System — 파일 무결성 모니터링(FIM) 상수
// PCI DSS 11.6.1 준수
// ============================================================

export const INTEGRITY_MONITOR = {
  ALGORITHM: 'sha256' as const,
  CHECK_INTERVAL_MS: 3_600_000, // 1시간 (프로덕션)
  CRITICAL_PATHS: [
    'apps/api/dist/main.js',
    'apps/api/prisma/schema.prisma',
    'apps/web/.next/BUILD_ID',
    'infra/nginx/nginx.conf',
    'docker-compose.yml',
  ] as const,
  HIGH_PATHS: [
    'apps/api/dist/**/*.js',
    'packages/shared/dist/**/*.js',
  ] as const,
  MEDIUM_PATHS: [
    '.github/workflows/*.yml',
    'tsconfig.base.json',
  ] as const,
  MAX_FILE_SIZE_BYTES: 50_000_000, // 50MB
} as const;
