# 방어적 프로그래밍 요구사항 문서

## 소개

**기능명**: PG System 방어적 프로그래밍 — 5-Layer 방어 구조 강화
**목표**: 한국 금융감독원(FSS) 기준 결제 시스템의 보안 강화. 모든 결제 경로에서 입력 검증(Layer 1), 금액 변조 방지(Layer 2), 안전한 롤백(Layer 3), 이상거래 탐지(Layer 4), PCI DSS 준수(Layer 5)를 구현하여 금전적 손실과 데이터 유출을 원천 차단한다.

**보안등급**: 🔴 최고 (돈 + 법적책임)
**기본 원칙**: "결제 시스템은 한 번의 실패가 곧 금전적 손실이다. 모든 경로에서 방어한다."

---

## 필수 구현 항목 (현재 미완료 🔲)

### Requirement 1: 실제 VAN/카드사 연동 (1순위)

**담당자 역할**: PG System 개발자
**목표**: Mock 카드사로부터 실제 VAN(Value Added Network) 및 카드사 어댑터로 전환하여 운영 환경에서 실 결제를 처리할 수 있도록 한다.

#### 1.1 결제 요청 프로세스 검증

1. When 가맹점이 결제 요청 `/api/v1/payments`를 전송할 때, PG System API Gateway shall 다음 순서로 처리한다:
   - 요청 인증 검증 (PgBasicAuthGuard)
   - 가맹점 상태 확인 (ACTIVE 상태만)
   - 요청 본문 크기 검증 (최대 1MB)
   - orderId 중복 검사 (멱등성 보장)
   - 금액 사전 검증 (양수 정수, 100원 이상, 1억 미만)

2. When FDS 규칙 엔진 검사를 통과한 경우, PG System Payment Service shall VAN 어댑터(AcquirerProvider DI 토큰)를 호출하여 실제 카드사에 승인 요청을 전송한다.

3. When VAN 어댑터가 응답을 반환할 때, PG System shall 다음을 검증한다:
   - 응답 상태 코드 (성공/실패/타임아웃)
   - 응답의 승인 금액이 요청 금액과 일치하는지 (2단계 검증)
   - 응답 본문 형식이 유효한지

#### 1.2 타임아웃 및 재시도 안전성

1. If VAN 어댑터 요청이 설정된 타임아웃(기본값 30초)을 초과할 때, PG System shall:
   - 즉시 요청을 중단하고 "처리 중" 상태로 기록
   - 별도 Job으로 승인 조회(Confirmation Inquiry)를 3회 재시도 (1분, 5분, 10분)
   - 최종 미확인 시 자동 취소 요청

2. If 승인 조회가 3회 모두 실패할 때, PG System shall 관리자 알림 큐에 등록하고 수동 확인 대기 상태로 변경한다.

3. While 결제가 "미확인" 상태일 때, PG System shall 6시간마다 자동 조회를 재시도하고, 하루 경과 시 자동 취소 프로세스를 실행한다.

#### 1.3 롤백 안전성

1. If VAN 어댑터로부터 승인 응답을 수신했으나 DB 기록 중 오류가 발생할 때, PG System shall:
   - 즉시 트랜잭션 롤백 (Prisma $transaction)
   - VAN 어댑터의 취소(Cancel) 메서드를 호출하여 카드사에 취소 요청
   - 취소 실패 시 보상 거래 큐에 등록

2. If 취소(Cancel) 요청이 실패할 때, PG System shall 수동 확인 큐에 등록하고 관리자에게 즉시(🔴) 알림을 전송한다.

3. The PG System shall 모든 VAN 어댑터 호출 및 응답을 AuditInterceptor를 통해 타임스탬프, 요청/응답 본문(카드 정보 제외), 결과 코드와 함께 기록한다.

### Requirement 2: 결제창 iframe SDK (1순위)

**담당자 역할**: PG System 프론트엔드/SDK 개발자
**목표**: 가맹점이 자사 결제 페이지에 임베드할 수 있는 iframe 기반 SDK를 제공하여, 카드 정보가 가맹점 서버를 거치지 않고 PG 서버로 직접 전송되도록 한다.

#### 2.1 SDK 초기화 및 로드

