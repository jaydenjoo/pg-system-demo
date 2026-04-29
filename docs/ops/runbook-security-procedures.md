# 보안 절차 매뉴얼 (Security Procedures Runbook)

> **문서 버전**: 1.0
> **최종 수정**: 2026-03-01
> **작성 근거**: PCI DSS 4.0.1 / 전자금융감독규정 / 개인정보보호법
> **대상**: 시스템 관리자, 보안 담당자, 운영팀

---

## 1. 일일 보안 점검 체크리스트 (PCI DSS 기반)

### 1.1 매일 아침 점검 (09:00)

| # | 점검 항목 | PCI DSS | 확인 방법 | 합격 기준 |
|---|----------|---------|----------|----------|
| 1 | FIM 검사 결과 확인 | 11.6.1 | API: `GET /api/v1/security/integrity/status` | status=PASS, changedFiles=0 |
| 2 | 감사 로그 해시 체인 무결성 | 10.5.5 | API: `GET /api/v1/security/audit-chain/verify?startDate={어제}&endDate={오늘}` | valid=true |
| 3 | 리스크 알림 확인 | 10.6.1 | API: `GET /api/v1/security/risk-alerts?status=OPEN` | 미해결 건 처리 |
| 4 | 로그인 실패 현황 | 8.3.4 | API: `GET /api/v1/security/login-history?result=FAILED&period=24h` | 비정상 패턴 없음 |
| 5 | 서비스 헬스체크 | 12.10.1 | `curl https://{domain}/api/v1/health` | status=ok |
| 6 | TLS 인증서 만료일 확인 | 4.2.1 | `openssl s_client -connect {domain}:443 2>/dev/null \| openssl x509 -noout -dates` | 만료까지 30일 이상 |
| 7 | 디스크 사용량 확인 | 운영 | `docker exec pg-api df -h /` | 사용률 80% 미만 |
| 8 | 컨테이너 상태 확인 | 운영 | `docker compose ps` | 모든 서비스 healthy |

### 1.2 주간 점검 (매주 월요일)

| # | 점검 항목 | PCI DSS | 절차 |
|---|----------|---------|------|
| 1 | npm audit 취약점 점검 | 6.3.3 | `cd apps/api && npm audit` / `cd apps/web && npm audit` |
| 2 | Docker 이미지 취약점 스캔 | 6.3.1 | `docker scout cves pg-api:latest` |
| 3 | 비활성 계정 점검 | 8.1.4 | 90일 이상 미로그인 계정 조회 → 비활성화 |
| 4 | 실패 로그인 패턴 분석 | 8.3.4 | 주간 로그인 실패 추세, IP 분포 확인 |
| 5 | 감사 로그 용량 확인 | 10.5.1 | 로그 테이블 사이즈 및 증가 추세 |

### 1.3 월간 점검 (매월 첫째 주)

| # | 점검 항목 | PCI DSS | 절차 |
|---|----------|---------|------|
| 1 | 사용자 권한 전수 점검 | 7.1.1 | 전체 계정 권한 목록 추출 → 불필요 권한 제거 |
| 2 | 수수료 계층 위반 점검 | 비즈니스 | 정산 매뉴얼 쿼리 6.6 실행 |
| 3 | 패스워드 정책 준수 확인 | 8.3.6 | 12자 미만 비밀번호 사용자 없는지 확인 |
| 4 | MFA 활성화 현황 | 8.4.2 | 관리자급 계정 MFA 미활성화 여부 확인 |
| 5 | DB 접근 로그 리뷰 | 10.2.1 | PostgreSQL pg_stat_activity 기록 검토 |

---

## 2. 계정 관리 절차

### 2.1 신규 계정 생성

