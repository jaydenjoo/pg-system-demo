#!/bin/bash
# PCI DSS 6.3.2 — Software Bill of Materials 생성
# 의존성 트리를 pnpm JSON 형식으로 출력 (의존성 목록 + 감사 + 라이선스)

set -euo pipefail

SBOM_DIR="reports/sbom"
mkdir -p "$SBOM_DIR"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")

# pnpm list로 전체 의존성 트리 생성
pnpm list --json --depth=Infinity > "$SBOM_DIR/dependency-tree_${TIMESTAMP}.json"

# pnpm audit 결과 저장
pnpm audit --json > "$SBOM_DIR/audit-report_${TIMESTAMP}.json" || true

# 라이선스 정보 수집
pnpm licenses list --json > "$SBOM_DIR/licenses_${TIMESTAMP}.json" || true

echo "SBOM generated at $SBOM_DIR"
echo "Timestamp: $TIMESTAMP"
