# Project Structure

> updated_at: 2026-03-07 (Sync: 포탈 UI 완료 상태 반영, 프론트엔드 구조 추가)

## 구성 철학

도메인 중심 모듈 구조. 백엔드는 NestJS 모듈 패턴, 프론트엔드는 Next.js App Router 라우트 그룹.
3자 포탈(관리자/가맹점/대리점)을 단일 앱 내 라우트 그룹으로 분리.

## 모노레포 패턴

```
apps/api/        — NestJS 백엔드 (포트 4000)
apps/web/        — Next.js 15 프론트엔드 (포트 3500)
packages/shared/ — 공유 타입, 상수, 에러 코드
```

## 백엔드 모듈 (`apps/api/src/modules/`)

**Purpose**: 각 모듈은 독립적인 비즈니스 도메인. controllers/ + services/ + dto/ + guards/ 구조.

| 모듈 | 역할 |
|------|------|
| auth | 로그인, JWT, MFA, 비밀번호 |
| users | 사용자 CRUD, 역할 할당 |
| merchants | 가맹점 CRUD, 상태 관리 |
| agents | 대리점 CRUD, 트리 구조 |
| transactions | 거래 CRUD, 취소 |
| settlements | 정산 계산, 상태 전이 |
| commissions | 수수료 계층 (PG > 대리점 > 가맹점) |
| deposits | 입금 관리, 자동/수동 대사 |
| pg-gateway | PG 결제 API (외부 가맹점용) |
| security | 감사 로그, FIM, KMS, 해시 체인 |
| dashboard | 통계, 일별 추이, 상위 랭킹 |
| notifications | Slack + Email 알림 |
| metrics | Prometheus 커스텀 메트릭 |
| health | 헬스체크 3종 (health/ready/live) |
| system | 시스템 코드, 공휴일, 메뉴 |

## 프론트엔드 라우트 (`apps/web/src/app/`)

**Purpose**: 라우트 그룹으로 3자 포탈 분리. 공유 컴포넌트는 `components/ui/`, 각 포탈은 격리된 라우트.

| 라우트 그룹 | 대상 | 상태 | 기능 |
|-------------|------|------|------|
| `(auth)/` | 로그인 + MFA | ✅ 완료 | login, mfa, password/reset |
| `(dashboard)/` | 관리자 포탈 | ✅ 완료 (26페이지) | 거래/정산/사용자/역할/감사로그/시스템 |
| `(merchant)/m/` | 가맹점 포탈 | ✅ 완료 (4페이지) | 자사 거래/정산/API키/설정 |
| `(agent)/a/` | 대리점 포탈 | ✅ 완료 (6페이지) | 산하 가맹점/거래/정산 조회 |
| `(payment)/` | 결제 Checkout | ✅ 구현 (2페이지) | 결제창(iframe embed용), 결과 페이지 |

## 프론트엔드 UI 구성 (`apps/web/src/`)

**Purpose**: 도메인별 컴포넌트 + 공유 UI 원시형 분리.

| 폴더 | 역할 | 예시 |
|------|------|------|
| `lib/` | 유틸 함수 | api-client, swr-config, format, utils(cn) |
| `types/` | API 응답 타입 | api.ts(ApiResponse), auth.ts(User), dashboard.ts 등 |
| `hooks/` | 비즈니스 로직 + API | useUser, useTransactions, useDashboard, useMfaSetup 등 |
| `components/ui/` | 설계시스템 원시형 | Button, Input, Card, Badge, Dialog, DataTable, Pagination |
| `components/[domain]/` | 도메인 컴포넌트 | dashboard/, transactions/, settlements/, users/, merchants/, security/ |
| `middleware.ts` | 라우팅 보호 | accessToken 체크, 비로그인→/login 리다이렉트 |

## 공통 패턴 (`apps/api/src/common/`)

| 패턴 | 위치 | 역할 |
|------|------|------|
| Guards | `common/guards/` | JwtAuthGuard, PermissionsGuard, ThrottlerGuard |
| Interceptors | `common/interceptors/` | AuditInterceptor, BigIntSerialization, Ownership, Transform |
| Filters | `common/filters/` | GlobalExceptionFilter (에러 응답 통일) |
| Decorators | `common/decorators/` | @CurrentUser, @Permissions |
| Middleware | `common/middleware/` | RequestLogger |

## 네이밍 규칙

- **파일**: kebab-case (`pg-fee-calculator.service.ts`)
- **클래스**: PascalCase (`PgFeeCalculatorService`)
- **변수/함수**: camelCase (`calculateFee`)
- **상수**: SCREAMING_SNAKE_CASE (`MAX_LOGIN_ATTEMPTS`)
- **DB 테이블**: snake_case (`merchant_settlements`)
- **DTO**: PascalCase + 접미사 (`CreateMerchantDto`)

## Import 규칙

```typescript
// 외부 패키지
import { Injectable } from '@nestjs/common';
// 공유 패키지 (모노레포)
import { ERROR_CODES } from '@pg-system/shared';
// 프로젝트 내부 (상대 경로)
import { PrismaService } from '../../prisma/prisma.service';
```

- `@pg-system/shared` → 공유 타입/상수/에러 코드
- 상대 경로 → 모듈 내부 참조

---
_패턴에 집중. 패턴을 따르는 새 파일은 이 문서 업데이트 불필요_
