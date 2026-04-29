# 외부 감사 체크리스트 (External QSA Audit Checklist)

> PCI DSS 4.0.1 외부 감사(QSA) 대응을 위한 증적 목록입니다.
> `pnpm security:evidence` 명령으로 자동 수집 가능한 항목을 포함합니다.
> 마지막 업데이트: 2026-03-02

---

## 증적 목록 (22개 항목)

### A. 인증 및 접근 제어 (PCI DSS Req. 7, 8)

| # | 증적 항목 | PCI DSS | 파일/위치 | 수집 방법 |
|---|----------|---------|----------|----------|
| A-1 | MFA(TOTP) 구현 코드 | 8.4.2 | `apps/api/src/modules/auth/auth.service.ts` | 소스코드 리뷰 |
| A-2 | 비밀번호 정책 (12자+영숫자) | 8.3.6 | `apps/api/src/modules/users/dto/create-user.dto.ts` | 소스코드 리뷰 |
| A-3 | 계정 잠금 정책 (5회/30분) | 8.3.4 | `apps/api/src/modules/auth/auth.service.ts` | 소스코드 리뷰 |
| A-4 | RBAC 권한 모델 | 7.2.1 | `apps/api/src/modules/users/roles.service.ts` | 소스코드 리뷰 |
| A-5 | 인증 테스트 결과 | 8.x | `reports/evidence/*/05_test_results.txt` | `pnpm security:evidence` |

### B. 데이터 보호 (PCI DSS Req. 3, 4)

| # | 증적 항목 | PCI DSS | 파일/위치 | 수집 방법 |
|---|----------|---------|----------|----------|
| B-1 | AES-256-GCM 암호화 구현 | 3.5.1 | `apps/api/src/modules/security/kms/local-kms.service.ts` | 소스코드 리뷰 |
| B-2 | KMS 인터페이스 | 3.5.1 | `apps/api/src/modules/security/kms/kms.interface.ts` | 소스코드 리뷰 |
| B-3 | 민감 데이터 마스킹 | 3.3.1 | `packages/shared/src/utils/index.ts` (`maskBankAccount`, `maskCardNumber`) | 소스코드 리뷰 |
| B-4 | TLS 설정 (Nginx) | 4.2.1 | `infra/nginx/nginx.conf` | `pnpm security:evidence` |
| B-5 | 암호화 키 자동 로테이션 (90일) | 3.6.1 | `apps/api/src/modules/security/key-rotation.service.ts`, `key-rotation.scheduler.ts` | 소스코드 리뷰 |
| B-6 | 키 로테이션 테스트 결과 | 3.6.1 | `apps/api/src/modules/security/__tests__/key-rotation.service.spec.ts`, `key-rotation.scheduler.spec.ts` | `pnpm test` |

### C. 취약점 관리 (PCI DSS Req. 6, 11)

| # | 증적 항목 | PCI DSS | 파일/위치 | 수집 방법 |
|---|----------|---------|----------|----------|
| C-1 | CSP + SRI 구현 | 6.4.3 | `apps/web/src/lib/csp-nonce.ts`, `csp-directives.ts` | 소스코드 리뷰 |
| C-2 | SBOM (의존성 목록) | 6.3.2 | `reports/sbom/` | `pnpm security:sbom` |
| C-3 | 의존성 감사 결과 | 6.3.2 | `reports/evidence/*/02_dependency_audit.txt` | `pnpm security:evidence` |
| C-4 | FIM (파일 무결성 모니터링) | 11.6.1 | `apps/api/src/modules/security/integrity-monitor.service.ts` | 소스코드 리뷰 |
| C-5 | DAST 스캔 스크립트 | 11.3.2 | `scripts/dast-scan.sh` | `pnpm security:dast` |

### D. 모니터링 및 로깅 (PCI DSS Req. 10)

| # | 증적 항목 | PCI DSS | 파일/위치 | 수집 방법 |
|---|----------|---------|----------|----------|
| D-1 | 감사 로그 인터셉터 | 10.2.1 | `apps/api/src/common/interceptors/audit.interceptor.ts` | 소스코드 리뷰 |
| D-2 | 로그 해시 체인 (변조 방지) | 10.3.3 | `apps/api/src/modules/security/audit-hash-chain.service.ts` | 소스코드 리뷰 |

### F. 네트워크 접근 제어 (PCI DSS Req. 1)