```
┌─────────────────────────────────────────┐
│          신규 계정 생성 절차             │
├─────────────────────────────────────────┤
│                                         │
│  1. 계정 생성 요청서 접수                │
│     └─ 요청자, 사유, 필요 권한 명시      │
│                                         │
│  2. 승인자 확인                          │
│     ├─ 일반 사용자: 팀장 승인            │
│     ├─ 관리자: CTO 승인                  │
│     └─ 슈퍼관리자: CEO + CTO 공동 승인   │
│                                         │
│  3. 계정 생성 (최소 권한 원칙)           │
│     ├─ POST /api/v1/users               │
│     ├─ 역할(role)에 따른 기본 권한만 부여 │
│     └─ 초기 비밀번호 안전 전달           │
│                                         │
│  4. MFA 설정 안내                        │
│     ├─ POST /api/v1/auth/mfa/setup      │
│     └─ TOTP 앱 등록 + 검증              │
│                                         │
│  5. 감사 로그 기록                       │
│     └─ action=USER_CREATE 자동 기록      │
│                                         │
│  6. 승인 증적 보관 (5년)                 │
│                                         │
└─────────────────────────────────────────┘
```

**역할별 기본 권한**:

| 역할 | 기본 권한 |
|------|----------|
| ADMIN (관리자) | 전체 권한 (system:manage 포함) |
| AGENT_ADMIN (대리점 관리자) | agent:read, merchant:read/create/update, transaction:read, settlement:read, commission:read |
| MERCHANT_USER (가맹점 사용자) | transaction:read (자기 가맹점만), settlement:read (자기 가맹점만) |
| AUDITOR (감사) | audit:read, risk:read, transaction:read, settlement:read (읽기 전용) |

### 2.2 권한 변경

```
권한 변경 절차:

1. 변경 요청
   └─ 사유, 추가/제거 권한 목록 명시

2. 승인
   ├─ 권한 축소: 팀장 승인
   └─ 권한 확대: CTO 승인 필수

3. 변경 실행
   └─ PATCH /api/v1/users/{userId}/permissions

4. 변경 내역 기록
   └─ action=PERMISSION_CHANGE, detail에 before/after 기록

5. 변경 후 확인
   └─ 해당 사용자에게 변경 사실 안내
```

### 2.3 퇴직자 계정 처리

```
퇴직 통보 접수 후 즉시 (최대 영업일 기준 당일):

1. 계정 비활성화
   ├─ PATCH /api/v1/users/{userId} → status=WITHDRAWN
   └─ 로그인 즉시 차단

2. 활성 세션 종료
   └─ refresh_tokens 테이블에서 해당 사용자 토큰 전부 삭제

3. MFA 해제
   └─ user_mfa 레코드 비활성화

4. 권한 회수
   └─ 모든 권한 제거 (역할 유지, 권한만 빈 배열)

5. 접근 기록 보존
   └─ 감사 로그는 삭제하지 않음 (5년 보관 의무)

6. 퇴직 처리 기록
   └─ action=USER_DEACTIVATE, detail에 사유 기록

주의:
  - 계정 자체를 DELETE하지 않음 (soft delete: deleted_at 기록)
  - 퇴직자가 생성/수정한 데이터는 보존
  - 30일 후 재활성화 불가 안내
```

### 2.4 비밀번호 리셋

```
비밀번호 리셋 절차:

1. 본인 확인
   ├─ MFA 활성화된 계정: MFA 코드 확인으로 본인 검증
   └─ MFA 미활성화: 신분증 + 사내 메일 확인

2. 임시 비밀번호 발급
   └─ 최소 16자 랜덤 생성, 안전한 채널로 전달

3. 즉시 변경 요구
   └─ 로그인 후 POST /api/v1/auth/password/change 강제
   └─ 정책: 12자 이상, 대소문자+숫자+특수문자

4. 감사 로그 기록
   └─ action=PASSWORD_RESET, 요청자/승인자/대상자 기록

5. 기존 세션 전부 종료
   └─ refresh_tokens 전부 삭제 → 재로그인 강제
```

---

## 3. 보안 사고 대응 절차

### 3.1 카드번호/개인정보 유출 의심

