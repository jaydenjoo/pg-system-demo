#!/bin/bash
# PCI DSS 외부 감사 증적 자동 수집
# 사용법: bash scripts/collect-evidence.sh
# 출력: reports/evidence/ 디렉토리에 타임스탬프별 증적 파일 생성

set -euo pipefail

EVIDENCE_DIR="reports/evidence"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
REPORT_DIR="$EVIDENCE_DIR/$TIMESTAMP"
mkdir -p "$REPORT_DIR"

echo "=========================================="
echo "  PCI DSS Evidence Collection"
echo "  Timestamp: $TIMESTAMP"
echo "=========================================="
echo ""

# ── 1. 소프트웨어 버전 정보 (PCI DSS 6.3.2) ──
echo "[1/8] 소프트웨어 버전 수집..."
{
  echo "=== Software Versions ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "--- Node.js ---"
  node --version 2>/dev/null || echo "Node.js not found"
  echo ""
  echo "--- pnpm ---"
  pnpm --version 2>/dev/null || echo "pnpm not found"
  echo ""
  echo "--- TypeScript ---"
  npx tsc --version 2>/dev/null || echo "TypeScript not found"
  echo ""
  echo "--- OS ---"
  uname -a
  echo ""
  echo "--- Docker ---"
  docker --version 2>/dev/null || echo "Docker not installed"
  echo ""
  echo "--- Docker Compose ---"
  docker compose version 2>/dev/null || echo "Docker Compose not installed"
} > "$REPORT_DIR/01_software_versions.txt"
echo "  ✅ 01_software_versions.txt"

# ── 2. 의존성 감사 결과 (PCI DSS 6.3.2) ──
echo "[2/8] 의존성 감사 실행..."
{
  echo "=== Dependency Audit ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  pnpm audit 2>&1 || true
} > "$REPORT_DIR/02_dependency_audit.txt"
pnpm audit --json > "$REPORT_DIR/02_dependency_audit.json" 2>/dev/null || true
echo "  ✅ 02_dependency_audit.txt / .json"

# ── 3. TypeScript strict 설정 확인 (PCI DSS 6.2.4) ──
echo "[3/8] TypeScript 설정 수집..."
{
  echo "=== TypeScript Configuration ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "--- tsconfig.base.json ---"
  cat tsconfig.base.json 2>/dev/null || echo "Not found"
  echo ""
  echo "--- apps/api/tsconfig.json ---"
  cat apps/api/tsconfig.json 2>/dev/null || echo "Not found"
  echo ""
  echo "--- apps/web/tsconfig.json ---"
  cat apps/web/tsconfig.json 2>/dev/null || echo "Not found"
  echo ""
  echo "--- Type Check Result ---"
  pnpm run type-check 2>&1 || true
} > "$REPORT_DIR/03_typescript_config.txt"
echo "  ✅ 03_typescript_config.txt"

# ── 4. ESLint 보안 규칙 결과 (PCI DSS 6.2.4) ──
echo "[4/8] ESLint 보안 규칙 검사..."
{
  echo "=== ESLint Security Results ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  pnpm run lint 2>&1 || true
} > "$REPORT_DIR/04_eslint_results.txt"
echo "  ✅ 04_eslint_results.txt"

# ── 5. 테스트 결과 (PCI DSS 6.2.3.1) ──
echo "[5/8] 테스트 실행..."
{
  echo "=== Test Results ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  pnpm run test 2>&1 || true
} > "$REPORT_DIR/05_test_results.txt"
echo "  ✅ 05_test_results.txt"

# ── 6. Docker 설정 (PCI DSS 2.2.1) ──
echo "[6/8] Docker 설정 수집..."
{
  echo "=== Docker Configuration ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "--- apps/api/Dockerfile ---"
  cat apps/api/Dockerfile 2>/dev/null || echo "Not found"
  echo ""
  echo "--- apps/web/Dockerfile ---"
  cat apps/web/Dockerfile 2>/dev/null || echo "Not found"
  echo ""
  echo "--- docker-compose.yml ---"
  cat docker-compose.yml 2>/dev/null || echo "Not found"
  echo ""
  echo "--- Non-root User Check ---"
  echo "API Dockerfile USER:"
  grep -n "^USER" apps/api/Dockerfile 2>/dev/null || echo "  No USER directive found"
  echo "Web Dockerfile USER:"
  grep -n "^USER" apps/web/Dockerfile 2>/dev/null || echo "  No USER directive found"
  echo ""
  echo "--- Healthcheck ---"
  echo "API Dockerfile HEALTHCHECK:"
  grep -A2 "HEALTHCHECK" apps/api/Dockerfile 2>/dev/null || echo "  No HEALTHCHECK found"
  echo "Web Dockerfile HEALTHCHECK:"
  grep -A2 "HEALTHCHECK" apps/web/Dockerfile 2>/dev/null || echo "  No HEALTHCHECK found"
} > "$REPORT_DIR/06_docker_config.txt"
echo "  ✅ 06_docker_config.txt"

