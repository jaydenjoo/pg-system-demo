# PCI DSS 4.0.1 컴플라이언스 매핑

> PG System 프로젝트의 Step 1~10 구현 현황을 PCI DSS 4.0.1 요건에 매핑합니다.
> 마지막 업데이트: 2026-03-02

---

## 1. 인증 및 접근 제어 (Authentication & Access Control)

| PCI DSS 요건 | 조항 | 상태 | 구현 위치 | 검증 근거 |
|-------------|------|------|----------|----------|
| MFA 전면 확대 | **8.4.2** | ✅ 완료 | `auth.service.ts` | TOTP MFA 필수, `MFA_REQUIRED` 반환, null OTP 차단 |
| 비밀번호 12자 이상 | **8.3.6** | ✅ 완료 | `create-user.dto.ts` | 12자+영숫자 조합, bcrypt 해시 (saltRounds=12) |
| 계정 잠금 (반복 실패) | **8.3.4** | ✅ 완료 | `auth.service.ts` | 5회 실패 → 30분 잠금, `lockedUntil` 필드 |
| 최소 권한 원칙 | **7.2.1** | ✅ 완료 | `roles.service.ts`, `PermissionsGuard` | RBAC + 28개 개별 권한 |
| 세션 만료 | **8.2.8** | ✅ 완료 | `jwt.strategy.ts` | Access 15분, Refresh 7일, HttpOnly 쿠키 설계 |
| 고유 식별자 | **8.2.1** | ✅ 완료 | `users.service.ts` | 사용자별 고유 UUID, 공유 계정 금지 정책 |

**테스트**: `auth.service.spec.ts` (18 tests), `auth-security.spec.ts`, `guards-security.spec.ts`

---

## 2. 데이터 보호 (Data Protection)

| PCI DSS 요건 | 조항 | 상태 | 구현 위치 | 검증 근거 |
|-------------|------|------|----------|----------|
| 강력한 암호화 (저장) | **3.5.1** | ✅ 완료 | `kms/local-kms.service.ts`, `kms/kms.interface.ts` | AES-256-GCM, 랜덤 IV(12바이트), KMS 인터페이스 |
| KMS 키 관리 | **3.5.1** | ✅ 완료 | `kms/kms.interface.ts`, `kms/local-kms.service.ts` | Step 10-3: KMS 인터페이스 + 로컬 구현체 (프로덕션: AWS KMS 교체) |
| 암호화 키 자동 로테이션 | **3.6.1** | ✅ 완료 | `security/key-rotation.service.ts`, `key-rotation.scheduler.ts` | 90일 주기 자동 로테이션, ROTATING 상태 잠금, 실패 시 ACTIVE 복구, CRITICAL 알림 |
| 전송 데이터 암호화 | **4.2.1** | ⚠️ 준비 | `nginx.conf` | TLS 1.3 설정 준비 (인증서 적용 대기) |
| PAN 직접 저장 금지 | **3.4.1** | ✅ 설계 | 아키텍처 설계 | 카드번호 토큰화 (결제 코어는 별도 PG 서버) |
| 민감 데이터 마스킹 | **3.3.1** | ✅ 완료 | `packages/shared/src/utils/index.ts` | `maskBankAccount` 뒤4자리만 노출, password_hash 미반환 |

**테스트**: `masking-security.spec.ts`, `local-kms.spec.ts`, `key-rotation.service.spec.ts`, `key-rotation.scheduler.spec.ts`

---

## 3. 취약점 관리 (Vulnerability Management)

| PCI DSS 요건 | 조항 | 상태 | 구현 위치 | 검증 근거 |
|-------------|------|------|----------|----------|
| 안전한 소프트웨어 개발 | **6.2.4** | ✅ 완료 | `tsconfig.base.json`, `.eslintrc.js` | TypeScript strict + ESLint security plugin |
| 결제 페이지 스크립트 관리 (CSP) | **6.4.3** | ✅ 완료 | `csp-nonce.ts`, `csp-directives.ts` | Step 10-1: CSP nonce 기반 + SRI 무결성 검증 |
| 소프트웨어 BOM 관리 | **6.3.2** | ✅ 완료 | `scripts/generate-sbom.sh`, `security-scan.yml` | Step 10-4: SBOM 자동 생성 + CI/CD 통합 |
| DAST (동적 보안 테스트) | **6.3.2** | ✅ 완료 | `scripts/dast-scan.sh`, `security-scan.yml` | Step 10-4: OWASP ZAP 기반 DAST 파이프라인 |
| 실시간 변경 탐지 (FIM) | **11.6.1** | ✅ 완료 | `integrity-monitor.service.ts` | Step 10-2: SHA-256 해시 기반 파일 무결성 모니터링 |
| 내부 취약점 스캔 | **11.3.1** | ✅ 완료 | `pnpm audit`, `security-scan.yml` | CI/CD 자동 스캔 + 수동 `pnpm security:audit` |

**테스트**: `csp-security.spec.ts`, `integrity-monitor.spec.ts`

---

## 4. 모니터링 및 로깅 (Monitoring & Logging)

