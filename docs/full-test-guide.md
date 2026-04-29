# PG System 풀 시나리오 테스트 가이드

> 관리자 → 대리점 등록 → 가맹점 등록 → **가맹점 활성화** → API 키 발급 → 결제 → 거래확인 → 정산 → 취소

## 사전 준비

Docker가 실행 중인지 확인:
```bash
docker compose ps
```
모든 서비스(db, api, web, nginx)가 `healthy` 상태여야 합니다.

> **참고**: JWT 토큰 유효기간은 15분입니다.
> 긴 테스트 중 `AUTH_001` 에러가 나면 Step 1을 다시 실행하여 토큰을 갱신하세요.

---

## Step 1. 관리자 로그인

**브라우저**: http://localhost 접속 → 로그인 페이지

| 필드 | 값 |
|------|-----|
| 아이디 | `admin` |
| 비밀번호 | `Admin1234!@` |

로그인 후 `/dashboard`로 이동됩니다.

**또는 curl로 토큰 발급:**
```bash
# 관리자 로그인 → accessToken 획득
curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"admin","password":"Admin1234!@"}' | python3 -m json.tool
```

응답에서 `data.accessToken`을 복사하세요. 이후 모든 관리자 API에 사용합니다.

```bash
# 편의를 위해 변수에 저장
TOKEN="여기에_accessToken_붙여넣기"
```

---

## Step 2. 대리점 등록

**curl:**
```bash
curl -s -X POST http://localhost/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "agentName": "테스트대리점",
    "businessNo": "123-45-67890",
    "bankName": "국민은행",
    "bankAccount": "123-456-789012",
    "bankHolder": "홍길동"
  }' | python3 -m json.tool
```

응답에서 `data.id`를 복사하세요 → 이것이 **agentId**입니다.

```bash
AGENT_ID="여기에_agentId_붙여넣기"
```

---

## Step 3. 가맹점 등록

대리점 아래에 가맹점을 만듭니다.

> **주의**: `businessNo`는 대리점과 다른 값을 사용해야 합니다 (companies 테이블에서 unique).

**curl:**
```bash
curl -s -X POST http://localhost/api/v1/merchants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "agentId": "'$AGENT_ID'",
    "merchantName": "테스트쇼핑몰",
    "businessNo": "987-65-43210",
    "settlementCycle": "D+1",
    "bankName": "신한은행",
    "bankAccount": "110-123-456789",
    "bankHolder": "김영희"
  }' | python3 -m json.tool
```

응답에서 `data.id`를 복사하세요 → 이것이 **merchantId**입니다.

> **참고**: `settlementCycle` 값은 `D+1`, `D+2`, `D+3`, `D+5`, `D+7` 중 선택합니다.

```bash
MERCHANT_ID="여기에_merchantId_붙여넣기"
```

---

## Step 3-1. 가맹점 활성화 (필수!)

새로 등록된 가맹점은 **PENDING** 상태입니다.
API 키를 발급받으려면 먼저 **ACTIVE**로 변경해야 합니다.

```bash
curl -s -X POST http://localhost/api/v1/merchants/$MERCHANT_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "ACTIVE"}' | python3 -m json.tool
```

응답에서 `data.status`가 `ACTIVE`인지 확인하세요.

---

## Step 4. API 키 발급 (가맹점용)

가맹점이 결제 API를 사용하려면 API Key가 필요합니다.

> **전제조건**: 가맹점 상태가 반드시 `ACTIVE`여야 합니다 (Step 3-1 참조).

**curl:**
```bash
curl -s -X POST http://localhost/pg/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "merchantId": "'$MERCHANT_ID'"
  }' | python3 -m json.tool
```

**중요**: 응답에서 `data.clientKey`와 `data.secretKey`를 **반드시** 복사하세요!
`secretKey`는 **이때 한 번만** 표시됩니다. 나중에 다시 볼 수 없습니다.

```bash
CLIENT_KEY="여기에_clientKey_붙여넣기"
SECRET_KEY="여기에_secretKey_붙여넣기"
```

---

## Step 5. 결제 주문 생성 (가맹점 쇼핑몰 역할)