| # | 증적 항목 | PCI DSS | 파일/위치 | 수집 방법 |
|---|----------|---------|----------|----------|
| F-1 | IP 화이트리스트 가드 | 1.3.2 | `apps/api/src/modules/pg-gateway/guards/ip-whitelist.guard.ts` | 소스코드 리뷰 |
| F-2 | IP 화이트리스트 DB 스키마 | 1.3.2 | `apps/api/prisma/schema.prisma` (`pg_api_keys.allowed_ips String[]`) | 소스코드 리뷰 |
| F-3 | IP 화이트리스트 테스트 결과 | 1.3.2 | `apps/api/src/modules/pg-gateway/__tests__/ip-whitelist.guard.spec.ts` | `pnpm test` |
| F-4 | IP 화이트리스트 관리 API | 1.3.2 | `apps/api/src/modules/pg-gateway/services/api-key.service.ts` (`updateAllowedIps`) | 소스코드 리뷰 |

### E. 시스템 구성 (PCI DSS Req. 2)

| # | 증적 항목 | PCI DSS | 파일/위치 | 수집 방법 |
|---|----------|---------|----------|----------|
| E-1 | Docker 비루트 실행 | 2.2.1 | `apps/api/Dockerfile`, `apps/web/Dockerfile` | `pnpm security:evidence` |
| E-2 | 보안 미들웨어 (Helmet.js) | 2.2.7 | `apps/api/src/main.ts` | `pnpm security:evidence` |

---

## 자동 증적 수집 명령어

```bash
# 전체 증적 자동 수집 (8개 카테고리)
pnpm security:evidence

# 개별 보안 도구
pnpm security:sbom       # SBOM 생성
pnpm security:audit      # 의존성 감사
pnpm security:dast       # DAST 스캔
pnpm security:all        # SBOM + 감사
pnpm security:lint       # ESLint 보안 규칙
```

---

## 테스트 증적

| 카테고리 | 테스트 파일 | 테스트 수 |
|---------|-----------|----------|
| 인증 보안 | `auth-security.spec.ts` | 다수 |
| 가드 보안 | `guards-security.spec.ts` | 다수 |
| Rate Limiting | `throttle-security.spec.ts` | 다수 |
| 입력 검증 | `validation-security.spec.ts` | 다수 |
| 데이터 마스킹 | `masking-security.spec.ts` | 다수 |
| 감사 로그 | `audit-security.spec.ts` | 다수 |
| CSP | `csp-security.spec.ts` | 다수 |
| FIM | `integrity-monitor.spec.ts` | 다수 |
| 해시 체인 | `audit-hash-chain.spec.ts` | 다수 |
| KMS | `local-kms.spec.ts` | 다수 |
| 키 로테이션 | `key-rotation.service.spec.ts`, `key-rotation.scheduler.spec.ts` | 9 |
| IP 화이트리스트 | `ip-whitelist.guard.spec.ts` | 6 |
| **합계** | **13개 보안 테스트 파일** | **95+ 보안 테스트** |

---

## QSA 감사 진행 순서 권고

1. **사전 준비**: `pnpm security:evidence` 실행하여 자동 증적 수집
2. **소스코드 리뷰**: 위 표의 "소스코드 리뷰" 항목을 QSA에게 제공
3. **테스트 시연**: `pnpm test` 실행하여 전체 테스트 통과 시연
4. **SBOM 제출**: `pnpm security:sbom` 결과물 제출
5. **인프라 검증**: Docker 설정, Nginx 보안 헤더, TLS 인증서 확인

---

## 프로덕션 배포 전 추가 필요 증적

| 항목 | 설명 | 시기 |
|------|------|------|
| TLS 인증서 | SSL 인증서 발급 증적 | 배포 시 |
| AWS KMS 설정 | KMS 키 정책 문서 | 배포 시 |
| 침투 테스트 보고서 | 외부 업체 침투 테스트 결과 | 배포 후 |
| DAST 스캔 결과 | 스테이징 환경 OWASP ZAP 결과 | 배포 후 |
| 보안 교육 기록 | 개발팀 보안 교육 이수 증적 | 연 1회 |

---

*이 체크리스트는 PCI DSS 4.0.1 SAQ D 기준으로 작성되었습니다.*
*외부 QSA 감사 시 이 문서를 기반으로 증적을 준비하세요.*