# ── 7. 보안 미들웨어 & Nginx 설정 (PCI DSS 6.5) ──
echo "[7/8] 보안 미들웨어 & Nginx 수집..."
{
  echo "=== Security Middleware & Nginx ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "--- Helmet.js (main.ts) ---"
  cat apps/api/src/main.ts 2>/dev/null || echo "Not found"
  echo ""
  echo "--- Nginx Configuration ---"
  cat infra/nginx/nginx.conf 2>/dev/null || echo "Not found"
  echo ""
  echo "--- CSP Directives ---"
  cat apps/web/src/lib/csp-directives.ts 2>/dev/null || echo "Not found"
  echo ""
  echo "--- CSP Nonce ---"
  cat apps/web/src/lib/csp-nonce.ts 2>/dev/null || echo "Not found"
  echo ""
  echo "--- Rate Limiting Configuration ---"
  grep -rn "ThrottlerModule\|Throttle\|throttle" apps/api/src/ --include="*.ts" 2>/dev/null || echo "  No throttle config found"
} > "$REPORT_DIR/07_security_middleware.txt"
echo "  ✅ 07_security_middleware.txt"

# ── 8. 암호화 & KMS 설정 (PCI DSS 3.5.1) ──
echo "[8/8] 암호화 & KMS 설정 수집..."
{
  echo "=== Encryption & KMS Configuration ==="
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "--- KMS Interface ---"
  cat apps/api/src/modules/security/kms/kms.interface.ts 2>/dev/null || echo "Not found"
  echo ""
  echo "--- Local KMS Service (AES-256-GCM) ---"
  cat apps/api/src/modules/security/kms/local-kms.service.ts 2>/dev/null || echo "Not found"
  echo ""
  echo "--- Data Masking Functions ---"
  grep -A10 "maskBankAccount\|maskCardNumber\|maskAccountNumber" packages/shared/src/utils/index.ts 2>/dev/null || echo "  No masking functions found"
  echo ""
  echo "--- Encryption Algorithm Check ---"
  echo "AES-256-GCM usage:"
  grep -n "aes-256-gcm\|AES.*GCM\|createCipheriv\|createDecipheriv" apps/api/src/modules/security/kms/local-kms.service.ts 2>/dev/null || echo "  No AES-256-GCM found"
} > "$REPORT_DIR/08_encryption_kms.txt"
echo "  ✅ 08_encryption_kms.txt"

# ── 요약 리포트 생성 ──
echo ""
echo "=========================================="
echo "  증적 수집 완료"
echo "=========================================="
echo ""
{
  echo "=== PCI DSS Evidence Collection Summary ==="
  echo "Timestamp: $TIMESTAMP"
  echo "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "Files collected:"
  echo "  01_software_versions.txt    — PCI DSS 6.3.2 (소프트웨어 인벤토리)"
  echo "  02_dependency_audit.txt/json — PCI DSS 6.3.2 (의존성 취약점 감사)"
  echo "  03_typescript_config.txt    — PCI DSS 6.2.4 (안전한 개발 설정)"
  echo "  04_eslint_results.txt       — PCI DSS 6.2.4 (정적 분석 결과)"
  echo "  05_test_results.txt         — PCI DSS 6.2.3.1 (테스트 결과)"
  echo "  06_docker_config.txt        — PCI DSS 2.2.1 (시스템 구성)"
  echo "  07_security_middleware.txt   — PCI DSS 6.5 (보안 미들웨어)"
  echo "  08_encryption_kms.txt       — PCI DSS 3.5.1 (암호화 & KMS)"
  echo ""
  echo "Total files: 9"
  echo "Location: $REPORT_DIR/"
} > "$REPORT_DIR/00_summary.txt"
cat "$REPORT_DIR/00_summary.txt"

echo ""
echo "📁 증적 디렉토리: $REPORT_DIR/"
echo "✅ 외부 감사 시 이 디렉토리를 QSA에 제출하세요."