여기서부터 가맹점이 자기 쇼핑몰에서 PG API를 호출하는 상황입니다.
인증 방식이 **Toss Payments 스타일 Basic Auth**로 바뀝니다.

> **인증 방식**: `-u "secretKey:"` (secretKey 뒤에 콜론, 비밀번호 없음)
> clientKey는 결제 응답에서 확인용으로 사용됩니다.

**curl:**
```bash
curl -s -X POST http://localhost/pg/v1/payments \
  -u "$SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER-2026-001",
    "amount": 50000,
    "orderName": "프리미엄 구독권",
    "paymentMethod": "CARD",
    "customerEmail": "customer@test.com",
    "customerName": "박고객"
  }' | python3 -m json.tool
```

응답에서 `data.paymentKey`를 복사하세요.

```bash
PAYMENT_KEY="여기에_paymentKey_붙여넣기"
```

---

## Step 6. 결제 승인 (고객이 카드 정보 입력 후 결제)

실제로는 고객이 결제창에서 카드 정보를 입력하는 단계입니다.
테스트용 카드번호: `4111111111111111` (VISA 테스트카드)

**curl:**
```bash
curl -s -X POST http://localhost/pg/v1/payments/confirm \
  -u "$SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentKey": "'$PAYMENT_KEY'",
    "orderId": "ORDER-2026-001",
    "amount": 50000,
    "cardNumber": "4111111111111111"
  }' | python3 -m json.tool
```

`data.status: "DONE"`이 나오면 결제 성공!

> **참고**: PG API 응답 상태는 `DONE`입니다 (내부 transactions 테이블에서는 `APPROVED`로 기록).

---

## Step 7. 결제 내역 확인

### 방법 A: curl로 확인
```bash
# orderId로 조회
curl -s http://localhost/pg/v1/payments/orders/ORDER-2026-001 \
  -u "$SECRET_KEY:" | python3 -m json.tool

# paymentKey로 조회
curl -s http://localhost/pg/v1/payments/$PAYMENT_KEY \
  -u "$SECRET_KEY:" | python3 -m json.tool
```

### 방법 B: 가맹점 포탈에서 확인

가맹점 유저로 로그인이 필요합니다. 기존 테스트 계정 사용:

1. http://localhost 접속
2. `merchant_test` / `Admin1234!@` 로그인
3. 자동으로 `/m/dashboard`로 이동
4. 사이드바에서 **거래내역** 클릭 → `/m/transactions`

> 참고: `merchant_test`는 seed 데이터의 테스트 가맹점(MCH-TEST-001)에 연결되어 있어서,
> 위에서 새로 만든 "테스트쇼핑몰"의 거래는 보이지 않습니다.
> 새 가맹점의 거래를 포탈에서 보려면 해당 가맹점에 연결된 유저를 만들어야 합니다 (아래 "추가" 참조).

---

## Step 8. 정산 처리 (관리자)

관리자로 정산을 수동 실행합니다.
(자동 정산은 매일 새벽 02:00에 배치로 실행됩니다)

> **참고**: JWT 토큰이 만료되었을 수 있습니다. Step 1을 다시 실행하여 토큰을 갱신하세요.

### 8-1. 정산 계산

```bash
# 오늘 날짜 기준으로 정산 계산
TODAY=$(date +%Y-%m-%d)

curl -s -X POST http://localhost/api/v1/settlements/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "settlementDate": "'$TODAY'",
    "periodFrom": "'$TODAY'",
    "periodTo": "'$TODAY'"
  }' | python3 -m json.tool
```

응답에서 `merchantSettlements`와 `agentSettlements` 수를 확인하세요.
정산이 생성되었으면 목록에서 ID를 확인합니다:

```bash
curl -s "http://localhost/api/v1/settlements?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

응답에서 확정할 정산의 `id`를 복사하세요 → **settlementId**

```bash
SETTLEMENT_ID="여기에_settlementId_붙여넣기"
```

### 8-2. 정산 확정

```bash
curl -s -X POST http://localhost/api/v1/settlements/$SETTLEMENT_ID/confirm \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

`data.status`가 `CONFIRMED`로 변경됩니다.

### 8-3. 정산 완료 (송금 처리)

