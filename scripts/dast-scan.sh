#!/bin/bash
# PCI DSS 6.3.2 / Step 7 DAST 권고사항 이행
# OWASP ZAP Baseline Scan

set -euo pipefail

TARGET_URL="${1:-http://localhost:4000}"
REPORT_DIR="reports/dast"
mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")

echo "Starting OWASP ZAP Baseline Scan against $TARGET_URL"

docker run --rm \
  --network host \
  -v "$(pwd)/$REPORT_DIR:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:2.16.0 \
  zap-baseline.py \
  -t "$TARGET_URL" \
  -r "zap-report_${TIMESTAMP}.html" \
  -J "zap-report_${TIMESTAMP}.json" \
  -l WARN \
  --auto

echo "DAST report saved to $REPORT_DIR/zap-report_${TIMESTAMP}.html"
