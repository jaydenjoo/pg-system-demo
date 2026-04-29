#!/usr/bin/env zsh
# ============================================================
# PG System — 결제 전체 플로우 E2E 테스트 (로컬 실행용)
# 실행: zsh scripts/e2e-payment-test.sh
# 요구사항: curl, jq (brew install jq)
# ============================================================
set -eo pipefail

BASE="http://localhost"
API="$BASE/api/v1"
PG="$BASE/pg/v1"
MERCHANT_ID="2bc7dff9-70db-4538-9284-1eebad102470"

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

pass() { echo -e "  ${GREEN}✅ PASS${NC} — $1"; }
fail() { echo -e "  ${RED}❌ FAIL${NC} — $1"; echo -e "  ${RED}$2${NC}"; exit 1; }
step() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BOLD}[$1] $2${NC}"; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║   PG System — 결제 E2E 테스트            ║"
echo "║   결제 요청 → 승인 → 조회 → 취소          ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ──────────────────────────────────────────
# Step 1: 관리자 로그인
# ──────────────────────────────────────────
step "1/11" "관리자 로그인 (JWT 토큰 발급)"

LOGIN_RES=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"loginId":"admin","password":"admin1234!"}')

TOKEN=$(echo "$LOGIN_RES" | jq -r '.data.accessToken // empty')
MFA_TOKEN=$(echo "$LOGIN_RES" | jq -r '.data.mfaToken // empty')

# MFA 토큰이 있으면 MFA 단계가 필요하다는 뜻
if [ -n "$MFA_TOKEN" ] && [ "$MFA_TOKEN" != "null" ]; then
  echo -e "  ${YELLOW}⚠️  MFA 인증 필요 — TOTP 코드를 입력하세요${NC}"
  echo -n "  TOTP 코드 (6자리): "
  read -r TOTP_CODE

  MFA_RES=$(curl -s -X POST "$API/auth/mfa/verify" \
    -H "Content-Type: application/json" \
    -d "{\"mfaToken\":\"$MFA_TOKEN\",\"totpCode\":\"$TOTP_CODE\"}")

  TOKEN=$(echo "$MFA_RES" | jq -r '.data.accessToken // empty')
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    fail "MFA 인증 실패" "$MFA_RES"
  fi
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  fail "로그인 실패" "$LOGIN_RES"
fi
pass "JWT 토큰 발급 완료 (${TOKEN:0:20}...)"

# ──────────────────────────────────────────
# Step 2: API 키 발급
# ──────────────────────────────────────────
step "2/11" "가맹점 API 키 발급 (관리자 → 가맹점)"

APIKEY_RES=$(curl -s -X POST "$PG/api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"merchantId\":\"$MERCHANT_ID\"}")

CLIENT_KEY=$(echo "$APIKEY_RES" | jq -r '.data.clientKey // empty')
SECRET_KEY=$(echo "$APIKEY_RES" | jq -r '.data.secretKey // empty')

if [ -z "$SECRET_KEY" ] || [ "$SECRET_KEY" = "null" ]; then
  fail "API 키 발급 실패" "$APIKEY_RES"
fi
pass "clientKey=${CLIENT_KEY:0:20}..."
echo -e "  ${YELLOW}📌 secretKey는 이 1회만 표시됩니다${NC}"
echo -e "  secretKey=${SECRET_KEY:0:20}..."

# Basic Auth 헤더 생성 (Toss Payments 방식: secretKey만, 콜론 포함)
BASIC_AUTH=$(echo -n "${SECRET_KEY}:" | base64)
AUTH_HEADER="Basic $BASIC_AUTH"

# ──────────────────────────────────────────
# Step 3: 결제 요청 (주문 생성)
# ──────────────────────────────────────────
step "3/11" "결제 요청 — 50,000원 카드 결제"