```bash
curl -s -X POST http://localhost/api/v1/settlements/$SETTLEMENT_ID/complete \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

`data.status`가 `REMITTED`로 변경되고, `remitted_at`에 송금 시간이 기록됩니다.

---

## Step 9. 정산 내역 확인

### 관리자로 확인:
```bash
curl -s "http://localhost/api/v1/settlements?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 가맹점 포탈에서 확인:
1. `merchant_test` / `Admin1234!@` 로그인
2. 사이드바에서 **정산내역** 클릭 → `/m/settlements`

---

## 추가: 결제 취소 테스트

### 전체 취소

```bash
curl -s -X POST http://localhost/pg/v1/payments/$PAYMENT_KEY/cancel \
  -u "$SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "cancelReason": "고객 요청에 의한 취소"
  }' | python3 -m json.tool
```

`data.status`가 `CANCELED`로 변경됩니다.

### 부분 취소

```bash
curl -s -X POST http://localhost/pg/v1/payments/$PAYMENT_KEY/cancel \
  -u "$SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "cancelReason": "부분 환불",
    "cancelAmount": 20000
  }' | python3 -m json.tool
```

`data.status`가 `PARTIAL_CANCELED`로 변경됩니다.
부분 취소는 여러 번 가능하며, 원거래 금액을 초과하면 `PGW_007` 에러가 반환됩니다.

---

## 추가: 새 가맹점에 유저 연결하기

새로 만든 "테스트쇼핑몰"에 로그인할 유저를 만들려면:

```bash
# 1. 가맹점 유저 생성
curl -s -X POST http://localhost/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "loginId": "testshop_owner",
    "name": "김영희",
    "password": "Shop1234!@#$",
    "userType": "merchant",
    "email": "owner@testshop.com"
  }' | python3 -m json.tool
```

> 현재 CreateUserDto에 merchantId 필드가 없어서,
> 유저 생성 후 DB에서 직접 merchant_id를 연결해야 합니다:
> ```bash
> docker compose exec db psql -U pgadmin -d pgdb -c \
>   "UPDATE users SET merchant_id = '$MERCHANT_ID' WHERE login_id = 'testshop_owner';"
> ```
> 이 연결 후 `testshop_owner`로 로그인하면 가맹점 포탈에서 해당 가맹점의 거래만 보입니다.

---

## 테스트 카드번호 참고

| 카드번호 | 결과 |
|----------|------|
| `4111111111111111` | 결제 성공 (VISA) |
| `5200000000000099` | 거절 (금액 끝자리 99) |
| `5200000000000098` | 타임아웃 (금액 끝자리 98) |
| `5200000000000097` | 잔액 부족 (금액 끝자리 97) |

> 금액(amount)의 끝자리에 따라 Mock 카드사가 응답을 달리합니다.

---

## 정산 상태 흐름

| 상태 | 의미 |
|------|------|
| `CALCULATED` | 정산 계산 완료 (대기) |
| `CONFIRMED` | 정산 확정 (관리자 승인) |
| `REMITTED` | 송금 완료 |

---

## 전체 흐름 요약

```
관리자 로그인
    │
    ├── 대리점 등록 ────────────────────────┐
    │                                        │
    ├── 가맹점 등록 (대리점 소속) ──────────┤
    │                                        │
    ├── 가맹점 활성화 (PENDING→ACTIVE)  ────┤
    │                                        │
    ├── API 키 발급 (가맹점용) ─────────────┤
    │                                        │
    │   ┌─── 가맹점 쇼핑몰 (Basic Auth) ───┤
    │   │                                    │
    │   ├── 결제 주문 생성 (READY)           │
    │   │                                    │
    │   ├── 결제 승인 (DONE)                 │
    │   │                                    │
    │   ├── 결제/취소 조회                   │
    │   │                                    │
    │   └── 결제 취소 (CANCELED/PARTIAL)     │
    │                                        │
    ├── 정산 계산 (CALCULATED) ──────────────┤
    │                                        │
    ├── 정산 확정 (CONFIRMED) ──────────────┤
    │                                        │
    └── 정산 완료 (REMITTED) ──────────────┘
```