```
┌──────────────────────────────────────────────────┐
│          카드번호/개인정보 유출 대응               │
├──────────────────────────────────────────────────┤
│                                                  │
│  ■ 즉시 (발견 후 30분 이내)                       │
│  1. 보안 담당자에게 즉시 보고                      │
│  2. 유출 범위 초동 확인                            │
│     └─ 어떤 데이터가, 몇 건, 어느 기간             │
│  3. 유출 경로 차단                                │
│     ├─ 의심 계정 즉시 잠금                        │
│     ├─ 의심 IP 차단 (nginx deny)                  │
│     └─ 관련 API 키/토큰 즉시 폐기                 │
│                                                  │
│  ■ 1시간 이내                                    │
│  4. CTO + 경영진 보고                             │
│  5. 포렌식 데이터 보존                             │
│     ├─ 관련 감사 로그 추출 및 백업                  │
│     ├─ 해시 체인 무결성 검증                       │
│     ├─ DB 접근 로그 보존                          │
│     └─ 네트워크 패킷 캡처 (가능 시)                │
│                                                  │
│  ■ 법적 의무 (24시간 이내)                        │
│  6. 규제 기관 통보                                 │
│     ├─ 금융감독원 (전자금융감독규정 제32조)         │
│     ├─ 개인정보보호위원회 (개인정보보호법 제34조)    │
│     └─ 한국인터넷진흥원 KISA (정보통신망법 제27조)   │
│  7. 카드사 통보                                   │
│     └─ PCI DSS 12.10.1 사고 보고 의무              │
│                                                  │
│  ■ 72시간 이내                                    │
│  8. 피해자(정보주체) 통지                          │
│     └─ 유출 내용, 시점, 대응 조치, 피해 구제 방법   │
│  9. 상세 조사 보고서 작성                          │
│  10. 재발 방지 대책 수립 및 이행                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**중요**: 본 시스템은 카드번호를 직접 저장하지 않음 (토큰화).
유출 의심 시 토큰화 서비스 측 확인도 병행 필요.

### 3.2 무단 접근 탐지

```
무단 접근 징후:
  ├─ 비정상 시간대 로그인 (새벽 2~5시)
  ├─ 해외 IP 로그인 (국내 전용 서비스)
  ├─ 동일 계정 다중 IP 동시 접속
  ├─ 권한 외 리소스 접근 시도 (403 다발)
  └─ 대량 데이터 조회 (단시간 API 호출 폭증)

대응 절차:

1. 탐지
   └─ 리스크 알림 또는 로그인 이력에서 발견

2. 즉시 조치
   ├─ 의심 계정 잠금: PATCH /users/{id} → status=LOCKED
   ├─ 활성 세션 종료: refresh_tokens 삭제
   └─ 의심 IP 차단

3. 조사
   ├─ 해당 계정의 감사 로그 전수 검토
   ├─ 접근한 데이터 범위 확인
   └─ 접근 방법 분석 (비밀번호 유출? 세션 탈취?)

4. 후속 조치
   ├─ 계정 소유자 연락 및 본인 확인
   ├─ 비밀번호 강제 리셋
   ├─ MFA 재설정
   └─ 필요 시 법적 조치

5. 기록
   └─ 사고 보고서 작성 (Post-mortem 템플릿 활용)
```

### 3.3 DDoS 공격 대응

```
장애 대응 매뉴얼 §5.5 참조 (runbook-incident-response.md)

추가 보안 관점 절차:
1. 공격 트래픽 패턴 분석 및 기록
2. 공격 소스 IP 대역 분석
3. 한국인터넷진흥원(KISA) DDoS 대피소 활용 검토
4. CDN/WAF 긴급 적용
5. 공격 종료 후 보안 보고서 작성
```

---

## 4. 로그 리뷰 절차

### 4.1 감사 로그 리뷰

**리뷰 주기**: 매일 1회 (오전 점검 시)
**PCI DSS 근거**: 10.6.1 (로그 리뷰 매일 수행)

```
리뷰 대상 (우선순위):

1. 관리자 활동 로그
   └─ action IN ('USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
                  'PERMISSION_CHANGE', 'PASSWORD_RESET')
   └─ 승인 없는 계정/권한 변경 여부 확인

2. 정산 활동 로그
   └─ action IN ('SETTLEMENT_CALCULATE', 'SETTLEMENT_CONFIRM',
                  'SETTLEMENT_COMPLETE')
   └─ 비정상 시간 정산 처리 여부 확인