1. The pg-checkout-sdk shall 다음 메타데이터로 초기화된다:
   - 환경별 base URL (test: http://pg-system.local:3500, live: https://pg.example.com)
   - SDK 버전 정보 (버전 호환성 검사)
   - CORS 오리진 화이트리스트 (등록된 도메인만 로드 허용)

2. When 가맹점이 SDK를 스크립트 태그로 로드할 때, pg-checkout-sdk shall:
   - 현재 페이지 호스트가 등록된 도메인인지 검증
   - 등록되지 않은 도메인이면 콘솔 에러 출력 후 로드 중단
   - 안전한 로드 시 window.PgCheckout 전역 객체 생성

3. When 가맹점이 `PgCheckout.open(options)`을 호출할 때, sdk shall:
   - orderId, amount, orderName, merchantId, productKey 등을 검증
   - 검증 오류 시 콘솔 에러와 콜백(`onError`)으로 실시간 알림
   - 검증 통과 시 PG iframe을 동적으로 DOM에 마운트

#### 2.2 카드 입력 폼 보안 격리

1. The pg-checkout-sdk iframe shall 다음 보안 정책을 적용한다:
   - `sandbox="allow-scripts allow-same-origin"` (다른 도메인 스크립트 로드 금지)
   - CSP 헤더: `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...'`
   - `X-Frame-Options: ALLOWALL` (PG 서버에서 iframe 로드 허용)

2. The 카드번호 입력 필드shall:
   - 자동완성 비활성화 (`autocomplete="off"`)
   - 모든 입력을 즉시 마스킹 (앞 6자리 + 뒤 4자리만 표시)
   - DOM에 전체 카드번호를 절대 저장하지 않음 (메모리 내에서만 유지)

3. The 결제 서밋 버튼 shall:
   - 클릭 후 즉시 비활성화 (disabled = true)
   - 로딩 스피너 표시
   - 응답 수신 후에만 재활성화 (중복 제출 방지)

#### 2.3 토큰화 및 응답 핸들링

1. When 사용자가 "결제하기" 버튼을 클릭할 때, pg-checkout-sdk shall:
   - 카드번호, 만료기간, CVV를 프론트엔드에서 검증 (Luhn, 형식 검사)
   - 검증 실패 시 사용자에게 오류 메시지 표시
   - 검증 통과 시 POST `/api/v1/card-tokenization`로 카드 정보 전송

2. When Card Tokenization API가 성공 응답을 반환할 때, pg-checkout-sdk shall:
   - 토큰 값을 암호화하여 일시적 메모리에 보관
   - 원본 카드 정보를 메모리에서 즉시 삭제 (wipe)
   - onSuccess 콜백에 토큰을 전달

3. When 가맹점이 onSuccess 콜백을 받을 때, 가맹점은 다음을 수행해야 한다:
   - 토큰을 자사 서버로 전송하여 결제 요청 생성
   - 결제 결과를 폴링하거나 웹훅으로 수신

4. If 카드 토큰화가 실패하면, pg-checkout-sdk shall onError 콜백으로 오류를 전달하고 사용자 재입력을 허용한다.

#### 2.4 SDK 입력 검증 규칙

1. The pg-checkout-sdk shall 다음 입력 필드를 검증한다:

   | 필드 | 규칙 | 에러 메시지 |
   |------|------|-----------|
   | orderId | 영숫자 + 하이픈, 최대 64자 | "주문번호 형식이 올바르지 않습니다" |
   | amount | 양의 정수, 100원 이상, 1억 미만 | "결제 금액을 확인해주세요" |
   | orderName | 1~100자, HTML 태그 제거 | "주문 이름을 확인해주세요" |
   | customerEmail | 이메일 형식 (선택) | "이메일 형식이 올바르지 않습니다" |
   | redirectUrl | HTTPS + 등록된 도메인 (선택) | "리다이렉트 URL을 확인해주세요" |
   | merchantId | 존재하는 ID + 활성 상태 | "가맹점 정보를 확인해주세요" |

### Requirement 3: 관리자 MFA 강화 (1순위)

**담당자 역할**: PG System 인증 개발자
**목표**: TOTP(Time-based One-Time Password) 기반 2단계 인증을 관리자에게 필수로 요구하여 관리자 계정 탈취를 방지한다.

#### 3.1 MFA 등록 프로세스

1. When 관리자가 처음 로그인할 때, PG System shall 다음 흐름을 실행한다:
   - JWT 토큰 발급 (정상 로그인)
   - MFA 등록 여부 확인
   - 미등록 시 `/auth/mfa/setup` 페이지로 리다이렉트

2. When 관리자가 MFA setup 페이지에 진입할 때, PG System shall:
   - TOTP 시크릿 생성 (otplib 라이브러리)
   - QR 코드 생성 (대표 인증 앱: Google Authenticator, Authy)
   - 백업 코드 10개 생성 (각각 단회용, 분실 시 복구용)

3. When 관리자가 인증 앱을 스캔하고 6자리 코드를 입력할 때, PG System shall:
   - 입력된 코드를 TOTP 검증 (otplib.authenticator.check)
   - 검증 성공 시 관리자 계정에 mfa_secret 저장
   - 백업 코드를 bcrypt 해시하여 저장

#### 3.2 로그인 시 MFA 검증

1. When 관리자가 로그인 자격증명을 제출할 때, PG System AuthService shall:
   - 사용자명 + 비밀번호 검증 (기존 방식)
   - mfa_secret이 등록되어 있으면 JWT를 발급하지 않음
   - 대신 임시 토큰(mfaToken, 5분 만료)을 발급 + `/auth/mfa/verify` 페이지로 리다이렉트

2. When 관리자가 `/auth/mfa/verify` 페이지에서 6자리 코드를 입력할 때, PG System shall:
   - 임시 토큰 유효성 검증
   - 6자리 코드를 TOTP 검증 (또는 백업 코드 검증)
   - 검증 성공 시 정식 JWT 발급
   - 백업 코드 사용 시 해당 코드 폐기 + 감사 로그 기록

3. If MFA 코드가 유효하지 않으면, PG System shall:
   - 오류 메시지 표시 ("인증코드를 다시 확인해주세요")
   - 5회 실패 시 임시 토큰 만료 + 재로그인 요구
   - 실패 횟수를 감사 로그에 기록

#### 3.3 백업 코드 관리

1. The PG System shall 관리자가 설정 페이지에서 다음을 수행할 수 있도록 한다:
   - 현재 MFA 상태 확인 (등록됨/미등록)
   - 백업 코드 재생성 (기존 코드 폐기)
   - MFA 비활성화 (현재 비밀번호 재입력 필수)

2. When 관리자가 MFA를 비활성화할 때, PG System shall:
   - mfa_secret과 모든 백업 코드 삭제
   - 감사 로그 기록 (누가, 언제, MFA 비활성화)
   - 30분 내 다시 활성화하지 않으면 정상 상태 확정

### Requirement 4: 환경변수 KMS/Vault 전환 (1순위)

**담당자 역할**: PG System 인프라 개발자
**목표**: .env 파일에 저장된 민감한 정보(API 키, DB 비밀번호, 암호화 키)를 AWS Secrets Manager 또는 HashiCorp Vault 같은 중앙화된 시크릿 매니저로 전환한다.

#### 4.1 시크릿 분류 및 로드

1. The PG System shall 모든 환경변수를 다음과 같이 분류한다:

   | 분류 | 예시 | 저장 위치 | 접근 제어 |
   |------|------|---------|---------|
   | 공개 | NODE_ENV, API_PORT | .env | 없음 |
   | 민감 | DATABASE_URL, REDIS_URL | Secrets Manager | IAM 역할 |
   | 암호화 | CARD_ENCRYPTION_KEY, JWT_SECRET | Vault (KMS 암호화) | IAM 역할 + MFA |
   | 외부 API | TOSS_API_KEY, SLACK_WEBHOOK_URL | Secrets Manager | IAM 역할 |

2. When PG System이 시작할 때(bootstrap), ConfigService shall:
   - 공개 변수는 .env에서 로드
   - 민감/암호화 변수는 Secrets Manager 또는 Vault에서 로드
   - 로드 실패 시 애플리케이션 시작 거부 (에러 메시지: "Required secrets not found")

3. The PG System shall 로드한 모든 시크릿을 메모리에만 보관하고, 다음을 금지한다:
   - 시크릿을 로그 또는 에러 응답에 기록
   - 시크릿을 환경변수로 자식 프로세스에 전달
   - 시크릿을 소스 코드에 문자열로 하드코딩

#### 4.2 로컬 개발 환경 호환성

1. When 개발자가 로컬에서 개발할 때, PG System shall 다음 폴백을 제공한다:
   - Secrets Manager/Vault 연결 실패 시 로컬 .env 파일 로드
   - 로컬 .env는 .gitignore에 포함되고 예제 파일(.env.example) 제공
   - 수동으로 로컬 테스트 시크릿을 .env에 작성

2. The ConfigService shall 환경(dev/test/staging/prod)에 따라 다른 엔드포인트를 사용한다:
   - dev/test: 로컬 .env
   - staging/prod: AWS Secrets Manager (또는 Vault)

#### 4.3 시크릿 로테이션

1. While 시크릿이 Secrets Manager에 저장되어 있을 때, PG System shall:
   - 90일마다 자동 로테이션 정책 설정 (AWS native)
   - 로테이션 전에 새 시크릿 버전 생성 + 애플리케이션 재시작 불필요
   - 구 버전을 30일간 유지 후 폐기

2. If API 키 유출이 의심될 때, PG System shall:
   - 즉시 새 API 키 생성 + Secrets Manager에 업데이트
   - 구 API 키 비활성화 + 감시 모드 전환 (24시간)
   - 보안 팀과 해당 가맹점에 통지

---

## 선택 강화 항목 (2순위 및 3순위)

### Requirement 5: Sentry 에러 모니터링 (2순위)

**담당자 역할**: PG System 모니터링 개발자
**목표**: 실시간 에러 추적 및 성능 모니터링으로 결제 실패 패턴을 빠르게 식별하고 대응한다.

#### 5.1 Sentry 통합

1. When 백엔드 또는 프론트엔드에서 예외가 발생할 때, Sentry shall:
   - 자동으로 예외를 캡처 (에러 메시지, 스택트레이스, 요청 컨텍스트)
   - 카드 정보, JWT 토큰, 비밀번호 등 민감 정보는 자동으로 마스킹
   - 에러를 Sentry 클라우드에 전송

2. The PG System shall Sentry에 다음 컨텍스트를 추가한다:
   - 사용자 ID + 역할 (관리자/가맹점/대리점)
   - 가맹점 ID + 가맹점 이름
   - 요청 ID (추적 용도)
   - 환경 (dev/test/staging/prod)

3. If 결제 실패율이 시간당 3% 이상일 때, Sentry shall 알림 규칙을 통해 관리자에게 알림을 전송한다.

#### 5.2 성능 모니터링

1. The Sentry shall Transaction을 통해 다음을 추적한다:
   - 결제 요청 평균 처리 시간 (목표: < 3초)
   - VAN 어댑터 응답 시간
   - 데이터베이스 쿼리 시간
   - 외부 API 호출 시간

2. If API 응답 시간이 5초 이상일 때, Sentry shall 느린 트랜잭션으로 표시하고 상세 분석 정보를 저장한다.

### Requirement 6: Slack 긴급 알림 (2순위)

**담당자 역할**: PG System 알림 개발자
**목표**: 시스템 이상 상황을 실시간으로 감지하여 Slack 채널로 관리자에게 즉시 알린다.

#### 6.1 알림 우선순위별 채널

1. The PG System shall 다음과 같이 알림 채널을 분리한다:

   | 우선순위 | 채널 | 대상 | 응답시간 |
   |---------|------|------|---------|
   | 🔴 즉시 | #pg-system-critical | 개발팀 + 운영팀 | 5분 |
   | 🟡 높음 | #pg-system-alerts | 운영팀 | 30분 |
   | 🟢 정보 | #pg-system-logs | 모니터링 담당 | 1시간 |

#### 6.2 즉시 알림(🔴) 이벤트

1. When 다음 이벤트 중 하나라도 발생하면, PG System shall 즉시 #pg-system-critical로 알림을 전송한다:

   - 결제 API 응답 불가 (에러율 > 10% / 5분)
   - FDS 차단 건수 급증 (시간당 10건 이상)
   - VAN 어댑터 연속 3회 실패
   - 금액 변조 시도 감지 (프론트/백엔드/카드사 금액 불일치)
   - 카드 토큰화 API 실패
   - 인증 시스템 장애 (로그인 API 응답 불가)
   - 미확인 거래 (승인 O, DB 기록 X)
   - 정산 금액 불일치 감지

2. When 알림이 Slack으로 전송될 때, PG System shall 다음을 포함한다:
   - 알림 시각 (KST + UTC)
   - 영향 범위 (전체/특정 가맹점/특정 에러 유형)
   - 임시 대응 방법 (링크: 모니터링 대시보드, 수동 검사 큐)

### Requirement 7: 결제 금액 변조 탐지 강화 (2순위)

**담당자 역할**: PG System 백엔드 개발자
**목표**: 프론트엔드, 백엔드, 카드사 3단계에서 금액이 일관되게 검증되도록 강화한다.

#### 7.1 3단계 금액 검증 자동화

1. The PG System shall 모든 결제 요청에 대해 3단계 검증을 수행한다:

   **1단계: 결제 요청 시 (API Gateway)**
   - When 가맹점이 POST `/api/v1/payments`로 amount를 전송할 때, PG System shall:
     - DB에서 해당 orderId의 사전 저장된 금액(reserved_amount) 조회
     - 전송된 amount와 reserved_amount 비교
     - 불일치 시 즉시 거부 + 감사 로그 기록 (에러: "금액이 변조되었습니다")

   **2단계: 카드사 승인 응답 시**
   - When VAN 어댑터로부터 승인 응답을 수신할 때, PG System shall:
     - 응답의 approvalAmount와 요청 amount 비교
     - 불일치 시 자동 취소 요청 + 감사 로그 기록 (우선순위: 🔴)

   **3단계: 정산 시**
   - While 정산 배치가 실행될 때, PG System shall:
     - 일별 승인 금액 합산 (SUM)과 개별 거래 건 합산 재계산
     - 금액 불일치 시 정산 실행 보류 + 관리자 수동 검증 대기
     - 승인 완료 후 감사 로그 기록

#### 7.2 금액 변조 감지 규칙

1. If 단일 가맹점에서 10분 내 요청 금액 vs 승인 금액 불일치가 3건 이상 발생할 때, PG System shall:
   - 해당 가맹점을 "의심 거래" 상태로 변경
   - 이후 모든 결제를 FDS 수동 검증 큐에 등록
   - 관리자에게 알림 (우선순위: 🟡)

2. If 동일 orderId로 서로 다른 금액의 결제 시도가 2회 이상 발생할 때, PG System shall:
   - 해당 거래를 중복 결제 시도로 판단
   - 첫 승인 건 유지, 이후 시도는 거부
   - 감시 로그 기록

### Requirement 8: 정산 이중 검증 자동화 (2순위)

**담당자 역할**: PG System 정산 개발자
**목표**: 일별 정산 배치 실행 전에 자동으로 금액을 교차 검증하여 정산 오류를 방지한다.

#### 8.1 정산 사전 검증

1. While 정산 배치가 실행될 때, SettlementService shall:
   - 정산 대상 일자의 모든 APPROVED 거래 조회
   - 거래별 금액 + 수수료 재계산
   - 계산 결과를 정산 전날의 기록과 비교

2. When 계산 결과가 전날 기록과 불일치할 때, PG System shall:
   - 정산 실행 중단
   - 불일치 항목 상세 리스트 생성 (거래 ID, 예상 금액, 실제 금액)
   - 관리자 수동 검증 큐에 등록 (대기: 최대 4시간)
   - 관리자에게 알림 (우선순위: 🟡)

3. When 관리자가 수동 검증 후 "승인" 결정을 할 때, PG System shall:
   - 검증자 ID + 시각 + 근거 기록
   - 정산 배치 재실행
   - 정산 완료 후 거래처에 정산액 안내 이메일 발송

#### 8.2 정산 내역 추적성

1. The PG System shall 정산 내역에 다음을 기록한다:
   - 정산 대상 기간 (시작일, 종료일)
   - 정산 실행자 (배치 또는 관리자 이름)
   - 실행 시각 (KST)
   - 총 거래 건수 + 총 정산액
   - 각 가맹점별 정산액 상세

2. If 정산 내역이 수정될 경우(관리자 수동 보정), PG System shall:
   - 원본 정산 내역은 보관 (삭제 금지)
   - 보정 기록을 별도 테이블에 Append-only로 추가
   - 보정자 ID + 사유 + 시각 기록
   - Audit 로그에도 동일 내용 기록

### Requirement 9: KPI 대시보드 (3순위)

**담당자 역할**: PG System 대시보드 개발자
**목표**: 실시간 결제 지표를 시각화하여 관리자가 시스템 상태를 한눈에 파악할 수 있도록 한다.

#### 9.1 핵심 KPI 지표

1. The PG System shall 다음 KPI를 실시간으로 추적하고 대시보드에 표시한다:

   | KPI | 정상 | 경고 | 위험 | 갱신주기 |
   |-----|------|------|------|--------|
   | 결제 성공률 | > 98% | 95~98% | < 95% | 1분 |
   | 평균 승인 시간 | < 3초 | 3~5초 | > 5초 | 1분 |
   | 시스템 에러율 | < 1% | 1~3% | > 3% | 1분 |
   | FDS 탐지율 | 기록 유지 | 급증 3배 | 급증 5배 | 5분 |
   | 서비스 가용성 | > 99.9% | 99.5~99.9% | < 99.5% | 5분 |
   | 웹훅 성공률 | > 99% | 95~99% | < 95% | 5분 |
   | 정산 정확도 | 100% | — | < 100% | 일간 |
   | 일일 거래액 | 추이 | — | 예상 대비 50% 이하 | 일간 |

2. The KPI 지표는 다음과 같이 색상 코드로 표시된다:
   - 🟢 정상 (녹색): 3개월 평균 범위 내
   - 🟡 경고 (황색): 임계값 초과 (1시간 지속)
   - 🔴 위험 (빨강): 심각한 임계값 초과 (즉시 알림)

#### 9.2 시간대별 분석

1. The PG System Dashboard shall 다음 기간별 집계를 제공한다:
   - 최근 1시간 (1분 단위)
   - 최근 24시간 (10분 단위)
   - 최근 7일 (1시간 단위)
   - 최근 30일 (1일 단위)

2. When 관리자가 특정 시간대를 선택할 때, PG System shall:
   - 해당 기간의 거래 건수, 성공률, 평균 시간, 에러 현황 표시
   - 상위 5개 가맹점별 거래액 표시
   - 상위 5개 에러 유형 표시

### Requirement 10: 일간/주간 자동 리포트 (3순위)

**담당자 역할**: PG System 보고 개발자
**목표**: 일간/주간 거래 현황과 이상 징후를 요약하여 관리자에게 자동으로 이메일 발송한다.

#### 10.1 일간 리포트

1. While 매일 오전 9시(KST)에 자동으로 실행될 때, PG System Report Service shall:
   - 전일 거래 건수, 거래액, 성공률 수집
   - 전일 FDS 탐지 건수 집계
   - 전일 가맹점별 거래 현황 (Top 10)
   - 전일 에러율, 웹훅 실패율 계산

2. When 일간 리포트가 생성될 때, Report Service shall:
   - 수신자 (PG 관리자, 운영팀)에게 이메일 발송
   - 이메일 형식: HTML + 인라인 차트
   - 이상 징후가 감지되면 " ⚠️ 주의" 배너 추가

#### 10.2 주간 리포트

1. While 매주 월요일 오전 9시(KST)에 실행될 때, PG System shall:
   - 지난주 거래 현황 요약 (일별 추이 차트)
   - 지난주 가맹점별 거래액 랭킹 (Top 20)
   - 지난주 FDS 탐지 건수 분석 (유형별)
   - 지난주 시스템 가용성 (일별)
   - 지난주 주요 장애 사항 (있을 경우)

2. When 주간 리포트가 생성될 때, Report Service shall:
   - 요약 페이지 + 상세 페이지 PDF 생성
   - 수신자 목록 (관리자, 경영진)에게 이메일 발송
   - 대시보드 링크 포함 (상세 조회용)

---

## 이미 구현된 요구사항 (✅ 완료 — 유지보수 항목)

### Requirement 11: 카드 토큰화 (완료 ✅)

**상태**: 구현 완료 (Sprint A.1)

#### 11.1 구현 확인 사항

1. The PG System Card Tokenization Service shall AES-256-GCM을 사용하여 카드번호를 암호화한다.

2. When 카드 정보가 결제창으로 전송될 때, PG System shall:
   - 카드번호를 절대 가맹점 서버로 전달하지 않음
   - 토큰화된 값만 가맹점에 반환
   - 토큰은 해당 가맹점에서만 사용 가능

3. The PG System shall 토큰화 과정을 감시 로그에 기록한다:
   - 토큰 생성 시각
   - 가맹점 ID
   - 토큰 유효기간 (기본 1년)

#### 11.2 유지보수 체크리스트

- [ ] AES-256-GCM 암호화 키 로테이션 (90일마다)
- [ ] 토큰 유효성 검증 (만료된 토큰 자동 폐기)
- [ ] 토큰 재발급 프로세스 (구 토큰 → 신 토큰)

### Requirement 12: PgBasicAuthGuard 가맹점 인증 (완료 ✅)

**상태**: 구현 완료 (Sprint A.1)

#### 12.1 구현 확인 사항

1. The PG System shall 가맹점 API 요청에 대해 다음 검증을 수행한다:
   - HTTP Basic Auth 헤더 검증 (`Authorization: Basic xxx`)
   - Secret Key bcrypt 해시 검증
   - IP 화이트리스트 검사
   - Rate Limiting 적용 (분당 60회)

2. If 인증 실패 시, PG System shall 401 Unauthorized 응답을 반환한다.

#### 12.2 유지보수 체크리스트

- [ ] Secret Key bcrypt 검증 성능 모니터링
- [ ] Rate Limiting 임계값 조정 (거래량에 따라)
- [ ] IP 화이트리스트 주기적 감사 (분기별)

### Requirement 13: JWT 인증 + OwnershipInterceptor (완료 ✅)

**상태**: 구현 완료 (Sprint A.1)

#### 13.1 구현 확인 사항

1. The PG System shall 관리자 및 포탈 사용자에게 다음 토큰을 발급한다:
   - Access Token (JWT, 15분 만료)
   - Refresh Token (7일 만료, HttpOnly 쿠키)

2. When 사용자가 포탈 API에 접근할 때, JwtAuthGuard shall:
   - Access Token 검증
   - 만료 시 Refresh Token으로 재발급
   - 최종 실패 시 /login으로 리다이렉트

3. The OwnershipInterceptor shall 가맹점/대리점 사용자의 데이터 격리를 보장한다:
   - merchantId JWT 클레임과 요청 경로 merchantId 비교
   - agentId JWT 클레임과 요청 경로 agentId 비교
   - 불일치 시 403 Forbidden 응답

#### 13.2 유지보수 체크리스트

- [ ] JWT 서명 키 로테이션 (6개월마다)
- [ ] Refresh Token 만료 기간 검토 (보안 vs 편의성)
- [ ] 동시 세션 제한 설정 (관리자: 1, 포탈 사용자: 3)

### Requirement 14: FDS 규칙 엔진 (완료 ✅)

**상태**: 구현 완료 (Sprint B.1)

#### 14.1 구현 확인 사항

1. The FDS Rule Engine shall 다음 규칙을 자동으로 검사한다:

   | 규칙 | 탐지 조건 | 대응 |
   |------|---------|------|
   | 고액 거래 | 단건 100만원 초과 | 추가 인증 |
   | 빈도 이상 | 동일 카드 10분 내 3건 이상 | 차단 |
   | 시간대 이상 | 새벽 2~5시 | 위험도 가산 |
   | 지역 이상 | IP 국가 ≠ 카드 발급국 | 차단 |
   | 패턴 이상 | 연속 소액 → 고액 | 차단 |
   | 실패 반복 | 동일 IP 5분 내 5회 실패 | 차단 |

2. When FDS 규칙 중 하나라도 위반될 때, FDS Service shall:
   - 거래를 "검증 필요" 상태로 변경
   - 관리자 검증 큐에 등록
   - 실시간 알림 (Slack)

#### 14.2 유지보수 체크리스트

- [ ] FDS 규칙 오탐지율 모니터링 (목표: < 5%)
- [ ] 규칙별 탐지 통계 수집 (월간)
- [ ] 신규 거래 패턴에 따른 규칙 추가 (분기별)

### Requirement 15: 감시 로그 체인 (완료 ✅)

**상태**: 구현 완료 (Sprint B.2)

#### 15.1 구현 확인 사항

1. The AuditInterceptor shall 모든 결제 관련 이벤트를 다음과 함께 기록한다:
   - 이벤트 유형 (PAYMENT_REQUEST, APPROVED, CANCELED 등)
   - 타임스탐프 (KST + UTC)
   - 가맹점 ID + 이름
   - 주문번호, 금액, 결과
   - 요청 IP, 처리 시간
   - 담당자 ID (관리자 작업 시)

2. The 감시 로그 shall 다음을 절대 기록하지 않는다:
   - 카드번호 전체 (마스킹: XXXX-XXXX-XXXX-1234)
   - CVV/CVC
   - PIN
   - 카드 자기띠 데이터

3. The 감시 로그 shall 5년간 보관되며, 삭제는 금지된다.

#### 15.2 유지보수 체크리스트

- [ ] 감시 로그 저장소 용량 모니터링 (월간)
- [ ] 감시 로그 암호화 상태 확인
- [ ] 감시 로그 접근 권한 감시 (분기별)

### Requirement 16: IP 화이트리스트 (완료 ✅)

**상태**: 구현 완료 (Sprint B.1)

#### 16.1 구현 확인 사항

1. The IP Whitelist Guard shall 가맹점 API 요청에 대해 다음을 검증한다:
   - 요청 IP가 등록된 화이트리스트에 포함되어 있는지
   - 미등록 IP 요청 시 거부

2. When 가맹점이 IP를 등록할 때, PG System shall:
   - IPv4 형식 검증
   - 중복 등록 방지
   - CIDR 범위 등록 지원 (선택)

#### 16.2 유지보수 체크리스트

- [ ] IP 등록 현황 감시 (분기별)
- [ ] 비활성 가맹점의 IP 화이트리스트 정리 (연간)

### Requirement 17: 웹훅 재시도 (완료 ✅)

**상태**: 구현 완료 (Sprint B.2)

#### 17.1 구현 확인 사항

1. The Webhook Retry Service shall 가맹점 웹훅 전송 실패 시 다음 간격으로 자동 재시도한다:
   - 1차: 즉시
   - 2차: 1분 후
   - 3차: 5분 후
   - 4차: 30분 후
   - 5차: 2시간 후

2. If 5회 재시도 모두 실패할 때, PG System shall:
   - 상태를 WEBHOOK_FAILED로 변경
   - 관리자에게 알림 (우선순위: 🟡)
   - 가맹점이 조회 API로 결과 확인 가능

#### 17.2 유지보수 체크리스트

- [ ] 웹훅 재시도 성공률 모니터링 (목표: > 99%)
- [ ] 가맹점별 웹훅 응답 시간 추적 (분기별)

### Requirement 18: BigInt 직렬화 (완료 ✅)

**상태**: 구현 완료 (Sprint A.1)

#### 18.1 구현 확인 사항

1. The BigIntSerializationInterceptor shall 모든 API 응답의 BigInt를 number로 변환한다:
   - DB: BigInt (64비트)
   - JSON 응답: number (정밀도 보장)

2. When JSON 응답을 생성할 때, Interceptor shall:
   - BigInt 필드를 자동으로 감지
   - number로 변환 (손실 없음, 최대 2^53-1)
   - 오류 시 에러 로그 기록

#### 18.2 유지보수 체크리스트

- [ ] BigInt 변환 성능 모니터링
- [ ] 장기 거래액 누적 시 BigInt 범위 확인 (연간)

### Requirement 19: 정산 배치 (완료 ✅)

**상태**: 구현 완료 (Sprint A.1)

#### 19.1 구현 확인 사항

1. The Settlement Batch Service shall 매일 오후 11시(KST)에 자동 실행되며:
   - APPROVED 상태의 당일 거래 집계
   - 가맹점/대리점별 수수료 계층 적용
   - 정산액 계산 + DB 기록

2. When 정산 배치 실행 중 오류가 발생할 때, PG System shall:
   - 자동 롤백 (DB 트랜잭션)
   - 관리자에게 알림 (우선순위: 🔴)
   - 다음 날 재실행 큐에 등록

#### 19.2 유지보수 체크리스트

- [ ] 정산 배치 실행 로그 분석 (주간)
- [ ] 정산액 정확도 검증 (월간)

### Requirement 20: CSP (Content Security Policy) (완료 ✅)

**상태**: 구현 완료 (프론트엔드 테스트 조정 중)

#### 20.1 구현 확인 사항

1. The PG System Web Frontend shall 다음 CSP 헤더를 설정한다:
   ```
   Content-Security-Policy:
     default-src 'self';
     script-src 'self' 'nonce-{RANDOM}';
     style-src 'self' 'nonce-{RANDOM}';
     img-src 'self' data: https:;
     font-src 'self';
     connect-src 'self' https://api.pg-system.com;
     frame-src 'none';
   ```

2. When 각 페이지를 로드할 때, 서버는:
   - 무작위 nonce 값을 생성
   - 모든 인라인 스크립트에 nonce 속성 추가
   - CSP 헤더에 nonce 포함

3. If CSP 위반이 감지될 때 (Content Security Policy 리포트):
   - 위반 내용을 보안 로그에 기록
   - 관리자에게 주간 리포트 발송

#### 20.2 유지보수 체크리스트

- [ ] CSP 위반 로그 검토 (주간)
- [ ] 외부 스크립트 추가 시 CSP 업데이트

---

## 공통 수용 기준 (모든 요구사항)

### Requirement 21: 포괄적 감시 및 알림

**적용 대상**: 모든 요구사항

#### 21.1 필수 감시 항목

1. The PG System shall 모든 결제 관련 작업에 대해 다음을 감시한다:
   - 작업 시작 시각
   - 작업 종료 시각
   - 처리 시간
   - 성공/실패 여부
   - 오류 코드 (실패 시)

2. When 감시 항목이 수집될 때, AuditService shall:
   - 모든 항목을 데이터베이스에 기록 (audit_logs 테이블)
   - 기록 삭제 금지 (설정: DELETE 권한 제거)
   - 5년 보관

#### 21.2 실시간 알림 규칙

1. The PG System shall 다음 상황에서 실시간 알림을 전송한다:

   | 상황 | 우선순위 | 채널 | 응답시간 |
   |------|---------|------|---------|
   | 시스템 장애 | 🔴 | Slack #pg-system-critical | 5분 |
   | FDS 차단 급증 | 🔴 | Slack | 5분 |
   | 금액 변조 감지 | 🔴 | Slack | 5분 |
   | 웹훅 최종 실패 | 🟡 | Slack #pg-system-alerts | 30분 |
   | 에러율 3% 초과 | 🟡 | Slack | 30분 |
   | 응답시간 5초 초과 | 🟡 | Slack | 30분 |
   | 일간 리포트 | 🟢 | Email | 9시 AM |

### Requirement 22: 보안 문제 상황 대응

**적용 대상**: 모든 요구사항

#### 22.1 보안 인사건트 절차

1. If 보안 문제가 감지될 때, PG System shall 다음 절차를 자동 실행한다:
   - 즉시 Slack #pg-system-critical에 알림
   - 영향받은 거래를 "검증 필요" 상태로 변경
   - 해당 가맹점/사용자에 통지 이메일 발송
   - 보안 팀에 상세 보고서 생성

2. When 보안 문제 조사가 완료될 때, PG System shall:
   - 근본 원인 분석(RCA) 문서 작성
   - 재발 방지 조치 구현
   - 영향받은 모든 당사자에게 해결 보고 발송

#### 22.2 데이터 유출 방지

1. The PG System shall 모든 민감 데이터에 대해 다음을 보장한다:
   - 저장 시: AES-256-GCM 암호화
   - 전송 시: TLS 1.3
   - 로그 기록 시: 자동 마스킹

2. If 민감 데이터가 로그에 기록될 위험이 감지될 때, PG System shall:
   - 해당 로그 항목을 자동으로 마스킹
   - 개발자에게 알림 (린트 경고)
   - 코드 리뷰 시 의무 확인 항목

---

## 테스트 및 검증 기준

### Requirement 23: E2E 테스트 커버리지

**적용 대상**: Layer 1~5 모든 구현

#### 23.1 필수 테스트 시나리오

1. The PG System shall 다음 E2E 시나리오를 Playwright로 검증한다:

   **정상 결제 흐름**
   - When 가맹점이 결제 요청 → 결제창 렌더링 → 카드 입력 → 토큰화 → 승인 → 완료

   **결제 실패 시나리오**
   - If 카드 잔액 부족 → 사용자 친화 메시지 표시
   - If 카드 유효기간 만료 → 카드 정보 입력 재요청
   - If FDS 거부 → 보안 정책 차단 메시지

   **동시성 및 부하**
   - While 동시 결제 요청 100건 → 모두 정상 처리

2. When E2E 테스트가 실행될 때, PG System shall:
   - 모든 시나리오 통과 확인
   - 통과율 100% 유지
   - 각 시나리오 실행 시간 기록 (성능 트렌드)

#### 23.2 성능 테스트

1. The PG System shall 다음 성능 목표를 충족해야 한다:

   | 지표 | 목표 | 측정 방법 |
   |------|------|---------|
   | 결제 API 응답시간 | < 3초 (p95) | 동시 100건 부하 |
   | 카드 토큰화 시간 | < 500ms | 단일 요청 |
   | 정산 배치 시간 | < 30분 | 일일 1000건 |
   | 웹훅 재시도 대기 | < 1초 (메모리) | 100건 동시 재시도 |

---

## 문서 및 참고자료

### Requirement 24: 요구사항 추적성

**적용 대상**: 모든 요구사항

#### 24.1 필수 문서

1. The PG System shall 다음 문서를 최신 상태로 유지한다:
   - `docs/DEFENSIVE_PROGRAMMING_PG_SYSTEM.md` — 5-Layer 방어 구조 설명
   - `docs/PRD.md` — 전체 시스템 설계
   - `PROGRESS.md` — 구현 진행 상황
   - `docs/learnings.md` — 에러 패턴 + 교훈
   - `.claude/rules/security.md` — 보안 코딩 체크리스트

2. When 새로운 요구사항이 추가될 때, PG System shall:
   - 해당 문서에 추가
   - 주석에 요구사항 ID 참조 (예: `// REQ-005`)
   - 깃 커밋에 요구사항 ID 포함

#### 24.2 추적성

1. The PG System shall 모든 코드 변경을 요구사항과 연결한다:
   - 깃 커밋 메시지: `feat(pg-gateway): REQ-001 VAN 어댑터 통합`
   - PR 설명: 요구사항 ID + 링크 포함
   - 코드 주석: 복잡한 로직에 요구사항 ID 기록

---

## 변경 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|---------|
| 1.0 | 2026-03-07 | 초판 — 5-Layer 방어 구조 기반 24개 요구사항 생성 |

---

*작성: Claude Code / 감수 대기*
