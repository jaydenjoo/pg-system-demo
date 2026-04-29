# PG System Web

Next.js 15 기반 PG 관리시스템 프론트엔드. 관리자용 대시보드를 제공합니다.

## 실행

```bash
# 개발 서버 (포트 3000)
pnpm --filter web dev

# 프로덕션 빌드
pnpm --filter web build
pnpm --filter web start
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 15.1 (App Router) |
| 런타임 | React 19 + TypeScript strict |
| 스타일 | Tailwind CSS v4 |
| UI 컴포넌트 | shadcn/ui (Radix UI 기반) |
| 폼 처리 | react-hook-form + zod |
| HTTP | SWR 2.3 (데이터 페칭 + 캐싱) |
| 아이콘 | Lucide React |

## 페이지 구조

```
app/
├── (auth)/
│   └── login/           # 로그인 페이지
└── (dashboard)/
    ├── dashboard/       # 메인 대시보드 (거래·정산 통계)
    ├── merchants/       # 가맹점 관리
    ├── agents/          # 대리점 관리
    ├── transactions/    # 거래 조회
    ├── settlements/     # 정산 관리
    ├── commissions/     # 수수료 설정
    ├── deposits/        # 입금 대사
    ├── users/           # 사용자 관리
    ├── roles/           # 역할·권한 관리
    ├── security/        # 감사 로그·보안 모니터링
    ├── system/          # 시스템 코드·공휴일·메뉴
    └── profile/         # 내 프로필·MFA 설정
```

## 인증 흐름

1. `/login` — ID/PW 입력 → API 로그인
2. MFA 설정된 계정 → TOTP 코드 입력
3. Access Token (메모리) + Refresh Token (HttpOnly 쿠키)
4. SWR로 토큰 자동 갱신

## 테스트

```bash
# 단위 테스트 (Vitest)
pnpm --filter web test
pnpm --filter web test:watch

# E2E 테스트 (Playwright)
pnpm --filter web test:e2e
pnpm --filter web test:e2e:ui    # UI 모드

# 타입 체크
pnpm --filter web type-check

# 린트
pnpm --filter web lint
```

## API 연동

- 개발: `http://localhost:4000` (API 서버)
- 프로덕션: Nginx 리버스 프록시를 통해 동일 도메인으로 라우팅
- 환경변수: `NEXT_PUBLIC_API_URL`로 API 주소 설정

## 배포 (Vercel)

- Vercel 자동 배포 — `main` 브랜치 push 시 트리거
- 빌드 설정: 루트 `vercel.json` (turbo filter `@pg-system/web` only + `apps/api` 제외)
- 매 push마다 빌드 진행 (`ignoreCommand` 제거 — Vercel shallow clone에서 신뢰 불가)
- 빌드 시간: ~20초 (Turbo 캐시 활용 시 더 빠름)