3. 수수료 변경 로그
   └─ action IN ('COMMISSION_UPDATE', 'PG_MARGIN_UPDATE')
   └─ 무단 수수료율 변경 여부 확인

4. 보안 이벤트 로그
   └─ action IN ('FIM_ALERT', 'RISK_ALERT', 'USER_LOGIN_FAILED',
                  'ACCOUNT_LOCKED')
   └─ 보안 위협 징후 확인
```

**리뷰 절차**:

```
GET /api/v1/security/audit-logs
  ?startDate={어제 09:00}
  &endDate={오늘 09:00}
  &limit=100

1. 전체 건수 확인 → 평소 대비 급증/급감 여부
2. 위 4개 우선순위 카테고리별 필터링 검토
3. 이상 건 발견 시:
   ├─ 관련 담당자에게 확인
   ├─ 정당한 활동이면 기록 종료
   └─ 무단 활동이면 보안 사고 대응 절차 (§3) 진입
4. 리뷰 완료 기록 (일일 보안 점검표에 서명)
```

### 4.2 로그인 이력 리뷰

```
GET /api/v1/security/login-history
  ?period=24h

확인 사항:
1. 실패 로그인 빈도 (정상: 일 10건 미만)
2. 잠금 계정 목록 확인
3. 새벽 시간대 성공 로그인 (자동화 제외)
4. 해외 IP 로그인 여부
5. 동일 IP에서 다수 계정 시도 (크리덴셜 스터핑 징후)
```

### 4.3 해시 체인 검증

```
GET /api/v1/security/audit-chain/verify
  ?startDate={전일}
  &endDate={금일}

결과:
  valid=true  → 정상 (무결성 유지)
  valid=false → 즉시 대응 필요
    └─ brokenAt 값으로 변조 지점 확인
    └─ 장애 대응 매뉴얼 §5.7 참조
```

---

## 5. 패치/업데이트 적용 절차

### 5.1 정기 패치 (매월 첫째 화요일)

```
정기 패치 절차:

1. 사전 준비 (패치 적용 1주 전)
   ├─ npm audit 결과 분석
   ├─ 업데이트 대상 패키지 목록 작성
   ├─ 변경 사항(CHANGELOG) 검토
   └─ 호환성 영향 분석

2. 테스트 환경 적용 (패치 3일 전)
   ├─ 개발 환경에서 npm update 실행
   ├─ 전체 테스트 스위트 실행
   │   └─ tsc --noEmit && eslint . && npm run build && npm test
   ├─ E2E 테스트 실행
   └─ 결과 기록

3. 승인 (패치 1일 전)
   ├─ 패치 내역 + 테스트 결과 CTO 보고
   └─ 적용 승인 획득

4. 프로덕션 적용 (패치 당일)
   ├─ 백업 실행 (DB + 코드)
   ├─ 점검 시간 공지 (가맹점에 사전 안내)
   ├─ 순차 배포 (api → web → nginx)
   │   └─ docker compose build --no-cache
   │   └─ docker compose up -d
   ├─ 헬스체크 확인
   └─ 이상 시 즉시 롤백

5. 사후 확인 (패치 당일 + 1일)
   ├─ 서비스 정상 동작 확인
   ├─ 에러 로그 모니터링
   └─ 패치 완료 보고
```

### 5.2 비상 패치 (긴급 보안 취약점)

```
CVSS 7.0 이상 또는 Known Exploit 존재 시:

1. 즉시 취약점 영향 분석 (1시간 이내)
   ├─ 해당 패키지 사용 여부 확인
   ├─ 공격 가능 경로 확인
   └─ 임시 완화 조치 적용 (가능 시)

2. 테스트 환경 긴급 적용 (4시간 이내)
   ├─ 취약 패키지 업데이트
   ├─ 핵심 테스트만 실행
   └─ 기능 영향 최소 확인

3. CTO 긴급 승인

4. 프로덕션 긴급 적용
   ├─ 정산 미실행 시간대에 적용 (권장: 17:00 이후)
   ├─ 롤백 계획 준비
   └─ 적용 후 1시간 집중 모니터링

