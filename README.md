# PG System

PG사(결제대행사) 관리시스템. 가맹점·대리점·정산·보안을 통합 관리하는 엔터프라이즈 결제 플랫폼.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript strict |
| Backend | NestJS 10 + TypeScript strict |
| Database | PostgreSQL + Prisma 5 ORM |
| UI | Tailwind CSS v4 + shadcn/ui |
| Auth | JWT + MFA(TOTP) + Passport (JWT + Basic Auth) |
| 암호화 | AES-256-GCM (저장) / TLS 1.3 (전송) |
| 모니터링 | Prometheus + Grafana |
| 인프라 | Nginx reverse proxy + Docker |
| 빌드 | Turborepo + pnpm workspaces |

## 프로젝트 구조

```
pg-system/
├── apps/
│   ├── api/              # NestJS 백엔드 (포트 4000)
│   └── web/              # Next.js 프론트엔드 (포트 3000)
├── packages/
│   └── shared/           # 공유 타입·상수·유틸리티
├── infra/
│   ├── nginx/            # Nginx 리버스 프록시
│   ├── monitoring/       # Prometheus + Grafana 스택
│   └── backup/           # 백업 스크립트
├── scripts/              # 보안 스캔·부하 테스트 스크립트
└── docs/                 # 아키텍처·컴플라이언스 문서
```

## 주요 모듈

### 백엔드 API (15개 모듈)

| 모듈 | 설명 |
|------|------|
| auth | JWT 인증 + MFA(TOTP) + 세션 관리 |
| users | 사용자 CRUD + 역할 할당 |
| roles | RBAC 역할·권한 관리 |
| merchants | 가맹점 등록·상태 관리 |
| agents | 대리점 트리 구조 관리 |
| transactions | 거래 조회·통계 |
| settlements | 정산 산출·확정·송금 |
| commissions | 3단계 수수료 (PG→대리점→가맹점) |
| deposits | 입금 대사(Reconciliation) |
| pg-gateway | PG 결제 API (주문·승인·취소·가상계좌·웹훅) |
| security | 감사 로그·해시 체인·파일 무결성(FIM) |
| dashboard | 거래·정산 통계 대시보드 |
| notifications | 알림 관리 |
| system | 시스템 코드·공휴일·메뉴 |
| health / metrics | 헬스체크 + Prometheus 메트릭 |

### 프론트엔드 (3개 포탈)

| 포탈 | 경로 | 설명 |
|------|------|------|
| 관리자 | `/` | 대시보드, 가맹점/대리점/거래/정산/수수료/입금/사용자/역할/보안/시스템 |
| 가맹점 | `/m/*` | 가맹점 전용 거래/정산/API키 조회 (merchantId 격리) |
| 대리점 | `/a/*` | 대리점 전용 가맹점/거래/정산/수수료/입금 조회 (agentId 격리) |

### 데이터베이스 (34개 테이블)

사용자/인증, 가맹점/대리점, 거래/결제, 정산/입금, 수수료, 보안/감사, 시스템 설정

## 시작하기

### 필수 요구사항

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL 15+
- Redis (캐시, 선택)

### 설치

```bash
# 의존성 설치
pnpm install

# 공유 패키지 빌드
pnpm --filter shared build

# DB 마이그레이션 + 시드
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed
```

### 환경변수

`.env.example`을 참고하여 `.env` 파일을 생성하세요.

필수 환경변수:
- `DATABASE_URL` — PostgreSQL 연결 문자열
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_MFA_SECRET` — JWT 서명 키
- `ENCRYPTION_KEY` / `MFA_ENCRYPTION_KEY` — AES-256-GCM 암호화 키
- `ALLOWED_ORIGINS` — CORS 허용 도메인 (와일드카드 금지)
- `API_PORT` — API 서버 포트 (기본: 4000)

### 개발 서버

```bash
# 전체 (API + Web 동시)
pnpm dev

# 개별 실행
pnpm --filter api dev     # http://localhost:4000
pnpm --filter web dev     # http://localhost:3500
```

### Swagger API 문서

개발 환경에서 http://localhost:4000/api/docs 접속 (프로덕션 비활성화)

## 빌드 & 테스트

```bash
# 빌드
pnpm build

# 타입 체크
pnpm type-check

# 린트
pnpm lint

# 단위 테스트 (51 suites / 714 tests)
pnpm test

# E2E 테스트
pnpm test:e2e        # API E2E (73항목)
pnpm test:e2e:web    # Web E2E (Playwright)

# 부하 테스트
pnpm test:load:smoke
pnpm test:load
pnpm test:load:stress
```

### 테스트 현황

| 구분 | Suites | Tests |
|------|--------|-------|
| Backend (Jest) | 39 | 517 |
| Frontend (Vitest) | 12 | 197 |
| **합계** | **51** | **714** |

## 보안

```bash
# 전체 보안 검사
pnpm security:all

# 개별 실행
pnpm security:lint     # 보안 린트
pnpm security:audit    # 의존성 취약점 검사
pnpm security:sbom     # SBOM 생성
pnpm security:dast     # 동적 보안 테스트
```

### 보안 설계 원칙

- PCI DSS 준수 설계 (카드 데이터 토큰화, 감사 추적, 암호화)
- 인증 이중화: 관리자(JWT+MFA), 가맹점 PG API(Basic Auth+IP 화이트리스트)
- 감사 로그 해시 체인(SHA-256)으로 로그 위변조 탐지
- FIM(File Integrity Monitoring)으로 파일 변조 탐지
- Rate Limiting: IP당 분당 10회 (결제), 5회 실패 시 계정 잠금 (로그인)

## 인프라

```bash
# 모니터링 스택 (Prometheus + Grafana)
docker compose -f infra/monitoring/docker-compose.monitoring.yml up -d
```

- Prometheus: 메트릭 수집 (`/metrics` 엔드포인트)
- Grafana: 대시보드 시각화
- Nginx: 리버스 프록시 + TLS 종단

## 문서

- [아키텍처](docs/architecture.md) — 시스템 아키텍처 상세
- [PCI DSS 컴플라이언스 맵](docs/pci-dss-compliance-map.md) — PCI DSS 요구사항 매핑
- [법규 컴플라이언스](docs/legal-compliance.md) — 전자금융거래법 등 법규 준수
- [프로덕션 체크리스트](docs/production-checklist.md) — 배포 전 점검 항목
- [외부 감사 체크리스트](docs/external-audit-checklist.md) — 외부 코드 검증용

## 라이선스

Private — 무단 복제·배포 금지
