# Technology Stack

> updated_at: 2026-03-07 (Sync: CSP 정책 추가, 테스트 상태 상세화)

## 아키텍처

pnpm + Turborepo 모노레포. 백엔드(NestJS) + 프론트엔드(Next.js 15) + 공유 패키지.
Docker Compose로 프로덕션 시뮬레이션 (db + api + web + nginx).

## 핵심 기술

| 계층 | 기술 | 버전 |
|------|------|------|
| Backend | NestJS + TypeScript strict | 10.3.x |
| Frontend | Next.js 15 (App Router) | 15.1.0 |
| DB | PostgreSQL (Docker) | 16.12 |
| ORM | Prisma | 5.11.x |
| Auth | JWT (15분) + Refresh (7일) + MFA (TOTP) | - |
| 암호화 | AES-256-GCM (저장) / TLS 1.3 (전송) | - |
| 모니터링 | Prometheus + Grafana + pino 로거 | - |
| 패키지 관리 | pnpm | 10.28.x |
| 빌드 | Turborepo | 2.x |

## 주요 라이브러리

- **인증**: passport-jwt, otplib (TOTP), bcryptjs
- **검증**: class-validator, class-transformer, zod (프론트)
- **UI**: Tailwind CSS 4, lucide-react, cva, swr
- **보안**: helmet, @nestjs/throttler, eslint-plugin-security
- **테스트**: Jest (백엔드), Vitest (프론트), Playwright (E2E), supertest (통합)

## 개발 표준

### 타입 안전
- strict: true 필수, any 절대 금지
- 함수 반환 타입 명시, Optional chaining + Nullish coalescing 적극 사용

### 코드 품질
- ESLint + eslint-plugin-security (0 errors)
- Husky pre-commit + commitlint (conventional commits)
- SRP: 함수 하나 = 책임 하나, 50줄 이내 권장

### 테스트
- Backend: Jest (단위 + 통합), Frontend: Vitest (단위)
- E2E: Playwright (브라우저) + supertest (API)
- 현재: 56 suites / 798 tests ALL PASS (백엔드 ✅)
- 프론트엔드: CSP 보안 테스트 12개 수정 중 (strict-dynamic 정책 반영 필요)

## 개발 환경

### 필수 도구
- Node.js >= 20, pnpm >= 9, Docker, Git

### 주요 명령어
```bash
pnpm dev              # 전체 개발 서버 (turbo)
pnpm build            # 전체 빌드
pnpm test             # 전체 테스트
pnpm --filter api dev # API만 개발 서버 (:4000)
pnpm --filter web dev # Web만 개발 서버 (:3500)
```

### 포트
- API: localhost:4000
- Web: localhost:3500
- DB: localhost:5432

## 핵심 기술 결정

| 결정 | 근거 | 상태 |
|------|------|------|
| BigInt(DB) + number(DTO) | 금액 정밀도 보장 + API 호환성. BigIntSerializationInterceptor가 변환 | ✅ 구현 |
| secret_key prefix + bcrypt | API 키 인증 최적화: prefix로 빠른 조회, bcrypt로 안전한 검증 | ✅ 구현 |
| PgBasicAuthGuard (Basic Auth) | 토스페이먼츠 스타일 -u "secretKey:" 인증 패턴 | ✅ 구현 |
| OwnershipInterceptor | 가맹점/대리점 유저의 데이터 격리 (merchantId/agentId JWT 기반) | ✅ 구현 |
| AcquirerProvider DI 토큰 | VAN/카드사 어댑터 교체 가능한 DI 패턴 (MockAcquirerService → AcquirerProvider) | ✅ 구현 |
| CSP strict-dynamic | PCI DSS 6.4.3 준수 — 인라인 스크립트/eval 금지, 화이트리스트만 로드 | ✅ 구현 |

---
_표준과 패턴에 집중. 전체 의존성 목록은 package.json 참조_