5. 사후 보고 (24시간 이내)
   └─ 취약점 내용, 영향, 조치 사항, 재발 방지
```

### 5.3 OS/Docker 기반 이미지 업데이트

```
Node.js 또는 Alpine Linux 보안 업데이트 시:

1. Dockerfile의 베이스 이미지 버전 확인
   └─ node:20-alpine (현재)

2. 신규 버전 보안 패치 내역 확인
   └─ https://nodejs.org/en/blog/vulnerability/

3. 테스트 환경에서 빌드 + 테스트
   └─ docker compose build --no-cache
   └─ docker compose up -d
   └─ 전체 테스트 실행

4. 이미지 스캔
   └─ docker scout cves {image}:latest

5. 프로덕션 적용 (정기 패치 절차 동일)
```

---

## 6. 인증서/키 갱신 절차

### 6.1 TLS 인증서 갱신

```
만료 30일 전 시작:

1. 인증서 만료일 확인
   └─ openssl s_client -connect {domain}:443 2>/dev/null | \
      openssl x509 -noout -enddate

2. 새 인증서 발급
   ├─ Let's Encrypt: certbot renew
   └─ 상용 인증서: CSR 생성 → 인증기관 제출 → 발급

3. 인증서 파일 교체
   └─ infra/nginx/ssl/cert.pem + key.pem 교체
   └─ 파일 권한: 600 (소유자만 읽기)

4. Nginx 재시작
   └─ docker compose exec nginx nginx -s reload

5. 검증
   ├─ openssl s_client -connect {domain}:443 (새 인증서 확인)
   ├─ TLS 1.3 프로토콜 확인
   └─ curl -I https://{domain} (정상 응답)

6. 감사 로그 기록
   └─ action=TLS_CERT_RENEWAL
```

### 6.2 JWT 서명 키 로테이션

```
로테이션 주기: 분기 1회 (또는 유출 의심 시 즉시)

1. 새 JWT 시크릿 생성
   └─ openssl rand -base64 64

2. 환경변수 업데이트
   ├─ JWT_ACCESS_SECRET → 새 값
   └─ JWT_REFRESH_SECRET → 새 값
   └─ KMS/Vault에서 관리 시 해당 시스템에서 변경

3. 서비스 재시작
   └─ docker compose restart api

4. 영향
   ├─ 기존 Access Token: 15분 이내 자동 만료 → 영향 최소
   └─ 기존 Refresh Token: 전부 무효화 → 전체 사용자 재로그인

5. 사전 공지
   └─ 관리자에게 재로그인 필요 안내 (로테이션 전)

6. 감사 로그
   └─ action=JWT_KEY_ROTATION
```

### 6.3 암호화 키(AES-256) 로테이션

```
로테이션 주기: 연 1회 (또는 유출 의심 시 즉시)

주의: 암호화 키 변경 시 기존 암호화 데이터 복호화 불가 위험!

1. 키 로테이션 계획 수립
   ├─ 현재 키로 암호화된 데이터 목록 파악
   │   └─ MFA 시크릿 (user_mfa 테이블)
   │   └─ 기타 암호화 필드
   └─ 로테이션 소요 시간 예측

2. 신규 키 생성
   └─ openssl rand -hex 32 (64자 hex = 256비트)

3. 마이그레이션 실행
   ├─ 기존 키로 전체 데이터 복호화
   ├─ 신규 키로 전체 데이터 재암호화
   └─ 트랜잭션으로 원자성 보장

4. 환경변수 교체
   └─ ENCRYPTION_KEY → 신규 키
   └─ MFA_ENCRYPTION_KEY → 신규 키 (MFA용 별도 키인 경우)

5. 서비스 재시작 + 검증
   └─ MFA 로그인 테스트
   └─ 암호화/복호화 정상 동작 확인

6. 기존 키 안전 폐기
   └─ KMS/Vault에서 이전 키 버전 비활성화
   └─ 복구 기간(90일) 후 완전 삭제