ORDER_ID="ORDER-$(date +%s)"
PAYMENT_RES=$(curl -s -X POST "$PG/payments" \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH_HEADER" \
  -d "{
    \"orderId\": \"$ORDER_ID\",
    \"amount\": 50000,
    \"orderName\": \"아메리카노 외 2건\",
    \"paymentMethod\": \"CARD\",
    \"customerName\": \"홍길동\",
    \"customerEmail\": \"hong@example.com\"
  }")

PAYMENT_KEY=$(echo "$PAYMENT_RES" | jq -r '.data.paymentKey // empty')
PAY_STATUS=$(echo "$PAYMENT_RES" | jq -r '.data.status // empty')

if [ -z "$PAYMENT_KEY" ] || [ "$PAYMENT_KEY" = "null" ]; then
  fail "결제 요청 실패" "$PAYMENT_RES"
fi
if [ "$PAY_STATUS" != "READY" ]; then
  fail "상태가 READY가 아님: $PAY_STATUS" "$PAYMENT_RES"
fi
pass "paymentKey=$PAYMENT_KEY / status=READY / 50,000원"

# ──────────────────────────────────────────
# Step 4: 결제 승인 확정
# ──────────────────────────────────────────
step "4/11" "결제 승인 확정 (카드사 승인 시뮬레이션)"

CONFIRM_RES=$(curl -s -X POST "$PG/payments/confirm" \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH_HEADER" \
  -d "{
    \"paymentKey\": \"$PAYMENT_KEY\",
    \"orderId\": \"$ORDER_ID\",
    \"amount\": 50000
  }")

CONFIRM_STATUS=$(echo "$CONFIRM_RES" | jq -r '.data.status // empty')
APPROVE_NO=$(echo "$CONFIRM_RES" | jq -r '.data.card.approveNo // empty')
CARD_NUMBER=$(echo "$CONFIRM_RES" | jq -r '.data.card.number // empty')

if [ "$CONFIRM_STATUS" != "DONE" ]; then
  fail "승인 실패 — 상태: $CONFIRM_STATUS" "$CONFIRM_RES"
fi
pass "승인 완료 — status=DONE / 카드=${CARD_NUMBER} / 승인번호=${APPROVE_NO}"

# ──────────────────────────────────────────
# Step 5: paymentKey로 결제 조회
# ──────────────────────────────────────────
step "5/11" "결제 조회 (paymentKey)"

QUERY1_RES=$(curl -s -X GET "$PG/payments/$PAYMENT_KEY" \
  -H "Authorization: $AUTH_HEADER")

Q1_STATUS=$(echo "$QUERY1_RES" | jq -r '.data.status // empty')
Q1_AMOUNT=$(echo "$QUERY1_RES" | jq -r '.data.amount // empty')

if [ "$Q1_STATUS" != "DONE" ]; then
  fail "조회 실패" "$QUERY1_RES"
fi
pass "status=$Q1_STATUS / amount=$Q1_AMOUNT"

# ──────────────────────────────────────────
# Step 6: orderId로 결제 조회
# ──────────────────────────────────────────
step "6/11" "결제 조회 (orderId)"

QUERY2_RES=$(curl -s -X GET "$PG/payments/orders/$ORDER_ID" \
  -H "Authorization: $AUTH_HEADER")

Q2_STATUS=$(echo "$QUERY2_RES" | jq -r '.data.status // empty')

if [ "$Q2_STATUS" != "DONE" ]; then
  fail "주문번호 조회 실패" "$QUERY2_RES"
fi
pass "orderId=$ORDER_ID → status=$Q2_STATUS"

# ──────────────────────────────────────────
# Step 7: 결제 취소
# ──────────────────────────────────────────
step "7/11" "결제 취소 (전액 환불)"

CANCEL_RES=$(curl -s -X POST "$PG/payments/$PAYMENT_KEY/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH_HEADER" \
  -d '{"cancelReason": "고객 변심"}')

CANCEL_STATUS=$(echo "$CANCEL_RES" | jq -r '.data.status // empty')

if [ "$CANCEL_STATUS" != "CANCELED" ]; then
  fail "취소 실패 — 상태: $CANCEL_STATUS" "$CANCEL_RES"
fi
pass "전액 취소 완료 — status=CANCELED"

# ──────────────────────────────────────────
# Step 8: 취소 후 상태 확인
# ──────────────────────────────────────────
step "8/11" "취소 후 상태 확인"

AFTER_RES=$(curl -s -X GET "$PG/payments/$PAYMENT_KEY" \
  -H "Authorization: $AUTH_HEADER")

AFTER_STATUS=$(echo "$AFTER_RES" | jq -r '.data.status // empty')

if [ "$AFTER_STATUS" != "CANCELED" ]; then
  fail "취소 후 상태 불일치: $AFTER_STATUS" "$AFTER_RES"
fi
pass "취소 상태 유지 확인 — status=CANCELED"

# ──────────────────────────────────────────
# Step 9: 카드사 거절 시뮬레이션
# ──────────────────────────────────────────
step "9/11" "보안 테스트 — 카드사 거절 시뮬레이션 (금액 끝자리 99)"

REJECT_ORDER="ORDER-REJECT-$(date +%s)"
REJECT_RES=$(curl -s -X POST "$PG/payments" \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH_HEADER" \
  -d "{
    \"orderId\": \"$REJECT_ORDER\",
    \"amount\": 10099,
    \"orderName\": \"거절 테스트\",
    \"paymentMethod\": \"CARD\"
  }")

REJECT_KEY=$(echo "$REJECT_RES" | jq -r '.data.paymentKey // empty')

if [ -n "$REJECT_KEY" ] && [ "$REJECT_KEY" != "null" ]; then
  REJECT_CONFIRM=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$PG/payments/confirm" \
    -H "Content-Type: application/json" \
    -H "Authorization: $AUTH_HEADER" \
    -d "{\"paymentKey\":\"$REJECT_KEY\",\"orderId\":\"$REJECT_ORDER\",\"amount\":10099}")

  if [ "$REJECT_CONFIRM" = "422" ]; then
    pass "카드사 거절 정상 감지 — HTTP $REJECT_CONFIRM (금액 10,099원 → 거절)"
  else
    fail "거절이 감지되지 않음 — HTTP $REJECT_CONFIRM" ""
  fi
else
  fail "거절 테스트 주문 생성 실패" "$REJECT_RES"
fi

# ──────────────────────────────────────────
# Step 10: 금액 변조 감지
# ──────────────────────────────────────────
step "10/11" "보안 테스트 — 금액 변조 감지 (30,000원 → 50,000원)"

TAMPER_ORDER="ORDER-TAMPER-$(date +%s)"
TAMPER_RES=$(curl -s -X POST "$PG/payments" \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH_HEADER" \
  -d "{
    \"orderId\": \"$TAMPER_ORDER\",
    \"amount\": 30000,
    \"orderName\": \"변조 테스트\",
    \"paymentMethod\": \"CARD\"
  }")

TAMPER_KEY=$(echo "$TAMPER_RES" | jq -r '.data.paymentKey // empty')

if [ -n "$TAMPER_KEY" ] && [ "$TAMPER_KEY" != "null" ]; then
  # 확정 시 금액을 50,000원으로 변조 시도
  TAMPER_CONFIRM=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$PG/payments/confirm" \
    -H "Content-Type: application/json" \
    -H "Authorization: $AUTH_HEADER" \
    -d "{\"paymentKey\":\"$TAMPER_KEY\",\"orderId\":\"$TAMPER_ORDER\",\"amount\":50000}")

  if [ "$TAMPER_CONFIRM" = "400" ]; then
    pass "금액 변조 차단 — HTTP $TAMPER_CONFIRM (30,000 ≠ 50,000)"
  else
    fail "금액 변조가 감지되지 않음 — HTTP $TAMPER_CONFIRM" ""
  fi
else
  fail "변조 테스트 주문 생성 실패" "$TAMPER_RES"
fi

# ──────────────────────────────────────────
# Step 11: API 키 목록 조회
# ──────────────────────────────────────────
step "11/11" "API 키 목록 조회 (관리자)"

LIST_RES=$(curl -s -X GET "$PG/api-keys?merchantId=$MERCHANT_ID" \
  -H "Authorization: Bearer $TOKEN")

KEY_COUNT=$(echo "$LIST_RES" | jq '.data | length')

if [ "$KEY_COUNT" -gt 0 ]; then
  pass "발급된 API 키 ${KEY_COUNT}개 확인"
else
  fail "API 키 목록 조회 실패" "$LIST_RES"
fi

# ──────────────────────────────────────────
# 결과 요약
# ──────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ 전체 11/11 테스트 통과!              ║"
echo "╠══════════════════════════════════════════╣"
echo "║   결제 플로우:                             ║"
echo "║   READY → DONE → CANCELED                ║"
echo "║                                          ║"
echo "║   보안 검증:                               ║"
echo "║   카드 거절 ✅  금액 변조 차단 ✅           ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