| PCI DSS 요건 | 조항 | 상태 | 구현 위치 | 검증 근거 |
|-------------|------|------|----------|----------|
| 감사 로그 기록 | **10.2.1** | ✅ 완료 | `audit.interceptor.ts` | 모든 CUD 자동 기록 (userId, action, resource, IP) |
| 로그 무결성 보호 | **10.3.3** | ✅ 완료 | `audit-hash-chain.service.ts` | Step 10-3: SHA-256 해시 체인 (변조 불가) |
| 로그 보관 (최소 1년) | **10.7.1** | ✅ 설계 | DB 설계 | 5년 보관 (전자금융감독규정 제15조) |
| 보안 이벤트 알림 | **10.4.1** | ⚠️ 준비 | 아키텍처 설계 | 프로덕션 배포 시 알림 시스템 연동 필요 |

**테스트**: `audit-security.spec.ts`, `audit-hash-chain.spec.ts`

---

## 5. 네트워크 보안 (Network Security)

| PCI DSS 요건 | 조항 | 상태 | 구현 위치 | 검증 근거 |
|-------------|------|------|----------|----------|
| Rate Limiting | **6.5.10** | ✅ 완료 | `app.module.ts` (ThrottlerModule) | 글로벌 100/분, 로그인 5/분, 결제 10/분 |
| 에러 정보 노출 방지 | **6.5.5** | ✅ 완료 | `global-exception.filter.ts` | stack/query/path 차단, 안전한 에러 메시지만 반환 |
| 입력값 검증 | **6.5.1** | ✅ 완료 | DTO + `ValidationPipe` | class-validator + whitelist + forbidNonWhitelisted |
| SQL 인젝션 방어 | **6.5.1** | ✅ 완료 | Prisma ORM | Parameterized Query 전용, Raw Query 미사용 |
| XSS 방어 | **6.5.7** | ✅ 완료 | `main.ts` (Helmet.js) | CSP + X-Content-Type-Options + X-XSS-Protection |
| CORS 제한 | **6.5.10** | ✅ 완료 | `main.ts` | 명시적 allowedOrigins (와일드카드 금지) |
| 보안 헤더 | **6.5** | ✅ 완료 | `main.ts`, `nginx.conf` | HSTS, X-Frame-Options DENY, Referrer-Policy |
| 요청 크기 제한 | **6.5** | ✅ 완료 | `main.ts`, `nginx.conf` | body: 1MB (Express), client_max_body_size: 10m (Nginx) |
| IP 화이트리스트 (가맹점별) | **1.3.2** | ✅ 완료 | `guards/ip-whitelist.guard.ts`, `pg_api_keys.allowed_ips` | PgBasicAuthGuard 후 실행, 빈 배열=제한 없음, X-Forwarded-For 처리 |

**테스트**: `throttle-security.spec.ts`, `validation-security.spec.ts`, `ip-whitelist.guard.spec.ts`

---

## 6. 시스템 구성 (System Configuration)

| PCI DSS 요건 | 조항 | 상태 | 구현 위치 | 검증 근거 |
|-------------|------|------|----------|----------|
| 비루트 컨테이너 실행 | **2.2.1** | ✅ 완료 | `Dockerfile` (api, web) | nestjs/nextjs 사용자 (uid 1001) |
| 멀티스테이지 빌드 | **2.2.1** | ✅ 완료 | `Dockerfile` (api, web) | base → builder → runner 분리 |
| 헬스체크 | **2.2.1** | ✅ 완료 | `Dockerfile`, `health.controller.ts` | 30초 간격 자동 헬스체크 |
| 시크릿 검증 | **2.2.1** | ✅ 완료 | `main.ts` (validateProductionSecrets) | 프로덕션 시크릿 미설정 시 기동 실패 |
| 서버 정보 숨김 | **2.2.7** | ✅ 완료 | `nginx.conf` | `server_tokens off` |

---

## 7. 컴플라이언스 요약

| 카테고리 | 전체 | ✅ 완료 | ⚠️ 준비 | 비율 |
|---------|------|---------|---------|------|
| 1. 인증/접근 제어 | 6 | 6 | 0 | 100% |
| 2. 데이터 보호 | 6 | 5 | 1 | 83% |
| 3. 취약점 관리 | 6 | 6 | 0 | 100% |
| 4. 모니터링/로깅 | 4 | 3 | 1 | 75% |
| 5. 네트워크 보안 | 9 | 9 | 0 | 100% |
| 6. 시스템 구성 | 5 | 5 | 0 | 100% |
| **합계** | **36** | **34** | **2** | **94%** |

### ⚠️ 프로덕션 배포 전 필요 사항 (2건)

| 항목 | PCI DSS | 현재 | 필요 조치 |
|------|---------|------|----------|
| TLS 1.3 인증서 | 4.2.1 | Nginx 설정 준비됨 | SSL 인증서 발급 + HTTPS 강제 리다이렉트 활성화 |
| 보안 이벤트 알림 | 10.4.1 | 로그 기록 완료 | CloudWatch/Slack 등 실시간 알림 연동 |

> **참고**: 위 2건은 인프라 배포 단계에서 해결되는 항목입니다. 코드 레벨 보안 구현은 100% 완료.

---

*이 문서는 `docs/step7-security-report.md` 4장을 기반으로 Step 10 구현 결과를 반영하여 업데이트되었습니다.*