7. 감사 로그
   └─ action=ENCRYPTION_KEY_ROTATION
```

---

## 7. FIM (파일 무결성 모니터링) 알림 대응

### 7.1 FIM 알림 수신 시

```
FIM 검사 결과 status=FAIL 시:

1. 변경 내역 확인
   └─ GET /api/v1/security/integrity/status
   └─ changedFiles, newFiles, deletedFiles 목록 확인

2. 변경 원인 분류
   ├─ 예상된 변경 (배포, 패치, 설정 변경)
   │    └─ 배포 담당자 확인
   │    └─ 변경 승인 기록 확인
   │    └─ 정당한 변경이면 베이스라인 갱신 (Step 4)
   │
   └─ 예상 외 변경 (무단 수정 의심)
        └─ 즉시 보안 사고 대응 절차 (§3.2) 진입
        └─ 변경된 파일 내용 분석
        └─ 감사 로그에서 관련 활동 추적

3. 상세 분석
   ├─ 변경 파일별 diff 확인
   ├─ 변경 시각과 감사 로그 교차 확인
   └─ 컨테이너 내부 접속 기록 확인

4. 베이스라인 갱신 (정당한 변경 확인 후)
   └─ POST /api/v1/security/integrity/baseline
   └─ 권한: system:manage 필요

5. 감사 로그 기록
   └─ action=FIM_BASELINE_UPDATE, detail에 사유 기록
```

### 7.2 감시 대상 파일 목록

| 우선순위 | 파일 | 변경 사유 |
|---------|------|----------|
| CRITICAL | `apps/api/dist/main.js` | 배포 시에만 변경 |
| CRITICAL | `apps/api/prisma/schema.prisma` | DB 스키마 변경 시에만 |
| CRITICAL | `infra/nginx/nginx.conf` | 설정 변경 시에만 |
| CRITICAL | `docker-compose.yml` | 인프라 변경 시에만 |
| HIGH | `apps/api/dist/**/*.js` | 배포 시에만 |
| MEDIUM | `.github/workflows/*.yml` | CI/CD 변경 시에만 |

---

## 8. 분기별 보안 감사 체크리스트

### 8.1 PCI DSS 4.0.1 준수 점검

| # | 요구사항 | PCI DSS | 확인 방법 | 상태 |
|---|---------|---------|----------|------|
| 1 | 카드번호 비저장 확인 | 3.4.1 | 코드 + DB 전수 검색 | [ ] |
| 2 | 전송 암호화 (TLS 1.3) | 4.2.1 | `openssl s_client` 프로토콜 확인 | [ ] |
| 3 | 취약 암호화 미사용 | 4.2.1 | 허용 cipher suite만 사용 확인 | [ ] |
| 4 | 안전한 개발 (SDLC) | 6.2.1 | 코드 리뷰 기록, 테스트 커버리지 | [ ] |
| 5 | 최소 권한 적용 | 7.1.1 | 전체 계정 권한 감사 | [ ] |
| 6 | MFA 활성화 | 8.4.2 | 관리자 계정 MFA 100% | [ ] |
| 7 | 비밀번호 정책 | 8.3.6 | 12자 이상, 복잡도, 90일 변경 | [ ] |
| 8 | 로그인 실패 잠금 | 8.3.4 | 5회 실패 시 30분 잠금 | [ ] |
| 9 | 감사 로그 기록 | 10.2.1 | 모든 주요 활동 기록 확인 | [ ] |
| 10 | 감사 로그 보호 | 10.5.1 | 해시 체인 무결성, 삭제 불가 | [ ] |
| 11 | 일일 로그 리뷰 | 10.6.1 | 리뷰 기록 존재 확인 | [ ] |
| 12 | FIM 운영 | 11.6.1 | 정기 검사 동작 + 알림 대응 기록 | [ ] |
| 13 | 사고 대응 계획 | 12.10.1 | 매뉴얼 존재 + 연락망 최신화 | [ ] |
| 14 | 보안 인식 교육 | 12.6.1 | 분기별 교육 기록 | [ ] |

### 8.2 전자금융감독규정 점검

| # | 요구사항 | 조항 | 확인 방법 | 상태 |
|---|---------|------|----------|------|
| 1 | 전산 사고 보고 체계 | 제32조 | 보고 절차 + 연락망 확인 | [ ] |
| 2 | 전자금융 거래기록 보존 | 제12조 | 5년 이상 보관 확인 | [ ] |
| 3 | 접근 통제 | 제15조 | 업무별 접근 권한 분리 | [ ] |
| 4 | 정보보호 교육 | 제9조 | 연 1회 이상 교육 | [ ] |
| 5 | 재해 복구 체계 | 제21조 | 복구 절차 + 연 1회 모의훈련 | [ ] |

### 8.3 감사 결과 보고

```
분기 보안 감사 보고서 구성:

1. 감사 개요
   ├─ 감사 기간
   ├─ 감사 범위
   └─ 감사 인원

2. 점검 결과 요약
   ├─ 총 점검 항목 수
   ├─ 적합 / 부적합 / 해당없음
   └─ 위험도별 분류 (Critical/High/Medium/Low)

3. 부적합 항목 상세
   ├─ 항목별 현황
   ├─ 위험 영향 분석
   └─ 권고 조치 사항

4. 개선 계획
   ├─ 단기 조치 (1개월 이내)
   ├─ 중기 조치 (분기 이내)
   └─ 장기 조치 (연내)

5. 이전 감사 지적 사항 이행 현황

보고 대상: CTO → CEO → 이사회 (필요 시)
```

---

## 8.4 보안 사고 Post-mortem 템플릿

> 모든 P0~P2 보안 사고 종료 후 **5 영업일 이내** 작성 필수 (PCI DSS 12.10.6)

```markdown
# 보안 사고 Post-mortem 보고서

## 기본 정보

| 항목 | 내용 |
|------|------|
| 보고서 ID | SEC-PM-YYYY-NNN |
| 사고 등급 | P0 / P1 / P2 |
| 사고 유형 | 카드정보유출 / 무단접근 / DDoS / 맬웨어 / 기타 |
| 발생 일시 | YYYY-MM-DD HH:MM |
| 감지 일시 | YYYY-MM-DD HH:MM (발생~감지 소요시간: _분) |
| 종료 일시 | YYYY-MM-DD HH:MM (감지~종료 소요시간: _분) |
| 작성자 | (보안 담당자명) |
| 검토자 | (CTO / 보안 책임자) |

## 영향 범위

| 항목 | 상세 |
|------|------|
| 영향받은 시스템 | (서버/서비스/DB명 나열) |
| 영향받은 데이터 | (유형, 건수, 민감도 등급) |
| 영향받은 사용자 | (가맹점/대리점/관리자 수) |
| 서비스 중단 시간 | _시간 _분 (SLA 위반 여부: Y/N) |
| 금전적 피해 | (추정 금액, 산출 근거) |

## 타임라인

| 시각 | 이벤트 | 조치자 |
|------|--------|--------|
| HH:MM | (최초 이상 징후 감지) | - |
| HH:MM | (사고 확인 및 에스컬레이션) | - |
| HH:MM | (초기 대응 시작) | - |
| HH:MM | (격리/차단 완료) | - |
| HH:MM | (복구 완료) | - |
| HH:MM | (사고 종료 선언) | - |

## 근본 원인 분석

### 직접 원인
(사고를 직접적으로 야기한 기술적 원인)

### 근본 원인
(직접 원인이 발생하게 된 구조적/프로세스적 원인)

### 기여 요인
- (사고 확대에 기여한 요인 1)
- (사고 확대에 기여한 요인 2)

## 대응 평가

### 잘된 점 (What Went Well)
- (효과적이었던 대응 조치)
- (보안 통제가 제대로 작동한 부분)

### 개선 필요 (What Needs Improvement)
- (대응 지연 또는 누락 사항)
- (탐지/알림 미흡 사항)

### 행운 요인 (Where We Got Lucky)
- (우연히 피해가 줄어든 요인 — 의존하면 안 됨)

## 규정 보고 현황

| 보고 대상 | 보고 일시 | 보고 내용 | 상태 |
|----------|----------|----------|------|
| 금융감독원 | - | 전산사고 보고서 | 미보고/보고완료 |
| KISA | - | 개인정보 유출 신고 | 해당없음/보고완료 |
| 카드사 | - | 카드정보 유출 통보 | 해당없음/보고완료 |
| 이용자 통지 | - | 유출 사실 고지 | 해당없음/완료 |

## 재발 방지 조치

| # | 조치 항목 | 우선순위 | 담당 | 기한 | 상태 |
|---|----------|---------|------|------|------|
| 1 | (기술적 조치 — 패치/설정 변경) | P0 | - | - | 미착수 |
| 2 | (프로세스 조치 — 절차 개선) | P1 | - | - | 미착수 |
| 3 | (모니터링 강화 — 알림/탐지 규칙 추가) | P1 | - | - | 미착수 |
| 4 | (교육/훈련 — 유사 사고 대응 훈련) | P2 | - | - | 미착수 |

## 서명

| 역할 | 성명 | 서명일 |
|------|------|--------|
| 작성자 | - | - |
| 보안 책임자 | - | - |
| CTO | - | - |
| CEO (P0 시) | - | - |
```

---

## 9. 비상 연락망

| 역할 | 담당 | 연락처 | 비상 시 |
|------|------|--------|--------|
| 보안 담당자 | (미지정) | - | 1순위 |
| CTO | (미지정) | - | 2순위 |
| CEO | (미지정) | - | 3순위 (P0 시) |
| 금융감독원 IT보안팀 | - | 02-3145-5114 | 전산사고 보고 |
| KISA 인터넷침해대응센터 | - | 118 | 사이버 공격 신고 |
| 카드사 보안팀 | (계약 후 기입) | - | 카드정보 유출 시 |
| PG사 보안 담당 | (계약 후 기입) | - | PG 연동 보안 이슈 |

---

## 부록: 보안 관련 명령어 모음

### A. 인증서 관련

```bash
# TLS 인증서 만료일 확인
openssl s_client -connect {domain}:443 2>/dev/null | \
  openssl x509 -noout -enddate

# 인증서 상세 정보
openssl s_client -connect {domain}:443 2>/dev/null | \
  openssl x509 -noout -text

# TLS 프로토콜 버전 확인
openssl s_client -connect {domain}:443 -tls1_3 2>/dev/null | \
  head -5

# Cipher suite 확인
openssl s_client -connect {domain}:443 2>/dev/null | \
  grep "Cipher"
```

### B. 컨테이너 보안

```bash
# 컨테이너 실행 사용자 확인 (non-root 검증)
docker compose exec api whoami
docker compose exec web whoami

# 컨테이너 프로세스 확인
docker compose exec api ps aux

# Docker 이미지 취약점 스캔
docker scout cves pg-api:latest
docker scout cves pg-web:latest

# 불필요 포트 노출 확인
docker compose ps --format "{{.Name}}: {{.Ports}}"
```

### C. DB 보안

```bash
# 현재 DB 접속 세션 확인
docker compose exec db psql -U pg_admin -d pg_system -c \
  "SELECT pid, usename, client_addr, state, query_start FROM pg_stat_activity WHERE state='active';"

# DB 사용자 권한 확인
docker compose exec db psql -U pg_admin -d pg_system -c \
  "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY grantee;"

# 민감 테이블 접근 로그 (pg_audit 설치 시)
# SELECT * FROM pgaudit.log WHERE table_name IN ('users', 'user_mfa', 'refresh_tokens');
```

### D. 네트워크 보안

```bash
# 현재 연결 상태 확인
docker compose exec nginx netstat -an | grep ESTABLISHED | wc -l

# 보안 헤더 확인
curl -s -I https://{domain} | grep -iE "(strict-transport|x-frame|x-content|content-security|x-xss)"

# Rate limiting 테스트 (주의: 프로덕션에서 주의하여 사용)
# for i in $(seq 1 10); do curl -o /dev/null -s -w "%{http_code}\n" https://{domain}/api/v1/auth/login; done
```
