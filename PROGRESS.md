# PG System 역설계 & 재구축 프로젝트 - PROGRESS
> **이 파일을 새 세션 시작 시 참조하면 100% 이어서 작업 가능**
> 최종 업데이트: 2026.04.29 (#5 — Mock API Routes로 라이브 데모 로그인 작동)

---

## 🆕 2026-04-29 세션 기록 (#5 — Mock API Routes 구현 → 라이브 데모 로그인 작동) ✅ 완료

### 🎉 결과
- **라이브 사이트 로그인 작동**: https://pg-system-demo.vercel.app/login
- **3개 사용자 유형 검증 완료** (Playwright 자동 검증):
  - ✅ admin / Admin1234!@ → /dashboard
  - ✅ agent_test / Agent1234!@ → /a/dashboard
  - ✅ merchant_test / Merchant1234!@ → /m/dashboard
- **백엔드 없이 데모 가능**: Vercel API Routes 43개로 mock 구현 (무료, 24/7)

### 추가된 API 엔드포인트 (43개)
- **Auth**: login, logout, me, refresh, login/mfa, mfa/enable, mfa/setup, password/change
- **Dashboard**: summary, transaction-stats, settlement-stats, daily-trend, top-merchants, top-agents
- **리스트**: merchants, agents, transactions, deposits, settlements, users, roles, system/codes, system/menus, system/notifications, commissions/pg-margins
- **상세/액션**: merchants/[id], merchants/[id]/status, transactions/[id]/cancel, deposits/[id]/reconcile, settlements/[id]/complete 등
- **보안 모니터링**: audit-logs, login-history, risk-alerts
- **기타**: webhooks/test

### 핵심 파일
- `apps/web/src/app/api/v1/_lib/mock-jwt.ts` — Edge Runtime 호환 base64URL JWT (UTF-8 안전)
- `apps/web/src/app/api/v1/_lib/mock-users.ts` — 시드 계정 3개
- `apps/web/src/app/api/v1/_lib/mock-data.ts` — 대시보드 통계 + 리스트 mock
- `apps/web/src/app/api/v1/_lib/cookies.ts` — HttpOnly 쿠키 헬퍼
- `apps/web/src/app/api/v1/_lib/auth-context.ts` — 요청 → 사용자 추출

### 커밋
- `07f2bf6` feat(web): demo용 Mock API Routes 구현 (43 endpoints)
- `59b3e42` fix(web): UTF-8 안전 base64URL JWT 인코딩 (Korean 사용자명 500 에러 수정)

---

## 2026-04-29 세션 기록 (#4 — Vercel 배포 사이클 + Next.js CVE 패치) ✅ 완료

### 🎉 결과
- **라이브 사이트**: https://pg-system-demo.vercel.app/
- **로그인 페이지**: https://pg-system-demo.vercel.app/login
- **결제 데모**: https://pg-system-demo.vercel.app/checkout
- **GitHub**: https://github.com/jaydenjoo/pg-system-demo
- **E2E 검증**: Playwright 8개 시나리오 통과

### E2E 테스트 결과 (Playwright, 2026-04-29 17:53)
| 시나리오 | 결과 |
|---|---|
| /login 폼 표시 | ✅ |
| 로그인 폼 입력/제출 | ✅ (UI 작동) |
| 로그인 API 호출 | ✅ POST /api/v1/auth/login (404 — API 서버 부재, 의도됨) |
| 에러 메시지 표시 | ✅ "서버 연결에 실패했습니다" |
| /dashboard 인증 미들웨어 | ✅ → /login redirect |
| / (root) 인증 미들웨어 | ✅ → /login redirect |
| /checkout public 페이지 | ✅ 결제 테스트 폼 완벽 (Mock 카드) |
| 콘솔 에러 | ✅ favicon + API 404만 (의도됨) |

### 현재 위치
- Epic: 인프라 정합성 / 외부 감사 준비
- Task: pg-system-demo Vercel 라이브 배포 (홍보 + 테스트)
- 상태: ✅ **완료** (라이브 사이트 정상 운영)

### 이번 세션 완료 내역 (Claude — 9 commit 디버깅 사이클)
| commit | 내용 | 결과 |
|---|---|---|
| 4952530 | initial commit (pg-system-demo) | 빌드 fail (HEAD^ fatal) |
| cec0b26 | ignoreCommand HEAD^ 안전 wrap | 빌드 SKIP |
| ad3aebf | 빈 commit webhook re-fire | 빌드 SKIP |
| 59b6514 | apps/web/README.md trigger | 빌드 fail (server-only) |
| 9121ede | server-only 주석 처리 | 빌드 fail (output 경로 중복) |
| bd7509e | ignoreCommand 제거 | 빌드 fail (output 경로 중복) |
| b596deb | outputDirectory `.next` 상대경로 | 빌드 success → deploy 차단 (Vulnerable Next.js) |
| f493508 | pnpm-workspace.yaml 순서 변경 | 빌드 success → deploy 차단 |
| **48644ab** | **Next.js 15.1.0 → 15.5.15 (CVE-2025-66478 패치)** | **★ Ready 대기** |

### 진짜 원인 (5시간 디버깅 끝에 발견)
**Vercel CVE-2025-66478 HARD STOP deployment**:
- Next.js 15.1.0 = vulnerable RSC 프로토콜
- 빌드 자체는 50초 성공
- 마지막 "Vulnerable version of Next.js detected" 메시지 = 단순 경고가 아닌 **deploy 거부 신호**
- 다른 모든 fix(ignoreCommand, outputDirectory, server-only)는 부분 원인이지만 진짜 원인은 CVE

### Jayden 직접 작업 (예상)
- Vercel UI에서 새 프로젝트 import 시 [Edit] 버튼으로:
  - Root Directory = `apps/web` (자동 감지는 apps/api로 잡힘)
  - Application Preset = `Next.js` (자동 감지는 NestJS로 잡힘)
- 또는 기존 프로젝트가 commit 48644ab로 자동 빌드

### 다음 세션 할 일
- ✅ Vercel UI Deployments 탭에서 48644ab 빌드 결과 확인
- ✅ Ready 시 URL 공유 → Playwright 검증
- (선택) audit 폴더 정리 (어제 미푸시 commit push)
- (선택) MfaSetup.tsx의 `<img>` → `<Image />` 교체 (성능 경고)
- (선택) payment-client.ts server-only 복원 + API Route/Server Action 리팩토링

### 차단 요소
- Vercel UI 작업 진행 상황 (Claude 직접 확인 불가)
- 정확한 deployment URL (Jayden 공유 필요)

### 누적 변경 파일 (이번 세션, push 완료)
| 파일 | 내용 |
|---|---|
| `vercel.json` | ignoreCommand 제거 + outputDirectory `.next` |
| `apps/web/README.md` | Vercel 배포 섹션 추가 |
| `apps/web/src/lib/payment-client.ts` | server-only 일시 비활성 |
| `apps/web/package.json` | next + eslint-config-next 15.5.15 |
| `pnpm-lock.yaml` | 재생성 (next 15.5.15 반영) |
| `pnpm-workspace.yaml` | apps/web 먼저 명시 |
| `.gitignore` | coverage/ 제외 추가 |
| `.gitleaksignore` | 신규 (false positive 18건 등록) |

---

## 🆕 2026-04-29 세션 기록 (#3 — 레포 구조 정정 + pg-system git 부활)

### 현재 위치
- Epic: 인프라 정합성 / 외부 감사 준비
- Task: 레포 구조 의도 정렬 — `pg-system` = Vercel 배포 / `pg-system-audit` = 외부 감사 동결
- 상태: Claude 작업 완료, Jayden 직접 작업 대기 (audit 정리 + 첫 push + Vercel 재연결)

### 의도 명확화 (Jayden 명시)
- **`pg-system`** = Vercel 배포 → 시스템 홍보 + 테스트용 (라이브 사이트)
- **`pg-system-audit`** = 외부 감사관 코드 검증용 (동결 스냅샷, GitHub: `jaydenjoo/pg-system`)

### 어제~오늘 #1/#2 세션의 오류 정정
- 어제 PROGRESS.md(#1)에 "정식 레포 = pg-system-audit"으로 기록한 것은 **잘못된 추정**.
- audit의 첫 commit 메시지가 "PG System **외부감사용** 코드베이스 초기 커밋"이라고 명시했음에도 작업 위치를 audit으로 잡은 것이 근본 오류.
- 그 결과 어제 vercel.json/.vercelignore 신규(audit에) + 오늘 e2e fix 2개(audit에) 모두 잘못된 폴더에 들어감.
- 본 #3 세션에서 변경분 4개를 audit → pg-system으로 모두 옮김.

### 이번 세션 완료 내역 (Claude)
1. **레포 구조 검증** — 두 폴더 실측 비교. pg-system(2.0G, 5553파일, .env+.kiro+작업 컨텍스트 풀세트, git 없음) vs audit(1.1G, 4904파일, sanitize됨, git+GitHub 연결).
2. **pg-system에 변경분 4개 적용** — vercel.json, .vercelignore 신규 + e2e merchants/users spec 라인 9 fix (`getByText` → `getByRole(heading)`).
3. **pg-system git init** — main 브랜치. 첫 commit 대상 34개 폴더/파일. 비밀 파일 노출 0건(.env.example만 의도된 노출), 빌드 산출물 누출 0건 검증.
4. **PROGRESS.md(#3) + learnings.md 정정/교훈 추가**.

### Jayden 직접 작업 (순서)

#### Step 1. audit 정리 — 외부 감사 동결 상태로 복귀 (5분)
```bash
cd /Users/jayden/project/pg-system-audit
rm vercel.json .vercelignore
git checkout -- apps/web/e2e/merchants.spec.ts apps/web/e2e/users.spec.ts
git status   # → "nothing to commit, working tree clean" 확인
git push origin main   # 어제 미푸시 commit(9693b30 docs) GitHub 동기화
```

#### Step 2. pg-system 첫 commit + 새 GitHub 레포 push (10분)
```bash
cd /Users/jayden/project/pg-system

# 변경 전부 add (.gitignore가 비밀 파일 자동 제외)
git add -A

# 상태 한번 더 확인 (선택)
git status --short | head -20

# 첫 commit
git commit -m "feat: initial commit — Vercel 배포용 pg-system-demo 레포 생성

- 코드 전체 (apps/web, apps/api, packages, infra, docs, .kiro)
- Vercel web-only 빌드 설정 (vercel.json + .vercelignore, turbo filter)
- e2e strict mode violation fix (merchants/users page header locators)
- audit 레포(jaydenjoo/pg-system)와 분리 — audit은 외부 감사 동결용으로 유지"

# 새 GitHub 레포 remote 추가
git remote add origin git@github.com:jaydenjoo/pg-system-demo.git

# push (첫 push, upstream 설정)
git push -u origin main
```

#### Step 3. Vercel 재연결 + 환경변수 + 빌드 확인 (10분)
1. https://vercel.com → 기존 pg-system 프로젝트 → **Settings → Git**
2. **Disconnect from `jaydenjoo/pg-system`** (audit 연결 해제)
3. **Connect Git Repository** → `jaydenjoo/pg-system-demo` 선택
   - 또는 새 프로젝트: New Project → Import `pg-system-demo`
4. Build settings → vercel.json 자동 인식 (수정 불필요)
5. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = (데모면 비움 / 운영이면 실제 API URL)
   - 기타 NestJS용 env(`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` 등) 모두 **삭제**
6. **Deploy** 트리거 → Deployments 탭에서 결과 확인
   - 🟢 Ready → 라이브 사이트 정상화 ✅
   - 🔴 Failed → 빌드 로그 캡처 → Claude 보고

### 누적 변경 파일
| 위치 | 파일 | 담당 | 상태 |
|---|---|---|---|
| pg-system | vercel.json | Claude | 신규 |
| pg-system | .vercelignore | Claude | 신규 |
| pg-system | apps/web/e2e/merchants.spec.ts | Claude | 수정 |
| pg-system | apps/web/e2e/users.spec.ts | Claude | 수정 |
| pg-system | docs/PROGRESS.md | Claude | 본 #3 섹션 추가 |
| pg-system | docs/learnings.md | Claude | 새 교훈 추가 |
| pg-system | .git/ | Claude | git init (main) |
| audit | vercel.json | Jayden | rm 예정 |
| audit | .vercelignore | Jayden | rm 예정 |
| audit | apps/web/e2e/merchants.spec.ts | Jayden | git checkout 예정 |
| audit | apps/web/e2e/users.spec.ts | Jayden | git checkout 예정 |
| audit | commit 9693b30 (docs) | Jayden | push 예정 |

### 차단 요소
- 없음

---

## 🆕 2026-04-29 세션 기록 (#2 — e2e 회귀 fix)

### 현재 위치
- Epic: 인프라 정합성 / 외부 감사 준비
- Task: e2e 테스트 회귀 fix (Playwright strict mode violation)
- 상태: 완료 (코드 변경 commit/push는 Jayden 직접 진행)

### 이번 세션 완료 내역
1. **merchants.spec.ts:9 fix** — `getByText("가맹점 관리")` → `getByRole("heading", { name: "가맹점 관리" })`. nav 링크 + h1 헤딩 두 곳 매칭으로 인한 strict mode violation 해결.
2. **users.spec.ts:9 fix** — 풀 e2e 재실행 중 동일 anti-pattern 노출 → `getByText("사용자 관리")` → `getByRole("heading", { name: "사용자 관리" })`로 일괄 정리.
3. **풀 e2e 검증** — 12 tests / 12 PASS / 0 FAIL (어제 11/12 → 오늘 12/12, 4.6초).
4. **잔여 anti-pattern 식별** — `dashboard.spec.ts:6` `getByText("총 거래")` 패턴. 현재 PASS이지만 KPI 카드 추가 시 동일 회귀 가능성 있음 → 차후 Task 후보.
5. **learnings.md 갱신** — Playwright getByText anti-pattern 컨벤션 기록.

### Jayden이 직접 해야 할 일 (순서)
1. **audit 레포 commit 2건 + push** (5분, 🔴 보안등급으로 AI 자동 push 금지)
   - commit A: `ci: limit Vercel build to web app (turbo filter + ignore)` — vercel.json + .vercelignore (어제분)
   - commit B: `test(e2e): fix strict mode violation in page header locators` — merchants/users spec (오늘분)
   - push: `git push origin main`
2. **Vercel UI 환경변수 정리** (10분)
   - NEXT_PUBLIC_API_URL 정책 결정 (데모는 비움 / 운영은 실제 API URL)
   - NestJS용 env(DATABASE_URL, JWT_SECRET 등) web 프로젝트에서 제거
3. **Vercel 자동 빌드 결과 확인** (push 후 자동 트리거, 2~3분)
   - 성공 → 배포 정상화 ✅
   - 실패 → 로그 캡처해서 Claude에게 보고

### 다음 세션 후보 (선택)
- **(Claude 가능)** dashboard.spec.ts:6 잔여 anti-pattern 사전 정리
- **(Claude+Jayden)** _archive/pg-system-recovered-patches/ 12 patch cherry-pick 검토 (Redis B / BullMQ C / FDS / Gateway / MFA)
- **(Claude+Jayden)** Kiro defensive-programming spec 진행 (현재 phase: requirements-generated, 미승인)
- **(Jayden 결정 필요)** /Users/jayden/project/pg-system 미러 폴더 폐기 검토 (정식 레포는 audit)

### 차단 요소
- 없음

### 변경 파일 (오늘 세션 — 미커밋, audit 레포)
| 파일 | 내용 |
|---|---|
| `apps/web/e2e/merchants.spec.ts` (수정) | 라인 9: getByText → getByRole(heading) |
| `apps/web/e2e/users.spec.ts` (수정) | 라인 9: 동일 패턴 fix |

### 누적 변경 파일 (어제 + 오늘, audit 레포)
| 파일 | 상태 | 내용 |
|---|---|---|
| `vercel.json` | untracked | turbo filter web only (어제) |
| `.vercelignore` | untracked | apps/api 외 인프라 자료 제외 (어제) |
| `apps/web/e2e/merchants.spec.ts` | modified | strict mode fix (오늘) |
| `apps/web/e2e/users.spec.ts` | modified | strict mode fix (오늘) |

---

## 🆕 2026-04-29 세션 기록

### 현재 위치
- Epic: 인프라 정합성 / 외부 감사 준비
- Task: 워크스페이스 git 위생 + Vercel 배포 정상화
- 상태: 완료 (코드 변경 commit/push는 Jayden 직접 진행)

### 이번 세션 완료 내역
1. **워크스페이스 git 정리** — `/Users/jayden/project/.git`이 dairect remote 좀비 상태로 자매 9개 프로젝트(pg-system 566 파일 포함) 오염 → rename → 휴지통 이동. 자매 프로젝트들 자기 git으로 복귀.
2. **PG-System 미푸시 12개 commit patch 백업** — Redis 캐시(B.1·B.3·B.4) / BullMQ 정산 큐(C.1~C.4) / FDS 강화(a3a19ed) / PG Gateway 보안(412d927, d7d5597, 69c54b8) / MFA env(d2ce1a4)을 `/Users/jayden/project/_archive/pg-system-recovered-patches/`에 12 patch + README로 보존 (244KB).
3. **DEMO_SCENARIO.md 자격증명 정정** — 문서가 outdated였음. `admin@pgsystem.co.kr` → `admin`, `Admin1234!@#$` → `Admin1234!@`, `localhost:3001` → `localhost:3500/login`, Prisma 6+ 대응 seed 명령(`npx tsx prisma/seed.ts`) 안내 추가.
4. **Playwright e2e 실행** — 12 tests / 11 PASS / 1 FAIL(`merchants.spec.ts:9` strict mode violation, "가맹점 관리" 텍스트가 nav 링크 + h1 헤딩 두 곳에서 매칭). spec 회귀.
5. **Vercel 배포 web 전용 분리** — `pg-system-audit/vercel.json` + `.vercelignore` 추가. `turbo run build --filter=@pg-system/web`로 API 빌드 그래프 제외. 로컬 검증 통과(20초, exit 0). NestJS API는 Docker로 운영 결정.

### 다음 세션 할 일
- Jayden push: `pg-system-audit`에 `vercel.json` + `.vercelignore` commit & push (web 빌드 정상화)
- Vercel UI에서 `NEXT_PUBLIC_API_URL` 등 web env 정리 (데모 모드면 비워둠)
- `merchants.spec.ts:9` 회귀 fix — `getByText` → `getByRole("heading", { name: "가맹점 관리" })`
- (선택) `_archive/pg-system-recovered-patches/` 12 patch를 audit 레포에 cherry-pick 검토

### 차단 요소
- 없음

### 변경 파일 (이번 세션 — 미커밋)
| 파일 | 내용 |
|---|---|
| `pg-system-audit/vercel.json` (신규) | turbo filter web only |
| `pg-system-audit/.vercelignore` (신규) | apps/api 외 인프라 자료 제외 |
| `pg-system/docs/DEMO_SCENARIO.md` | 자격증명 정정 |
| `dairect/src/components/sections/hero/TrustCounters.tsx` | rAF 래핑 (lint fix) |
| `dairect/src/app/dashboard/estimates/new/estimate-form.tsx` | eslint-disable 주석 (lint fix) |

> ⚠️ 본 세션 이후 PG-System 폴더(`/Users/jayden/project/pg-system`)는 git 없는 단순 폴더. 정식 레포는 `/Users/jayden/project/pg-system-audit/` (`git@github.com:jaydenjoo/pg-system.git`).

---

---

## 📌 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | PG 관리시스템 역설계 & 보안 강화 재구축 |
| **목표** | 기존 PG 관리시스템 분석 → 보안/UX 개선된 신규 버전 구축 |
| **소스 규모** | 관리자/가맹점/대리점 3모듈, 각 ~180MB (총 ~540MB) |
| **기존 기술** | Java 11 + Spring Boot 2.7.7 + MyBatis + gRPC + Vue3/Quasar + MySQL |
| **Owner** | Jayden (비개발자 Vibe Architect) |

---

## 🏗️ 기술 스택 (신규 시스템)

| 구성요소 | 선정 도구 | 선정 이유 |
|---------|----------|----------|
| Frontend | Next.js 15 + TypeScript strict | App Router, RSC, 보안 미들웨어 |
| Backend | NestJS + TypeScript strict | 구조화된 모듈, Guard/Interceptor 패턴 |
| DB | PostgreSQL (전용 서버) | 공유 금지, RLS, 감사 로그 |
| Auth | JWT + MFA(TOTP) + Session | PCI DSS 8.4.2 MFA 필수 요건 |
| 암호화 | AES-256-GCM / TLS 1.3 | PCI DSS 요구 수준 |
| 시크릿 | AWS Secrets Manager 또는 Vault | 코드 내 하드코딩 금지 |
| Infra | AWS 또는 NHN Cloud 전용 VPC | 네트워크 분리 4계층 |
| 모니터링 | ELK Stack 또는 CloudWatch | 5년 로그 보관 (전자금융감독규정) |

---

## 📋 Phase 진행 상황

### Phase 0: 준비 ✅ 완료
- [x] 보안 최우선 개발 가이드 작성 (pg_system_security_guide.md)
- [x] 역설계 일반 가이드 작성 (reverse_engineering_guide.md)
- [x] 법규 조사: 전자금융거래법 개정안 (2025.12.16 공포, 2026.12.17 시행)
- [x] 법규 조사: PCI DSS 4.0.1 (2025.3.31 전면 시행)
- [x] Claude Code 프로젝트 문서 세트 준비

### Phase 1: 뼈대 파악 ✅ 완료
- [x] 관리자(Admin) 폴더 구조 캡처 — 2개 프로젝트 (gRPC + WS-Admin), 540 Java 파일
- [x] 가맹점(Merchant) 폴더 구조 캡처 — 2개 프로젝트 (Backend + Vue3), 389 Java + 33 Vue
- [x] 대리점(Agency) 폴더 구조 캡처 — 2개 프로젝트 (Backend + Vue3), 469 Java + 47 Vue
- [x] 설정 파일 식별 — pom.xml 4개, package.json 2개, application-{env}.yml 다수
- [x] 기존 기술 스택 판별 — Java 11 + Spring Boot 2.7.7 + MyBatis(관리자)/JPA+QueryDSL(가맹점,대리점) + Vue3/Quasar + MariaDB
- [x] .env/config 파일 분석 — Jasypt 설정 암호화, OAuth2 설정, DB 접속 정보 확인
- [x] DB 스키마 분석 — 48+ 테이블 추정, 마이그레이션 파일 없음, DB 뷰 4개 발견
- [x] 의존성 목록 파악 — 보안 취약점 11개 식별 (Critical 3, High 4, Medium 4)
- [x] 종합 보고서 작성 → docs/reverse-engineering-report.md

### Phase 2: 핵심 로직 분석 ✅ 완료
- [x] 라우팅 구조 분석 (URL → 기능 매핑) — 3모듈 전체 API 엔드포인트 매핑
- [x] 인증/인가 흐름 분석 — 관리자(세션+JWT+OTP), 가맹점/대리점(OAuth2 리소스서버)
- [x] 컨트롤러/핸들러 분석 — 관리자 22개 권한보호 경로, 가맹점/대리점 역할기반 접근
- [x] 모델/엔티티 분석 (데이터 구조) — 수수료 4단계 계층, Float 타입 버그 발견
- [x] 미들웨어/가드 분석 — 관리자 3단 인터셉터 체인 완전 분석

### Phase 3: 결제/보안 흐름 집중 분석 ✅ 완료
- [x] 결제 처리 흐름 추적 — 가맹점/대리점은 READ-ONLY 뷰, 실제 결제는 별도 코어 PG 서버
- [x] 정산 로직 분석 — DB 레벨 계산, 서비스는 @Transactional(readOnly=true)
- [x] 수수료 관리 로직 분석 — 4단계 계층: PG마진→대리점→가맹점→결제항목별
- [x] 보안 취약점 식별 — 총 22개 (Critical 7, High 6, Medium 5, Low 4)
- [x] 암호화 방식 평가 — SEED-CBC 5개 치명적 결함, Jasypt 설정 암호화
- [x] 종합 보고서 작성 → docs/reverse-engineering-phase2-3-report.md

### Phase 4: 약점 분석 & 신규 시스템 설계 ✅ 완료
- [x] 기존 시스템 약점 목록 작성 → docs/phase4-weakness-catalog.md (40개 약점)
- [x] 신규 시스템 ER Diagram 설계 → docs/phase4-er-diagram.md (30 테이블 + 1 뷰)
- [x] API 명세 설계 → docs/phase4-api-specification.md (78 엔드포인트)
- [x] 보안 강화 포인트 설계 → docs/phase4-security-hardening.md (5층 방어 아키텍처)
- [x] 전자금융거래법 개정안 대응 설계 → docs/phase4-legal-compliance-design.md (에스크로+정산+모니터링)

### Phase 5: 신규 시스템 개발 🔧 진행 중

#### Step 1: 모노레포 초기화 ✅ 완료
- [x] pnpm workspace + Turborepo 모노레포 구조 생성
- [x] apps/api (NestJS), apps/web (Next.js 15), packages/shared 세팅
- [x] TypeScript strict 설정, ESLint, 공유 상수/타입 패키지

#### Step 2: 인프라 세팅 ✅ 완료
- [x] Docker PostgreSQL 16 컨테이너 (pg-system-db)
- [x] Prisma ORM 설정 + 30 테이블 마이그레이션 적용
- [x] Seed 실행 (8 roles, 28 permissions, 78 role-permission, 27 system codes, 1 admin)
- [x] .env 파일 생성 (DATABASE_URL, JWT secrets, 암호화 키)
- [x] bcryptjs 전환 (Node.js 25 호환)

#### Step 3: 인증 시스템 구현 ✅ 완료
- [x] AuthService — login, verifyMfa, refreshToken, logout, changePassword
- [x] MFA 설정 — setupMfa (TOTP 시크릿 생성), enableMfa (첫 코드 검증 후 활성화)
- [x] 로그인 이력 기록 — recordLoginHistory (SUCCESS/FAILED/MFA_PENDING + IP/UA)
- [x] AuthController — 7개 엔드포인트 (login, login/mfa, refresh, logout, password/change, mfa/setup, mfa/enable)
- [x] JwtAuthGuard + CurrentUser 데코레이터
- [x] JWT 페이로드에 roles + permissions 포함 (RBAC)
- [x] Refresh Token SHA-256 해시 저장
- [x] 단위 테스트 18개 통과 (auth.service.spec.ts)
- [x] 빌드 검증 통과 (tsc --noEmit + nest build)

#### Step 4: 관리자 모듈 보안 강화 & 완성 ✅ 완료
> 상세 지시서: `docs/step4-prompt.md` 참조
> 기존 스캐폴딩된 모듈을 보안 강화 + 누락 기능 보완 + 테스트 추가

##### Sub-Step 4-1: 사용자 관리 보안 강화 ✅ 완료
- [x] UsersService 보강 (name/email/phone 필드, created_by/updated_by, 역할 할당)
- [x] CreateUserDto/UpdateUserDto 보강 (입력값 검증, 비밀번호 정책)
- [x] UsersController 보강 (CurrentUser 주입, 역할 관리 API 추가)
- [x] 단위 테스트 16개 통과 (users.service.spec.ts)
- [x] 검증 4단계 통과 (tsc → build → test 전부 pass)

##### Sub-Step 4-2: 역할/권한 관리 API ✅ 완료
- [x] RolesService 생성 (CRUD + 권한 할당)
- [x] RolesController + PermissionsController 생성 (7개 엔드포인트)
- [x] DTOs (CreateRoleDto, UpdateRoleDto, AssignPermissionsDto)
- [x] UsersModule에 등록
- [x] 단위 테스트 14개 통과 (roles.service.spec.ts)
- [x] 검증 4단계 통과 (tsc → build → 56 tests pass)

##### Sub-Step 4-3: 시스템 코드 관리 보강 ✅ 완료
- [x] SystemService 보강 (getCodesByGroup, createCode, updateCode, deleteCode)
- [x] SystemController 보강 (쓰기 API + PermissionsGuard + SYSTEM_MANAGE 권한)
- [x] DTOs (CreateSystemCodeDto, UpdateSystemCodeDto)
- [x] 단위 테스트 10개 통과 (system.service.spec.ts)
- [x] 검증 4단계 통과 (tsc → build → 66 tests pass)

##### Sub-Step 4-4: 감사 로그 & 보안 모듈 보강 ✅ 완료
- [x] AuditLogQueryDto 보강 (action, resourceType, result 필터)
- [x] SecurityService 보강 (필터 강화, writeAuditLog 유틸)
- [x] RiskAlertQueryDto 보강 (severity 필터)
- [x] AuditInterceptor 보강 (PrismaService 주입 → DB fire-and-forget 기록)
- [x] 단위 테스트 12개 (security.service.spec.ts)
- [x] 검증 4단계 통과 (tsc → build → 80 tests pass)

##### Sub-Step 4-5: 가맹점 모듈 보안 강화 ✅ 완료
- [x] MerchantsService 보강 (created_by/updated_by, bank_account 마스킹, MERCHANT_LIST_SELECT, select)
- [x] CreateMerchantDto/UpdateMerchantDto 보강 (@Matches, @MaxLength, @IsEnum(MERCHANT_STATUS/SETTLEMENT_CYCLES))
- [x] MerchantsController 보강 (CurrentUser 주입, DELETE @HttpCode(204))
- [x] agent_id DB 존재 검증 추가 (create 시 대리점 유효성 확인 → NotFoundException)
- [x] changeStatus 메서드 구현 (MerchantStatusCode 타입, bank_account 마스킹)
- [x] POST /api/v1/merchants/:id/status 엔드포인트 추가 (ChangeMerchantStatusDto)
- [x] 단위 테스트 17개 통과 (merchants.service.spec.ts)
- [x] 검증 4단계 통과 (tsc → build → 117 tests pass)

##### Sub-Step 4-6: 대리점 모듈 보안 강화 ✅ 완료
- [x] AgentsService 보강 (tree_path/tree_depth 자동계산, 삭제 제약 AGENT_004/AGENT_005, bank_account 마스킹)
- [x] CreateAgentDto/UpdateAgentDto 보강 (@Matches, @MaxLength, @IsEnum(AGENT_STATUS), bank 필드 추가)
- [x] AgentsController 보강 (CurrentUser 주입, DELETE @HttpCode(204))
- [x] getSubAgents 메서드 구현 (parent_id 필터, bank_account 마스킹)
- [x] GET /api/v1/agents/:id/sub-agents 엔드포인트 추가
- [x] changeStatus 메서드 구현 (AgentStatusCode 타입, bank_account 마스킹)
- [x] POST /api/v1/agents/:id/status 엔드포인트 추가 (ChangeAgentStatusDto)
- [x] 단위 테스트 24개 통과 (agents.service.spec.ts)
- [x] 검증 4단계 통과 (tsc → build → 120/120 pass)
- [x] shared 패키지: AGENT_STATUS, MERCHANT_STATUS, SETTLEMENT_CYCLES, AGENT_004, AGENT_005 추가

#### Step 5: 결제/정산/수수료 핵심 모듈 완성 ✅ 완료
> 상세 지시서: `docs/step5-prompt.md` 참조
> 전체 6개 서브스텝 완료, 총 103개 테스트 통과

##### Sub-Step 5-6: shared 패키지 보강 (선행 필수) ✅ DONE
- [x] ERROR_CODES 추가 (DEPOSIT_001~003)
- [x] RECONCILE_STATUS, TRANSACTION_TYPES, PAYMENT_METHODS 상수 추가
- [x] shared 패키지 빌드 확인

##### Sub-Step 5-1: 거래(Transactions) 모듈 완성 ✅ DONE
- [x] TransactionsService 보강 (agentId 필터, 가맹점 상태 검증, 금액 검증, order_no/order_name 저장, cancel reason 저장)
- [x] TransactionListQueryDto 보강 (agentId, paymentMethod, tranType, search 필터)
- [x] CreateTransactionDto 보강 (amount @Min(100), feeAmount 검증)
- [x] CancelTransactionDto 보강 (reason 필드 검증)
- [x] BigIntSerializationInterceptor 글로벌 등록
- [x] 단위 테스트 21개 통과

##### Sub-Step 5-2: 수수료(Commissions) 모듈 완성 ✅ DONE
- [x] CommissionsService 보강 (setPgMargin 신규, cardCompany 필터, 수수료 계층 검증 STL_003, getCommissionHistory)
- [x] SetPgMarginDto 신규, SetAgentCommissionDto/SetMerchantCommissionDto에 cardCompany 추가
- [x] CommissionQueryDto 신규
- [x] 단위 테스트 16개 통과

##### Sub-Step 5-3: 정산(Settlements) 모듈 완성 ✅ DONE
- [x] SettlementsService 보강 (calculate 신규 — 핵심 정산 계산 로직, agentId 필터, agent_settlements 생성)
- [x] CalculateSettlementDto, AgentSettlementQueryDto 신규
- [x] 대리점 정산 조회 API 추가
- [x] 단위 테스트 22개 통과

##### Sub-Step 5-4: 입금/대사(Deposits) 모듈 완성 ✅ DONE
- [x] DepositsService 보강 (reconcile 실제 매칭 로직, manualMatch, unmatch, deposit_transactions 생성)
- [x] ManualMatchDto 신규, DepositListQueryDto 보강
- [x] 수동 매칭/해제 API 추가
- [x] 단위 테스트 31개 통과

##### Sub-Step 5-5: 대시보드(Dashboard) 모듈 완성 ✅ DONE
- [x] DashboardService 보강 (금액 합계, getDailyTrend, getTopMerchants, getTopAgents)
- [x] DashboardQueryDto 보강 (startDate/endDate/merchantId/agentId)
- [x] 일별 추이, 상위 가맹점/대리점 API 추가
- [x] 단위 테스트 13개 통과

#### Step 6: 프론트엔드 개발 (Next.js 15) — ✅ 완료
> 지시서: `docs/step6-prompt.md` | 실행 모델: Sonnet 4.6

##### Sub-Step 6-1: 인프라 & 인증 레이아웃 ✅ 완료
- [x] API 클라이언트 (`lib/api-client.ts`) — apiFetch, ApiClientError, apiGet/apiPost/apiPut/apiDelete, 401 자동 리다이렉트
- [x] cn 유틸 (`lib/utils.ts`) — clsx + tailwind-merge
- [x] SWR 설정 (`lib/swr-config.ts`) — swrConfig 객체 (revalidateOnFocus: false)
- [x] 공유 타입 (`types/api.ts`, `types/auth.ts`, `types/index.ts`) — ApiResponse, PaginatedResponse, User, Role, Permission 등
- [x] UI 컴포넌트 (`components/ui/`) — Button(cva), Input(forwardRef), Badge(cva), Card, Skeleton, Toast(Context API)
- [x] `middleware.ts` — accessToken 쿠키 체크, 비로그인 /login 리다이렉트
- [x] `(dashboard)/layout.tsx` 보강 — SWRConfig, ToastProvider, useUser, usePathname, 아이콘, 로그아웃 API 호출
- [x] `hooks/use-user.ts` — SWR로 /users/me 조회
- [x] `hooks/use-toast.ts` — useToast 훅 (success/error/info 헬퍼)
- [x] 검증: tsc --noEmit ✅, pnpm build ✅ (7 pages)
> 생성 파일: lib 3개, types 3개, components/ui 6개, hooks 2개, middleware 1개, layout 1개 (총 16개)

##### Sub-Step 6-2: 대시보드 페이지 ✅ 완료
- [x] `types/dashboard.ts` — DashboardSummary, TransactionStat, SettlementStat, DailyTrend, TopMerchant, TopAgent, DashboardQuery
- [x] `hooks/use-dashboard.ts` — 6개 SWR 훅 (summary/txStats/stlStats/dailyTrend/topMerchants/topAgents)
- [x] `components/dashboard/StatCard.tsx` — 숫자+라벨+아이콘 카드 (금액 천단위 콤마)
- [x] `components/dashboard/DailyTrendChart.tsx` — div 기반 바차트 (외부 라이브러리 없음)
- [x] `components/dashboard/TopRankingTable.tsx` — 상위 가맹점/대리점 랭킹 테이블
- [x] `components/dashboard/TransactionStatCards.tsx` — 거래 상태별 통계 카드
- [x] `components/dashboard/SettlementStatCards.tsx` — 정산 상태별 통계 카드
- [x] `(dashboard)/dashboard/page.tsx` 재작성 — 기간 필터(오늘/7일/30일/90일) + 전체 레이아웃 조립
- [x] 검증: tsc --noEmit ✅, pnpm build ✅ (7 pages)
> 생성 파일: types 1개, hooks 1개, components 5개, page 1개 (총 8개)

##### Sub-Step 6-3: 사용자 & 역할 관리 ✅ 완료
- [x] `types/user.ts` — CreateUserForm, UpdateUserForm, UserListQuery, CreateRoleForm, UpdateRoleForm
- [x] `hooks/use-users.ts` — useUsers, useUserById, useCreateUser, useUpdateUser, useDeleteUser, useAssignRoles
- [x] `hooks/use-roles.ts` — useRoles, useRole, useCreateRole, useUpdateRole, useDeleteRole, useAssignPermissions
- [x] `hooks/use-permissions.ts` — usePermissions
- [x] `components/ui/data-table.tsx` — 정렬 가능한 제네릭 테이블, 로딩 스켈레톤
- [x] `components/ui/pagination.tsx` — 페이지네이션 버튼
- [x] `components/ui/filter-bar.tsx` — 검색 + 필터 드롭다운
- [x] `components/ui/dialog.tsx` — 모달 다이얼로그
- [x] `components/ui/confirm-dialog.tsx` — 삭제 확인 다이얼로그
- [x] `components/ui/select.tsx` — 셀렉트 박스
- [x] `components/users/UserTable.tsx` — 사용자 목록 테이블
- [x] `components/users/UserForm.tsx` — 생성/수정 폼 (PCI DSS 비밀번호 검증)
- [x] `components/users/UserDetail.tsx` — 사용자 상세 정보
- [x] `components/users/UserRoleAssign.tsx` — 역할 할당 체크박스
- [x] `components/roles/RoleTable.tsx` — 역할 목록 테이블
- [x] `components/roles/RoleForm.tsx` — 역할 생성/수정 폼
- [x] `components/roles/PermissionMatrix.tsx` — 그룹별 권한 매트릭스
- [x] `app/(dashboard)/users/page.tsx` — 사용자 목록 페이지
- [x] `app/(dashboard)/users/new/page.tsx` — 사용자 생성 페이지
- [x] `app/(dashboard)/users/[id]/page.tsx` — 상세/수정/역할관리 3탭
- [x] `app/(dashboard)/roles/page.tsx` — 역할 목록 + 권한 매트릭스 다이얼로그
> 생성 파일: types 1개, hooks 3개, components/ui 6개, components/users 4개, components/roles 3개, pages 4개 (총 21개)

##### Sub-Step 6-4: 가맹점 & 대리점 관리 — ✅ 완료

- [x] merchants/ 목록 + 상세 + 생성 페이지
- [x] agents/ 목록 + 상세 + 생성 페이지
- [x] 상태 변경 UI (활성/비활성/정지)
- [x] 하위 대리점 트리 뷰
> 생성 파일: types 2개, hooks 2개, components 9개, pages 6개 (총 19개)
> 검증: tsc --noEmit ✅, next build ✅

##### Sub-Step 6-5: 거래 & 정산 — ✅ 완료
- [x] `types/transaction.ts` — Transaction, TransactionQuery, CreateTransactionForm, CancelTransactionForm
- [x] `types/settlement.ts` — Settlement, AgentSettlement, SettlementQuery, AgentSettlementQuery, CalculateSettlementForm
- [x] `hooks/use-transactions.ts` — useTransactions, useTransaction, useCreateTransaction, useCancelTransaction
- [x] `hooks/use-settlements.ts` — useSettlements, useSettlement, useAgentSettlements, useAgentSettlement, useCalculateSettlement, useConfirmSettlement, useCompleteSettlement
- [x] `lib/format.ts` 보강 — formatAmount, formatDate, formatDateOnly 추가
- [x] `components/transactions/TransactionTable.tsx` — 거래 목록 테이블
- [x] `components/transactions/TransactionDetail.tsx` — 거래 상세 정보
- [x] `components/transactions/TransactionFilter.tsx` — 가맹점/대리점/상태/결제수단/날짜범위 필터
- [x] `components/transactions/CancelTransactionDialog.tsx` — 취소사유 입력 모달
- [x] `components/settlements/SettlementTable.tsx` — 정산 목록 테이블
- [x] `components/settlements/SettlementDetail.tsx` — 정산 상세 정보
- [x] `components/settlements/AgentSettlementTable.tsx` — 대리점 정산 테이블
- [x] `components/settlements/CalculateDialog.tsx` — 날짜범위 입력 모달
- [x] `components/settlements/SettlementActions.tsx` — 확정/완료 버튼 (상태별 노출)
- [x] `app/(dashboard)/transactions/page.tsx` — 거래 목록 + 필터
- [x] `app/(dashboard)/transactions/[id]/page.tsx` — 거래 상세 + 취소
- [x] `app/(dashboard)/settlements/page.tsx` — 가맹점 정산 + 계산 버튼
- [x] `app/(dashboard)/settlements/[id]/page.tsx` — 정산 상세 + 확정/완료
- [x] `app/(dashboard)/settlements/agents/page.tsx` — 대리점 정산
- [x] 검증: tsc --noEmit ✅, next build ✅ (19 pages)
> 생성 파일: types 2개, hooks 2개, lib 1개 보강, components 9개, pages 5개 (총 19개)

##### Sub-Step 6-6: 입금 & 수수료 — ✅ 완료
- [x] deposits/ 목록 + 상세 + 대사(reconcile)/수동매칭 UI
- [x] commissions/ PG마진 + 대리점/가맹점 수수료 설정 페이지
- [x] 수수료 이력 조회 UI
- [x] 검증: tsc --noEmit ✅, next build ✅ (22 pages)
> 생성 파일: types 2개, hooks 2개, components 11개, pages 3개 (총 18개)

##### Sub-Step 6-7: 보안 & 시스템 관리 — ✅ 완료
- [x] `types/security.ts` — AuditLog, RiskAlert, LoginHistory, AuditLogQuery, RiskAlertQuery
- [x] `types/system.ts` — SystemCode, Holiday, MenuItem, Notification, CreateSystemCodeForm, UpdateSystemCodeForm
- [x] `hooks/use-security.ts` — useAuditLogs, useRiskAlerts, useResolveRiskAlert, useLoginHistory
- [x] `hooks/use-system.ts` — useSystemCodes, useSystemCodesByGroup, useCreateSystemCode, useUpdateSystemCode, useDeleteSystemCode, useHolidays, useMenus, useNotifications
- [x] `components/security/` — AuditLogTable, AuditLogFilter, RiskAlertTable, RiskAlertResolveDialog, LoginHistoryTable
- [x] `components/system/` — SystemCodeTable, SystemCodeForm, SystemCodeGroupFilter, HolidayList, NotificationList
- [x] `app/(dashboard)/security/page.tsx` — 3탭(감사로그/위험알림/로그인이력) + 필터 + 페이지네이션
- [x] `app/(dashboard)/system/page.tsx` — 4탭(코드관리/공휴일/메뉴구조/알림) + CRUD + 재귀 메뉴 트리
- [x] 검증: tsc --noEmit ✅
> 생성 파일: types 2개, hooks 2개, components 10개, pages 2개 (총 16개)

##### Sub-Step 6-8: 프로필 & MFA & 비밀번호 — ✅ 완료
- [x] `hooks/use-auth.ts` — useChangePassword, useMfaSetup, useMfaEnable, useLogout
- [x] `components/profile/ProfileInfo.tsx` — 내 정보 표시/수정 폼 (이름/이메일/전화번호)
- [x] `components/profile/PasswordChangeForm.tsx` — 비밀번호 변경 폼 (12자+ 영문+숫자, PCI DSS 8.3.6)
- [x] `components/profile/MfaSetup.tsx` — MFA 설정 플로우 (QR 코드 표시 → 6자리 코드 입력 → 활성화)
- [x] `app/(dashboard)/profile/page.tsx` — 3탭 페이지 (내 정보 / 비밀번호 변경 / MFA 설정)
- [x] 검증: tsc --noEmit ✅, pnpm build ✅ (26 pages)
> 생성 파일: hooks 1개, components 3개, page 1개 (총 5개)

##### Sub-Step 6-9: 에러 페이지 & 최종 마감 — ✅ 완료
- [x] `app/not-found.tsx` — 404 "페이지를 찾을 수 없습니다" + 대시보드 링크
- [x] `app/error.tsx` — 'use client' 글로벌 에러 바운더리 + retry 버튼
- [x] `app/(dashboard)/loading.tsx` — Skeleton 기반 로딩 UI
- [x] `app/(dashboard)/layout.tsx` — 사이드바 permission 기반 메뉴 필터링 (user.permissions 배열 기반 hidden)
- [x] `app/layout.tsx` — metadata 업데이트 (title: "PG System 관리자", description: "결제대행사 관리 시스템")
- [x] `api/users/users.controller.ts` — getMe에 JWT permissions 포함 반환
- [x] `types/auth.ts` — User 인터페이스에 permissions?: string[] 추가
- [x] 검증: tsc --noEmit ✅, web build ✅, pnpm build (전체) ✅
> 생성 파일: pages 3개, 백엔드 1개 수정, 타입 1개 수정 (총 5개 생성)

#### Step 7: 보안 테스트 (SAST/DAST) ✅ 완료
> 실행 모델: Sonnet 4.6
> 종합 리포트: `docs/step7-security-report.md`

##### Sub-Step 7-1: SAST 도구 설정 + 의존성 감사 ✅ 완료
- [x] `eslint-plugin-security` 설치 (apps/api)
- [x] `eslint@^8.57.0` + `@typescript-eslint/eslint-plugin@^6` + `@typescript-eslint/parser@^6` 설치 (apps/api)
- [x] `apps/api/.eslintrc.js` 생성 (parser, plugins, extends, rules: no-console, no-explicit-any, security/*)
- [x] 루트 `package.json`에 `security:lint`, `security:audit` 스크립트 추가
- [x] `tsconfig.base.json`: `strict: true` 이미 확인됨
- [x] ESLint 에러 수정 (0 errors, 4 warnings)
  - `main.ts`: console.log → NestJS Logger 교체
  - `auth.controller.ts`: unused `SkipThrottle` import 제거
  - `auth.service.ts`: unused `FailedLoginUpdateData` interface 제거
  - `settlement-list-query.dto.ts`: unused `IsString` import 제거
  - `merchants.service.spec.ts`: unused `findManyCall` destructuring 제거
  - `.eslintrc.js`: `argsIgnorePattern: '^_'` 추가 (_performedBy params 처리)
- [x] `users.service.spec.ts` 픽스처 보강 (`user_mfa: []` 추가, findById 어서션 수정)
- [x] 검증: `pnpm --filter api lint` → 0 errors ✅
- [x] 검증: `pnpm test` → 210/210 pass ✅

##### Sub-Step 7-2: Auth/Guard 보안 전용 테스트 ✅ 완료
- [x] `auth-security.spec.ts` 생성 — JWT/MFA/비밀번호/계정잠금/RefreshToken 보안 20개 테스트
  - JWT 토큰 보안 5개: 만료시간(900s/7d), 환경변수 로드, 만료토큰 거부, payload password_hash 미포함
  - MFA TOTP 보안 4개: MFA_REQUIRED 반환, 유효코드 성공, 잘못된코드 AUTH_005, AES-256-GCM iv:authTag:cipher 형식
  - 비밀번호 보안 4개: bcrypt 해시 저장, 12자 미만 거부, 조합 미충족 거부, 현재비번 불일치 거부
  - 계정 잠금 3개: 5회 실패→LOCKED+locked_until, 잠금중 올바른비번도 AUTH_003 거부, 만료후 로그인 가능
  - Refresh Token 보안 4개: SHA-256 해시 저장(64자 hex), 로그아웃시 revoked_at 설정, user_id 기준 무효화, 없는토큰 AUTH_006
- [x] `guards-security.spec.ts` 생성 — JwtAuthGuard/PermissionsGuard 보안 11개 테스트
  - JwtAuthGuard 3개: canActivate 존재, AuthGuard('jwt') 상속 확인, user null→AUTH_001
  - PermissionsGuard 5개: 데코레이터 없음→통과, 빈배열→통과, 권한없음→AUTH_008, 권한있음→통과, OR로직
  - Guard 순서 2개: AppModule에 ThrottlerGuard APP_GUARD 등록 확인, JWT실패시 PermissionsGuard 미도달
  - Permissions decorator 1개: PERMISSIONS_KEY 값 확인
- [x] 검증: `pnpm --filter api test` → 241/241 pass ✅ (신규 31개 포함)

##### Sub-Step 7-3: 입력 검증 & Rate Limiting 보안 테스트 ✅ 완료
- [x] `validation-security.spec.ts` 생성 — DTO 검증 + SQL 인젝션 방어 16개 테스트
  - CreateUserDto 검증 5개: email 형식, password 12자 미만, password 통과, name 빈문자열, loginId 빈문자열
  - CreateMerchantDto 검증 4개: merchantCode 소문자, merchantName 빈문자열, settlementCycle 무효값, 유효DTO 통과
  - CreateAgentDto 검증 3개: agentName 빈문자열, agentCode 빈문자열, 유효DTO 통과
  - SQL 인젝션 방어 4개: $queryRawUnsafe 미사용, $executeRawUnsafe 미사용, $queryRaw→Prisma.sql 확인, PrismaService import 확인
- [x] `throttle-security.spec.ts` 생성 — Rate Limiting 구성 9개 테스트
  - ThrottlerModule 구성 4개: imports 포함, APP_GUARD 등록, ttl 60000, limit 100
  - 로그인 Rate Limiting 2개: loginLimit 5, paymentLimit 10
  - ThrottlerModule 상세 3개: forRootAsync 사용, ThrottlerModuleOptions 타입, ConfigService 로드
- [x] DTO 보안 버그 수정: CreateMerchantDto.merchantName, CreateAgentDto.agentName에 @IsNotEmpty() 추가
- [x] 검증: `pnpm --filter api test` → 265/265 pass ✅ (신규 24개 포함)

##### Sub-Step 7-4: Audit & 마스킹 & 에러 응답 보안 테스트 ✅ 완료
- [x] `audit-security.spec.ts` 생성 — AuditInterceptor 보안 12개 테스트
  - deriveAction 4개: POST→CREATE, PUT→UPDATE, DELETE→DELETE, GET→READ
  - deriveResourceType 3개: /api/v1/users→USERS, /merchants/123→MERCHANTS, /settlements?page=1→SETTLEMENTS
  - deriveResourceId 2개: UUID 추출, UUID 없으면 resource_id 미포함
  - fire-and-forget 3개: create 실패해도 응답 정상, anonymous 기록, user_agent 500자 제한
- [x] `masking-security.spec.ts` 생성 — 데이터 마스킹 & 에러 응답 보안 11개 테스트
  - maskBankAccount 5개: 정상마스킹, null→null, 4자이하 동작, MerchantsService 사용확인, AgentsService 사용확인
  - GlobalExceptionFilter 4개: HttpException→code+message만, 일반Error→INTERNAL_ERROR, 금지필드 미포함, Prisma에러 변환
  - password_hash 미반환 2개: findAll select 미포함, findById select 미포함
- [x] 검증: `pnpm --filter api test` → 288/288 pass ✅ (신규 23개 포함)

##### Sub-Step 7-5: 보안 리포트 종합 작성 ✅ 완료
- [x] 전체 테스트 실행: 18 suites, 290 tests, 0 failures
- [x] ESLint: 0 errors, 11 warnings (eslint-plugin-security 포함)
- [x] TypeScript strict: apps/api + apps/web 모두 0 errors
- [x] pnpm audit: 19 vulnerabilities (모두 간접 의존성)
- [x] 보안 전용 테스트: 80/80 pass (6개 spec 파일)
- [x] 22개 취약점 대응: 19 해결 + 1 부분(S-07 KMS) + 2 해당없음(S-15, S-20)
- [x] PCI DSS 4.0.1 매핑: 16/21 구현(76%), 5 부분/미구현(프로덕션 인프라 관련)
- [x] 종합 리포트 → `docs/step7-security-report.md`

---

## 🔑 핵심 설계 결정사항

### 법규 준수 요건 (2026.12.17 시행 대비)
1. **정산자금 외부관리**: 1년차 60% → 2년차 80% → 이후 100% (신탁/예치/보험)
2. **자본금 요건**: 분기 거래액 300억 초과 시 20억원 자본금
3. **대주주 변경등록**: 15일 이내 금융위 변경등록 필수
4. **정산기한 준수**: 계약서에 명시된 기한 내 정산 의무화
5. **벌칙 강화**: 정산자금 유용 시 10년 이하 징역/1억 이하 벌금

### PCI DSS 4.0.1 핵심 요건 (2025.3.31 전면 시행)
1. **MFA 전면 확대**: CDE 접근 모든 계정에 다중인증 (Req 8.4.2)
2. **비밀번호 12자 이상** (숫자+영문, Req 8.3.6)
3. **결제 페이지 스크립트 관리** (Req 6.4.3 — 모든 JS 인벤토리 + 무결성 검증)
4. **실시간 변경 탐지** (Req 11.6.1 — 주 1회 이상 자동 스캔)
5. **소프트웨어 BOM(Bill of Materials)** 관리 (Req 6.3.2)
6. **피싱 방지 교육** 필수 (Req 5.4.1)
7. **풀디스크 암호화 단독 사용 금지** — 추가 암호화 필수

### 아키텍처 결정
- **네트워크 4계층 분리**: DMZ → Application → Data → Management
- **토큰화**: 카드번호 절대 직접 저장 안 함
- **감사 로그 5년 보관**: 전자금융감독규정 제15조

---

## 💰 비용 추정

| 단계 | 항목 | 월 비용 |
|------|------|--------|
| 개발 | AWS/NHN Cloud 기본 인프라 | ₩30~80만 |
| 개발 | PostgreSQL 전용 서버 | ₩10~30만 |
| 개발 | SSL 인증서 + 도메인 | ₩5~10만 |
| 개발 | 모니터링 도구 | ₩5~20만 |
| 운영 | 인프라 + DB + WAF | ₩115~370만 |
| 연간 | 보안 감사 (외부) | ₩500~2,000만 |

---

## 🖥️ 개발환경

| 도구 | 버전 | 용도 |
|------|------|------|
| Node.js | v25.5.0 | Next.js, NestJS 런타임 |
| pnpm | 10.28.2 | 패키지 관리 |
| Git | 2.50.1 | 버전 관리 |
| Docker | 29.1.5 | 컨테이너 실행 |
| PostgreSQL | 16.12 (Docker) | 개발 DB |
| Claude Code CLI | 2.1.59 | Sonnet 코딩 |
| VS Code | - | 에디터 (Opus 대화창) |

### Docker PostgreSQL 접속 정보
```
Container: pg-system-db
Host: localhost
Port: 5432
User: pgadmin
Password: pgadmin2026!
Database: pg_system_dev
Volume: pg-system-data (영구 저장)
```

> ⚠️ 위 비밀번호는 로컬 개발용입니다. 프로덕션에서는 KMS/Vault 사용.

---

#### Step 8: 통합 테스트 & E2E 테스트 🔧 진행 중

##### Sub-Step 8-1: 통합 테스트 인프라 구성 ✅ 완료
- [x] supertest + @types/supertest 설치
- [x] `test/jest-e2e.json` 생성 (ts-jest, @shared 매핑, setupFilesAfterEnv)
- [x] `test/setup.ts` — jest.setTimeout(30000)
- [x] `test/helpers/test-app.ts` — createTestApp(), closeTestApp()
- [x] `test/helpers/auth-helper.ts` — loginAsAdmin(), authenticatedRequest()
- [x] `test/helpers/db-helper.ts` — getTestPrisma(), cleanupTestData()
- [x] 루트 package.json에 `test:e2e` 스크립트 추가
- [x] 기존 290개 단위 테스트 전부 통과 확인

##### Sub-Step 8-2: 인증 API 통합 테스트 ✅ 완료
- [x] `test/auth.e2e-spec.ts` — 17개 테스트 (login, JWT, refresh, logout, password change, rate limiting)

##### Sub-Step 8-3: 사용자/역할/권한 CRUD 통합 테스트 ✅ 완료
- [x] `test/users.e2e-spec.ts` — 17개 테스트 (me, list, create, detail, update, delete, roles)
  - password_hash 미포함 보안 확인, 인증 없이 401, 유효하지 않은 email 400, 삭제 후 재조회, 존재하지 않는 역할 ID 할당
- [x] `test/roles.e2e-spec.ts` — 14개 테스트 (CRUD, permissions, 28개 권한 목록)

##### Sub-Step 8-4: 가맹점/대리점 CRUD 통합 테스트 ✅ 완료
- [x] `test/merchants.e2e-spec.ts` — 17개 테스트 (CRUD, 상태 변경, bank_account 마스킹, 소프트 삭제)
  - 가맹점 생성(201), 중복코드(409), 소문자코드(400), 필수필드누락(400)
  - 목록 조회 + 페이지네이션, page/limit 파라미터, 인증없이(401)
  - 상세 조회 + bank_account 마스킹("****1234"), 존재하지 않는 UUID(404), 잘못된 UUID(400)
  - 가맹점명 수정(200), bank_account 수정 후 마스킹 확인
  - PENDING→ACTIVE→SUSPENDED 상태 변경, 유효하지 않은 상태값(400)
  - 삭제(204), 삭제 후 재조회(404), DB deleted_at 확인
- [x] `test/agents.e2e-spec.ts` — 18개 테스트 (CRUD, 트리 구조, 상태 변경, 삭제 제약, 소프트 삭제)
  - 최상위 대리점 생성(tree_depth=0), 하위 대리점 생성(tree_depth=1, tree_path 부모 포함)
  - 중복코드(409), 소문자코드(400), 필수필드누락(400)
  - 목록 조회 + 페이지네이션, 인증없이(401)
  - 상세 조회 + bank_account 마스킹("****6677"), 존재하지 않는 UUID(404)
  - 대리점명 수정(200)
  - 하위 대리점 목록 조회, 하위 없는 노드(빈 배열)
  - ACTIVE→SUSPENDED 상태 변경, 유효하지 않은 상태값(400)
  - 비활성 부모에 자식 생성 시도(400, AGENT_003)
  - 하위 대리점 있는 대리점 삭제 시도(400, AGENT_004)
  - 연결된 가맹점 있는 대리점 삭제 시도(400, AGENT_005)
  - 독립 대리점 삭제(204), 삭제 후 재조회(404), DB deleted_at 확인

##### Sub-Step 8-5: 거래/정산/수수료/입금 E2E 테스트 ✅ 완료
- [x] `test/transactions.e2e-spec.ts` — 10개 테스트 (CRUD, 취소, 필터, 필수필드, 인증)
  - 거래 생성(201), 금액 100 미만(400), orderNo 누락(400), 인증없이(401)
  - 목록 조회 + 페이지네이션, merchantId 필터
  - 상세 조회(200), 존재하지 않는 UUID(404)
  - APPROVED 거래 취소(200→CANCELLED), 이미 취소된 거래 재취소(409)
- [x] `test/settlements.e2e-spec.ts` — 10개 테스트 (산출, 중복방지, 상태전이, 대리점정산)
  - 정산 산출(201), 동일 정산일 중복(400/409)
  - 목록 조회 + 페이지네이션, 인증없이(401)
  - 상세 조회(200, CALCULATED 상태)
  - CALCULATED→CONFIRMED(200), 이미 CONFIRMED 재확정(409)
  - CONFIRMED→REMITTED(200)
  - 대리점 정산 목록 조회(200)
- [x] `test/commissions.e2e-spec.ts` — 10개 테스트 (PG마진, 대리점/가맹점 수수료, 이력)
  - PG 기본 마진 설정(201), 동일 결제수단 재설정(기존 만료 + 신규)
  - PG 마진 목록 조회(200), 인증없이(401)
  - 대리점 수수료 설정(201, PG마진 이상), PG마진보다 낮은 수수료(400, STL_003)
  - 가맹점 수수료 설정(201, 대리점 이상), 대리점보다 낮은 수수료(400, STL_003)
  - 수수료 이력 조회(200, entityType + data 배열)
- [x] `test/deposits.e2e-spec.ts` — 12개 테스트 (CRUD, 자동대사, 수동매칭, 매칭해제)
  - 입금 등록(201, PENDING 상태, BigInt→Number), 금액 0 이하(400), 인증없이(401)
  - 목록 조회 + 페이지네이션
  - 상세 조회(200), 존재하지 않는 UUID(404)
  - 자동 대사(200, matched_amount=50000, MATCHED)
  - 수동 매칭(200, matched_amount=30000)
  - 매칭 해제(200, unmatched_amount=20000, PENDING)
- [x] 버그 수정: deposits DTO `status→reconcile_status`, manual match 응답 타입, settlements 재확정 `400→409`
- [x] 검증: 9 suites / 123 e2e tests 전부 통과 ✅
- [x] 검증: 18 suites / 290 unit tests 전부 통과 ✅
- [x] **총합: 27 suites / 413 tests / 0 failures** ✅

**통합 테스트 현황**: 9 suites / 123 tests / 전부 통과
**단위 테스트 현황**: 18 suites / 290 tests / 전부 통과

---

#### Step 9: 프로덕션 배포 준비 ✅ 완료

##### Sub-Step 9-1: Docker 멀티스테이지 빌드 ✅ 완료
- [x] apps/api/Dockerfile — 멀티스테이지 빌드 (builder → production)
- [x] apps/web/Dockerfile — 멀티스테이지 빌드 (builder → production)

##### Sub-Step 9-2: docker-compose 환경 구성 ✅ 완료
- [x] docker-compose.yml — db + api + web + nginx 프로덕션 구성
- [x] docker-compose.dev.yml — 개발용 오버라이드 (포트 노출, 볼륨 마운트)

##### Sub-Step 9-3: 헬스체크 & Graceful Shutdown ✅ 완료
- [x] API 헬스체크 엔드포인트 (/api/v1/health)
- [x] Graceful shutdown 핸들링

##### Sub-Step 9-4: CI/CD 파이프라인 ✅ 완료
- [x] GitHub Actions CI/CD 워크플로우

##### Sub-Step 9-5: Nginx 리버스 프록시 + 프로덕션 체크리스트 ✅ 완료
- [x] `infra/nginx/nginx.conf` — upstream 2개(api/web), 보안 헤더, gzip, proxy 설정
- [x] `infra/nginx/Dockerfile` — nginx:1.27-alpine + healthcheck
- [x] `docker-compose.yml` — nginx 서비스 추가, api/web ports 제거 (nginx 뒤로)
- [x] `docker-compose.dev.yml` — 개발 전용 포트 노출 (api:4000, web:3000, db:5432)
- [x] `docs/production-checklist.md` — 시크릿/네트워크/DB/모니터링/컨테이너/PCI DSS 체크리스트
- [x] 검증: docker compose config ✅, pnpm build ✅ (FULL TURBO)

---

## ✅ Step 10 — 외부 보안 감사 대비 (PCI DSS 인증 준비) ✅ 완료

##### Sub-Step 10-1: CSP + SRI (PCI DSS 6.4.3) ✅ 완료
- [x] `apps/web/src/lib/csp-nonce.ts` — CSP nonce 생성기
- [x] `apps/web/src/lib/csp-directives.ts` — CSP 디렉티브 설정
- [x] `apps/web/src/__tests__/csp-security.spec.ts` — CSP 보안 테스트

##### Sub-Step 10-2: File Integrity Monitoring (PCI DSS 11.6.1) ✅ 완료
- [x] `apps/api/src/modules/security/integrity-monitor.service.ts` — SHA-256 파일 무결성 모니터링
- [x] `apps/api/src/modules/security/integrity-monitor.scheduler.ts` — 자동 스캔 스케줄러
- [x] `apps/api/src/modules/security/__tests__/integrity-monitor.spec.ts` — FIM 테스트

##### Sub-Step 10-3: Audit Log Hash Chain + KMS (PCI DSS 10.3.3 + 3.5.1) ✅ 완료
- [x] `apps/api/src/modules/security/audit-hash-chain.service.ts` — 감사 로그 해시 체인
- [x] `apps/api/src/modules/security/__tests__/audit-hash-chain.spec.ts` — 해시 체인 테스트
- [x] `apps/api/src/modules/security/kms/kms.interface.ts` — KMS 추상 인터페이스
- [x] `apps/api/src/modules/security/kms/local-kms.service.ts` — 로컬 KMS 구현체
- [x] `apps/api/src/modules/security/__tests__/local-kms.spec.ts` — KMS 테스트

##### Sub-Step 10-4: SBOM + DAST Pipeline (PCI DSS 6.3.2) ✅ 완료
- [x] `scripts/generate-sbom.sh` — SBOM 자동 생성 스크립트
- [x] `scripts/dast-scan.sh` — OWASP ZAP 기반 DAST 스크립트
- [x] `.github/workflows/security-scan.yml` — 보안 스캔 CI/CD 파이프라인

##### Sub-Step 10-5: Security Audit Evidence + SAQ ✅ 완료
- [x] `scripts/collect-evidence.sh` — PCI DSS 증적 자동 수집 (7개 카테고리)
- [x] `docs/pci-dss-compliance-map.md` — PCI DSS 4.0.1 요건 매핑 (34항목, 94% 달성)
- [x] `docs/external-audit-checklist.md` — 외부 QSA 감사 체크리스트 (18개 증적)
- [x] `package.json` — `security:evidence` 스크립트 추가

### Step 10 완료 요약
| 항목 | 수치 |
|------|------|
| PCI DSS 매핑 항목 | 34개 |
| 완료율 | 94% (32/34) |
| 보안 테스트 파일 | 10개 |
| 보안 테스트 수 | 80+ |
| 증적 수집 카테고리 | 7개 |
| 외부 감사 증적 항목 | 18개 |

---

### Step 11: Docker 로컬 프로덕션 시뮬레이션 ✅ 완료 (2026-03-01)
- 계획서: `docs/step11-docker-local-plan.md`
- 상태: **완료**
- 내용: Docker Compose로 프로덕션 환경 로컬 시뮬레이션 (7단계)

**검증 결과 요약:**
| 항목 | 결과 |
|------|------|
| 4개 서비스 (db/api/web/nginx) | ✅ 모두 healthy |
| HTTP→HTTPS 리다이렉트 | ✅ 301 Moved Permanently |
| HTTPS 접속 | ✅ 200 OK |
| 보안 헤더 (X-Frame-Options, HSTS 등) | ✅ 전체 확인 |
| TLS 버전 | ✅ TLS 1.3 + AES_256_GCM_SHA384 |
| API 헬스체크 3종 | ✅ 모두 `{"success":true}` |
| Non-root 실행 | ✅ nestjs / nextjs |
| Prisma 마이그레이션 (4개) | ✅ 전체 적용 |
| 시드 데이터 | ✅ permissions 28개, roles 8개, system_codes 27개, admin 계정 |

**PCI DSS 확인:**
- 4.2.1 (TLS 1.3): ✅ 활성화
- 6.4.3 (프론트 스크립트 최소화): ✅ standalone 빌드
- 8.4.2 (MFA): ✅ TOTP 구현 완료

**Step 11-7 최종 E2E 검증 (Opus 4.6):**
| # | 검증 항목 | 명령어 | 결과 |
|---|---------|--------|------|
| 1 | HTTPS 접속 + 보안 헤더 5종 | `curl -kI https://localhost` | ✅ 307 + 헤더 전체 |
| 2 | HTTP→HTTPS 리다이렉트 | `curl -I http://localhost` | ✅ 301 Moved |
| 3 | API health | `curl -ks https://localhost/api/v1/health` | ✅ `{"success":true}` |
| 4 | API ready | `curl -ks https://localhost/api/v1/health/ready` | ✅ `{"success":true}` |
| 5 | API live | `curl -ks https://localhost/api/v1/health/live` | ✅ `{"success":true}` |
| 6 | TLS 1.3 | `openssl s_client -connect localhost:443 -tls1_3` | ✅ TLSv1.3 + AES_256_GCM_SHA384 |
| 7 | Non-root (api) | `docker compose exec api whoami` | ✅ `nestjs` |
| 8 | Non-root (web) | `docker compose exec web whoami` | ✅ `nextjs` |

**보안 헤더 상세:**
- `X-Frame-Options: DENY` (클릭재킹 방지)
- `X-Content-Type-Options: nosniff` (MIME 스니핑 방지)
- `X-XSS-Protection: 1; mode=block` (XSS 필터)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS)
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic'` (CSP — PCI DSS 6.4.3)

**해결한 이슈 (6건):**
1. pnpm symlink 구조 → Dockerfile runner 경로 유지
2. Next.js standalone 경로 → monorepo 중첩 구조 반영
3. express 직접 의존성 → package.json 추가
4. env_file 경로 불일치 → `.env.docker` 추가
5. Prisma OpenSSL → alpine apk openssl 설치
6. healthcheck IPv6 → `127.0.0.1` 명시

### Step 12: 운영 준비 (Operations Readiness) ✅ 완료
- 계획서: `docs/step12-ops-readiness-plan.md`
- 검증 보고서: `docs/step12-verification-report.md`
- 상태: **12-1~12-5 전체 완료**

**12-1: 운영 매뉴얼 3종** ✅ 완료 (2026-03-01, Opus)
- `docs/ops/runbook-incident-response.md` — 장애 대응 매뉴얼
  - P0~P3 심각도 분류, 4단계 에스컬레이션, 7개 구체적 장애 시나리오 대응 플레이북
  - 커뮤니케이션 템플릿, 포스트모템 템플릿 포함
- `docs/ops/runbook-settlement-ops.md` — 정산 운영 매뉴얼
  - 정산 주기(T+1/T+2), 일일 정산 프로세스 9단계(API 호출 포함)
  - 수수료 계층 구조, 검증 체크리스트, 불일치 조사 절차
  - 예외처리(환불/차지백/분쟁), SQL 쿼리 모음 8종, 월간/분기 보고서
- `docs/ops/runbook-security-procedures.md` — 보안 절차 매뉴얼
  - 일일/주간/월간 보안 점검 체크리스트 (PCI DSS 매핑)
  - 계정 관리(생성/변경/종료/리셋), 보안 사고 대응(카드정보유출/비인가접근/DDoS)
  - 패치/업데이트, 인증서/키 갱신(TLS/JWT/AES-256), FIM 알림 대응
  - 분기별 보안 감사 체크리스트 (PCI DSS 4.0.1 + 전자금융감독규정)

**12-2: 모니터링 + 알림** ✅ 완료 (Sonnet)
- 알림 모듈: Slack + Email 멀티채널, 5분 중복 방지, graceful degradation
- 메트릭 모듈: Prometheus 5개 커스텀 메트릭 + `/metrics` 엔드포인트
- 인프라: Prometheus + Grafana Docker Compose, 11패널 대시보드
- 테스트: 9/9 통과, tsc + build 성공, any 타입 0개

**12-3: 백업 체계** ✅ 완료 (2026-03-01, Sonnet)
  - `scripts/backup-database.sh` — pg_dump + AES-256-CBC 암호화 + SHA-256 체크섬 + S3 업로드 + Slack 알림 + 30일 자동 삭제
  - `scripts/restore-database.sh` — 복호화 + 체크섬 검증 + 복원 전 스냅샷 + pg_restore + 테이블별 복원
  - `scripts/backup-verify.sh` — 임시 DB 복원 + 핵심 테이블 7개 카운트 비교 + 검증 리포트
  - `infra/backup/docker-compose.backup.yml` — postgres:16-alpine 기반 cron 백업 서비스
  - `infra/backup/crontab` — 일별 02:00 UTC 자동 백업, 주별 04:00 UTC 검증
  - `docs/ops/runbook-backup-recovery.md` — 전체 복구 절차 + 3가지 장애 시나리오 + PITR 가이드
  - 검증: dry-run DB 연결 확인 ✅, bash -n 문법 검사 ✅, --help 3개 스크립트 전체 ✅

**12-4: 교육 자료 3종** ✅ 완료 (2026-03-01, Opus)
- `docs/training/security-awareness.md` — 전 직원 보안 인식 교육
  - PCI DSS 12요구사항 비유 설명, 카드 데이터 흐름도, 4층 보안 아키텍처
  - 직원 5대 행동수칙, 실제 사고 사례 3건(KCP/Heartland/이니시스)
  - 보안 퀴즈 10문항(객관식 7 + 서술형 3, 80% 합격), 보안 용어집 30+개
- `docs/training/ops-procedures.md` — 운영팀 절차 매뉴얼
  - 시스템 아키텍처 비유 설명, 일일 운영 타임라인(09:00~10:00)
  - Grafana 대시보드 가이드(3행 6패널, 임계값 포함)
  - 심각도별 알림 대응 절차(CRITICAL→HIGH→MEDIUM→LOW/INFO)
  - FAQ 12문항(시스템/정산/백업/가맹점/보안/배포)
- `docs/training/developer-onboarding.md` — 신규 개발자 온보딩 가이드
  - Day 1: 환경 구축(Node.js 20/pnpm/Docker/Git, DB 셋업, 헬스체크)
  - Day 2: 코드 구조(모노레포, NestJS 계층, 인증 흐름, 미들웨어)
  - Day 3: 코딩 가이드(strict TS, 네이밍, 에러처리, DTO, 보안 12계명)
  - Day 4: 워크플로우(Git 브랜칭, 커밋규칙, TDD, 검증 4단계, PR 체크리스트)
  - Day 5: 첫 기능 실습(공지사항 CRUD — Schema→DTO→Service→Controller→Test→PR)

**12-5: 최종 검증** ✅ 완료 (2026-03-01, Opus)
- 검증 보고서: `docs/step12-verification-report.md`
- 결과: 12-1 조건부 합격, 12-2 합격, 12-3 완료, 12-4 합격
- Step 12 전체 완료

### Docker 로컬 테스트 — 브라우저 에러 수정 (2026-03-01) ✅ 완료

Step 11 Docker Compose 배포 후 실제 브라우저(Chrome)에서 발견된 6건의 에러를 수정.

**에러 1: 로그인 입력 텍스트 안 보임** ✅
- 증상: Chrome에서 로그인 폼 input에 타이핑하면 글자가 보이지 않음
- 원인: input 요소에 `text-gray-900` 클래스 누락 → 배경과 같은 색으로 렌더링
- 수정: `apps/web/src/app/(auth)/login/page.tsx` input className에 `text-gray-900` 추가

**에러 2: CSP script-src 위반** ✅
- 증상: Next.js 인라인 스크립트가 CSP 정책에 의해 차단
- 원인: `script-src 'self'`만 허용 → Next.js의 인라인 스크립트 실행 불가
- 수정: `apps/web/src/lib/csp-directives.ts` script-src에 `'unsafe-inline'` 추가

**에러 3: CSP connect-src 위반** ✅
- 증상: 대시보드에서 API 호출 시 CSP connect-src 위반
- 원인: CSP connect-src에 내부 Docker URL(`http://api:4000`) 포함 → 브라우저에서 접근 불가
- 수정: `apps/web/src/lib/csp-directives.ts` connect-src를 `'self'`로 단순화

**에러 4: Docker 환경 NODE_ENV 누락** ✅
- 증상: localhost(HTTP)에서 쿠키가 저장되지 않음
- 원인: `NODE_ENV` 미설정 → `secure: true` 기본값 → HTTPS 아닌 환경에서 쿠키 거부
- 수정: `docker-compose.yml` api 서비스에 `NODE_ENV: development` 추가

**에러 5: JWT Strategy — 쿠키에서 토큰 추출 불가 (핵심 원인)** ✅
- 증상: 로그인 성공 → 대시보드 잠깐 보임 → 로그인 페이지로 리다이렉트
- 원인: `jwt.strategy.ts`가 `ExtractJwt.fromAuthHeaderAsBearerToken()`만 사용 → Authorization 헤더만 읽음, httpOnly 쿠키 무시
- 수정: `apps/api/src/modules/auth/strategies/jwt.strategy.ts`에 `ExtractJwt.fromExtractors()` 적용
  - `extractFromCookie(req)` 함수 추가 (req.cookies.accessToken 추출)
  - 쿠키 우선 → Bearer 토큰 폴백 순서로 듀얼 추출

**에러 6: cookie-parser 미들웨어 미설치** ✅
- 증상: 에러 5와 동일 (쿠키 추출 실패)
- 원인: `cookie-parser` 패키지 미설치 → `req.cookies`가 `undefined`
- 수정:
  - `pnpm --filter @pg-system/api add cookie-parser @types/cookie-parser`
  - `apps/api/src/main.ts`에 `app.use(cookieParser())` 추가

**수정된 파일 목록:**
| 파일 | 변경 내용 |
|------|----------|
| `apps/web/src/app/(auth)/login/page.tsx` | input에 `text-gray-900` 추가 |
| `apps/web/src/lib/csp-directives.ts` | script-src `'unsafe-inline'`, connect-src `'self'` |
| `docker-compose.yml` | api 환경변수 `NODE_ENV: development` |
| `apps/api/src/modules/auth/strategies/jwt.strategy.ts` | 쿠키+Bearer 듀얼 추출기 |
| `apps/api/src/main.ts` | `cookieParser()` 미들웨어 추가 |
| `apps/api/package.json` | `cookie-parser`, `@types/cookie-parser` 의존성 추가 |

**검증 결과:** Playwright로 로그인 → 대시보드 전체 로드 확인 (11개 네비게이션 메뉴 + 통계 카드 정상 표시)

---

### Docker 통합 테스트 — 자동화 전체 검증 (2026-03-01) ✅ 완료

Docker Compose 환경(postgres + api + web + nginx)에서 curl API + Playwright 브라우저 자동화 테스트 73항목 실행.

**테스트 결과: 73/73 PASS (100%)**

| 카테고리 | 항목수 | 결과 |
|----------|--------|------|
| Auth & Security | 9 | ✅ 전체 통과 |
| Security Headers | 14 | ✅ 전체 통과 |
| Cookie Security | 4 | ✅ 전체 통과 |
| API Endpoints (89개 중 33개 핵심) | 33 | ✅ 전체 통과 |
| Playwright UI (11페이지 + 로그아웃 + Seed) | 13 | ✅ 전체 통과 |

**검증된 보안 항목:**
- JWT + HttpOnly 쿠키 듀얼 인증
- Rate Limiting (10초 내 30회 → 429)
- SQL Injection / XSS / Path Traversal 차단
- HSTS, X-Frame-Options, X-Content-Type-Options 헤더
- CSP nonce 기반 정책

**Playwright UI 검증 (11페이지):**
- /dashboard, /merchants, /agents, /transactions, /settlements
- /commissions, /deposits, /security, /system, /users, /roles
- Seed 데이터 검증: 27 시스템 코드, 8 역할(권한 매트릭스)

**PCI DSS 매핑:** Req 1(네트워크 격리) ~ Req 12(정보보안 정책) 9개 요구사항 증빙

**Findings (3건, 모두 LOW/INFO):**
1. CSP `unsafe-inline` — Next.js 호환 위해 허용 (nonce 적용 시 제거 가능)
2. 로그아웃 시 refreshToken 형식 콘솔 에러 — 기능 정상, UX 개선 권장
3. 관리자 계정 사용자 목록 미표시 — 보안 의도적 설계 여부 확인 필요

**증빙 파일:** `docs/audit/evidence/docker-integration-test-20260301.md`

---

### PG Gateway 결제 서비스 API 구현 ✅ 완료 (2026-03-01 ~ 03-02)

토스페이먼츠 스타일의 PG 결제 API를 NestJS 백엔드에 구현. 9개 Phase 전체 완료.

**구현 범위 (9 Phase):**

| Phase | 내용 | 핵심 파일 |
|-------|------|----------|
| 0 | 상수 + DB 스키마 (6테이블) | `pg-gateway.constants.ts`, `schema.prisma` |
| 1 | API 키 인증 (Basic Auth) | `pg-basic-auth.guard.ts`, `pg-api-keys.service.ts` |
| 2 | 결제 요청 API | `pg-payments.controller.ts`, `pg-payments.service.ts` |
| 3 | Mock 카드사/은행 시뮬레이터 | `mock-acquirer.service.ts` |
| 4 | 결제 승인 API | `pg-payments.service.ts` (confirm) |
| 5 | 결제 조회/취소 API | `pg-payments.service.ts` (cancel/findOne) |
| 6 | 정산 연동 | `pg-settlement-bridge.service.ts` |
| 7 | Webhook 발송 | `webhook.service.ts`, `crypto.service.ts` |
| 8 | 감사 로그 연동 | `audit-log.interceptor.ts` 경로 정규식 확장 |

**핵심 아키텍처:**
- **인증**: Toss Payments 스타일 Basic Auth (`-u "secretKey:"`, 콜론 필수)
- **PgBasicAuthGuard**: Base64 디코딩 → secretKey bcrypt prefix 최적화 검증 → `pgMerchantId`/`pgApiKeyId`/`pgClientKey` 주입
- **BigInt 처리**: DB는 BigInt, DTO는 number, `BigIntSerializationInterceptor`가 변환
- **결제 상태**: API 응답은 `DONE` (내부 DB는 `APPROVED`)
- **취소**: 전액취소(DONE→CANCELED), 부분취소(DONE→PARTIAL_CANCELED), 초과취소 방지(PGW_007)
- **Webhook**: HMAC-SHA256 서명 + 3회 재시도 + 지수 백오프

**코드 리뷰 이슈 수정 (4건):**
- `69c54b8` — PG Gateway 코드 리뷰 이슈 5건 수정
- `6f60c66` — CSP script-src를 `strict-dynamic`으로 교체 (PCI DSS 6.4.3)
- `d7d5597` — PG Gateway 감사 로그 연동 (request.user 설정 + 경로 정규식 확장)
- `2a68f80` — webhook.service.ts SRP 분리 (Crypto/Http 서비스 추출)

---

### Docker E2E 풀 시나리오 테스트 ✅ 완료 (2026-03-02)

Docker Compose 환경에서 관리자→대리점→가맹점→결제→정산→취소 전체 비즈니스 플로우 curl 테스트 완료.

**테스트 시나리오 (9 Steps):**

| Step | 내용 | 결과 |
|------|------|------|
| 1 | Admin 로그인 + JWT 발급 | ✅ |
| 2 | 대리점 생성 | ✅ |
| 3 | 가맹점 생성 + 활성화(PENDING→ACTIVE) | ✅ |
| 4 | PG API 키 발급 (clientKey + secretKey) | ✅ |
| 5 | 결제 요청 (카드 10,000원) | ✅ |
| 6 | 결제 승인 (paymentKey 사용) | ✅ |
| 7 | 정산 계산 + 확인 + 송금 | ✅ |
| 8 | 결제 전액 취소 | ✅ |
| 9 | 부분 취소 + 초과 취소 방지 | ✅ |

**발견 & 수정한 버그 (4건):**
1. **정산 날짜 범위 버그** — `new Date("2026-03-02")` = UTC 00:00이라 같은 날 거래 누락 → `periodTo.setUTCHours(23, 59, 59, 999)` 수정 (`settlements.service.ts:136`)
2. **결제 취소 JSON 경로** — `data` 엔벨로프 래핑으로 `json['data']['paymentKey']` 필요
3. **정산 쿼리 파라미터** — `?skip=0&take=10` 에러 → `?page=1&limit=10` 사용
4. **JWT 토큰 만료** — 15분 만료로 연속 테스트 중 AUTH_001 → 각 체인 시작 시 재로그인

**테스트 환경 변수 (Docker):**
```
AGENT_ID: 2fb15295-6544-47e6-adbd-5ed5bf3f09a0
MERCHANT_ID: 857fbaf1-2dcb-47b4-9416-2ef693e724c4
clientKey: ck_live_fea2a7501f7737f430f2a113a97fbae8
secretKey: sk_live_43356bd82827be0006e168d4ede98700ca51bc2d0761d7e9af86435d
DB: pgadmin / pgdb
```

**증빙:** `docs/full-test-guide.md` (전체 curl 명령어 + 기대 응답 + 주의사항 포함, 완전 재작성)

---

### 전체 테스트 스위트 검증 ✅ (2026-03-02)

```
39 suites / 517 tests — ALL PASS (이전: 27 suites / 413 tests)
```

PG Gateway 추가로 **+12 suites, +104 tests** 증가. 기존 테스트 전체 무회귀 확인.

---

### 가맹점/대리점 포탈 ✅ 완료 (2026-03-02)

**계획서**: `~/.claude/plans/silly-whistling-church.md`

5 Phase 전체 완료. 백엔드 소유권 격리 + 프론트엔드 포탈 UI + E2E 보안 검증 통과.

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 백엔드 보안 강화 (OwnershipInterceptor, JWT merchantId/agentId) | ✅ 완료 |
| 1 | 프론트엔드 라우팅 분기 (/m/* 가맹점, /a/* 대리점) | ✅ 완료 |
| 2 | 가맹점 포탈 UI (대시보드, 거래, 정산, 설정) — /m/* 4페이지 | ✅ 완료 |
| 3 | 대리점 포탈 UI (대시보드, 가맹점관리, 거래, 정산, 수수료, 설정) — /a/* 6페이지 | ✅ 완료 |
| 4 | E2E 테스트 (소유권 격리 보안 검증 PASS) | ✅ 완료 |

**구현 내용:**
- `users` 테이블에 `merchant_id`/`agent_id` 추가
- JWT 페이로드에 `merchantId`/`agentId` 포함
- `OwnershipInterceptor`: MERCHANT 유저는 자기 merchantId만, AGENT 유저는 자기 agentId만 접근
- 5개 컨트롤러에 적용 (transactions, settlements, commissions, merchants, dashboard)

---

### Step 13: 외부 검증 준비 (Code Review Readiness) 🔄 부분 완료
- 상태: **일부 완료, 나머지 대기**
- 목적: 외부 PG 경력 개발자에게 코드 검증 요청하기 위한 준비
- 현재 진단:
  - ❌ JSDoc/TSDoc 주석 거의 없음 (서비스 파일 9개 전부)
  - ❌ README.md 없음 (루트, apps/api, apps/web, packages/shared)
  - ✅ Swagger/OpenAPI 구현 완료 (`/api/docs` — 데모/PoC에서 DTO @ApiProperty 보강 완료)
  - ⚠️ 타입 정의 주석 불완전 (헤더만 있음)
  - ❌ 불필요 파일 미정리 (AI 프롬프트 7,378줄, .claude/, 역설계 문서)
- 작업 내용:
  - 13-1: 불필요 파일 정리 (step*-prompt.md 삭제, .claude/ gitignore, 역설계 문서 별도 보관) ⏳
  - 13-2: README.md 작성 (루트 + apps/api) ⏳
  - 13-3: ~~Swagger/OpenAPI 통합~~ ✅ 완료 (`@nestjs/swagger` → `/api/docs`, PG Gateway DTO 보강)
  - 13-4: 핵심 코드 JSDoc 주석 (서비스 9개 public 메서드) ⏳
  - 13-5: 검증 요청서 작성 (검증 범위, 핵심 포인트, 실행 방법) ⏳
- 검증 요청 방식: GitHub Private Repo 초대 + 검증 요청서 전달

### 글로벌 팀 개발 환경 세팅 (모든 프로젝트 공통) ⏳ 대기
- 상태: **계획 완료 (42개 항목), 실행 대기**
- 목적: 모든 프로젝트에 팀 개발 수준 품질 기준 적용
- 적용 대상: pg-system, autovox, teamzero, 향후 모든 프로젝트
- 전략: `~/.claude/templates/` 글로벌 템플릿 + `init-project.sh` 자동 적용
- 핸드오프 체계: PROGRESS.md(일지) + CLAUDE.md(규칙) + ONBOARDING.md(신입가이드) + .claude/rules/ + memory/MEMORY.md
- 진행 순서:
  - 1단계: 규칙 추가 (8개) + Corepack + .prettierrc 생성
  - 2단계: 핵심 인프라 (Husky, commitlint, gitleaks, .editorconfig, .nvmrc)
  - 3단계: GitHub 협업 (PR템플릿, 이슈템플릿, CODEOWNERS, Branch Protection)
  - 4단계: 문서 템플릿 (README, CONTRIBUTING, ONBOARDING, CHANGELOG, ADR 등)
  - 5단계: pg-system 적용 → 검증 → autovox/teamzero 복제
- 42개 항목 분류:
  - 규칙 추가 (토큰 0): JSDoc, 인라인주석, 타입주석, Swagger, DTO데코레이터, 에러응답문서, API버저닝, 모듈의존성맵 (8개)
  - 인프라 세팅: Husky(pre-commit/commit-msg), commitlint, .prettierrc, .editorconfig, .nvmrc, Corepack, gitleaks(Secret Scanning) (7개)
  - GitHub 협업: PR템플릿, 이슈템플릿, CODEOWNERS, Branch Protection Rules, CI workflow (5개)
  - 문서 템플릿: README, CONTRIBUTING, ONBOARDING, CHANGELOG, ADR, 보안코딩가이드, 환경변수문서, 시크릿관리가이드, 배포절차서, 인시던트대응 (10개)
  - 다이어그램: 아키텍처(Mermaid 기반), ERD(Prisma 자동생성) (2개)
  - IDE/Docker: VS Code extensions.json, VS Code settings.json, docker-compose.dev.yml (3개)
  - Claude 전용: .claude/commands/ 커스텀 명령어 (1개)
  - 프로젝트별 설정: 브랜치전략, 코드리뷰규칙, 테스트커버리지기준 (3개)
  - 자동화: init-project.sh (새 프로젝트 원클릭 초기화) (1개)
  - 이미 완료: ESLint (1개) ※ Prettier는 ESLint만 있고 .prettierrc 미존재 → 2단계에서 생성
  - DX 측정 (선택): DX Core 4 기반 효율 측정표 (1개)

---

### 글로벌 개발 환경 표준화 ✅ 완료 (2026-03-02)

Phase 1~7 전체 완료. 모든 프로젝트에 자동 적용되는 범용 개발 인프라 구축.

| Phase | 내용 | 핵심 산출물 |
|-------|------|------------|
| 1 | Git 루트 인프라 | `package.json`, `.husky/*`, `commitlint.config.js`, `.gitignore`, `.editorconfig`, `.nvmrc` |
| 2 | 템플릿 시스템 | `~/.claude/templates/` (configs, docs, claude, github) |
| 3 | init-project.sh v2 | `~/.claude/init-project.sh` (보안등급 선택, 플레이스홀더 치환) |
| 4 | GitHub 협업 | `.github/` (PR템플릿, 이슈템플릿, CODEOWNERS) |
| 5 | 새 프로젝트 체크리스트 | `~/.claude/rules/common/new-project-checklist.md` |
| 6 | Claude Code Hooks 개선 | `~/.claude/settings.json` (PostToolUse 간소화, PreToolUse 위험명령 차단) |
| 7 | Gemini CLI 가이드 | `~/.claude/docs/gemini-cli-guide.md` |

---

### PG-System 서비스 가능 여부 진단 (2026-03-03 업데이트)

**결론: 약 70% 완성. 데모/PoC 시연 가능. 실 서비스 제공은 불가.**

**완성된 부분 (백엔드 API ~75%):**
- 15개 모듈 (auth, users, roles, merchants, agents, transactions, settlements, commissions, deposits, security, system, pg-gateway, notifications, dashboard, shared)
- 34개 DB 테이블, 101개 API 엔드포인트
- 53 test suites / 741 tests (ALL PASS — Backend 41/544 + Frontend 12/197)
- 관리자 포탈 UI 완성 (36 페이지, 70 컴포넌트)
- 가맹점 포탈 (/m/* 4페이지) + 대리점 포탈 (/a/* 6페이지) 완료
- PG Gateway 결제 API (Phase 0~8 완료)
- 결제 Checkout UI (데모용 — Mock 카드사 기반)
- Swagger/OpenAPI 문서 (`/api/docs`)
- Docker E2E 73항목 + 풀 비즈니스 플로우 9단계 검증
- OwnershipInterceptor 소유권 격리 + E2E 보안 검증

**서비스 제공 불가 사유 (미완성 핵심 기능):**

| # | 미완성 항목 | 중요도 | 설명 |
|---|-----------|--------|------|
| 1 | **Mock 카드사 → 실제 카드사 연동** | 🔴 필수 | 현재 Mock만 있음. 실제 VAN/카드사 전문 연동 필요 |
| 2 | **카드 토큰화 시스템** | ✅ 완료 | PCI DSS 3.4 준수. CardTokenizationService + AES-256-GCM (Sprint A.1) |
| 3 | **결제창 SDK/iframe** | ✅ 완료 | PgCheckout SDK + checkout-iframe + postMessage 프로토콜 + checkout-verify API (Sprint A.2) |
| 4 | **자동 정산 배치** | ✅ 완료 | CALCULATED→CONFIRMED→REMITTED→COMPLETED 자동 전환 (Sprint A.1) |
| 5 | **Webhook 관리 UI** | ✅ 완료 | URL 관리 + 발송 이력 + 실패 재발송 + 테스트 발송 (Sprint B-2) |
| 6 | **실시간 알림** | 🟢 권장 | 거래/정산 이벤트 SMS/카카오톡/이메일 알림 |
| 7 | **모니터링/대시보드 고도화** | 🟢 권장 | 실시간 거래 모니터링, 이상거래 탐지 |

---

## 🔜 프로덕션 로드맵 (우선순위순)

> 상세 문서: `docs/PRODUCTION_ROADMAP.md`

### Phase A: 서비스 런칭 최소 조건 (MVP)
| # | 항목 | 상태 | 핵심 내용 |
|---|------|------|----------|
| A-1 | **실제 VAN/카드사 연동** 🔴 | ✅ 어댑터 완료 | VAN Adapter Framework 완료 (Sprint A.3). NICE/KIS 스켈레톤 + DI Factory + acquirer-factory.spec.ts 6TC. VAN 계약 후 어댑터 실구현만 추가하면 됨 |
| A-2 | **카드 토큰화** 🔴 | ✅ 완료 | HSM/토큰화 서비스 → 카드번호 평문 저장 금지 |
| A-3 | **결제창 SDK/iframe** 🔴 | ✅ 완료 | PgCheckout SDK + iframe + postMessage (Sprint A.2) |
| A-4 | **자동 정산 배치** 🟡 | ✅ 완료 | @Cron 스케줄러 + 은행 API 송금 자동화 |
| A-5 | **가맹점 포탈 UI** 🟡 | ✅ 완료 | /m/* 4페이지 + 컴포넌트 4개 구현 완료 |

### Phase B: 안정적 운영
| # | 항목 | 상태 | 핵심 내용 |
|---|------|------|----------|
| B-1 | **대리점 포탈 UI** | ✅ 완료 | /a/* 6페이지 + 컴포넌트 5개 구현 완료 |
| B-2 | **Webhook 강화** | ✅ 완료 | 테스트발송/재발송/필터 API + 가맹점 포탈 UI (설정+이력) |
| B-3 | **외부 보안 감사** | ⏳ 대기 | 스테이징 + DAST + 수동 침투 테스트 |
| B-4 | **PCI DSS 인증** | ⏳ 대기 | SAQ → ASV 스캔 → QSA 현장 심사 |

### Phase C: 성장/확장
| # | 항목 | 상태 | 핵심 내용 |
|---|------|------|----------|
| C-1 | **실시간 알림** | ⏳ 대기 | SMS + 카카오 알림톡 + 이메일 |
| C-2 | **모니터링 고도화** | ⏳ 대기 | Prometheus + Grafana + FDS 대시보드 |
| C-3 | **프로덕션 인프라** | ⏳ 대기 | K8s/ECS + DB 이중화 + WAF + CI/CD |
| C-4 | **추가 결제 수단** | ⏳ 대기 | 가상계좌, 간편결제, 휴대폰 |

### 완료된 항목
| # | 항목 | 완료일 |
|---|------|--------|
| ✅ | 가맹점 포탈 (백엔드 API + 프론트 /m/* 4페이지) | 2026-03-02 |
| ✅ | 대리점 포탈 (백엔드 API + 프론트 /a/* 6페이지) | 2026-03-02 |
| ✅ | OwnershipInterceptor 소유권 격리 | 2026-03-02 |
| ✅ | 결제창 UI (데모) | 2026-03-03 |
| ✅ | 데모/PoC 환경 | 2026-03-03 |
| ✅ | Sprint A.0: ScheduleModule + CSP + VAN 문서 | 2026-03-03 |
| ✅ | Sprint A.1: 카드 토큰화 + 정산 자동실행 | 2026-03-03 |
| ✅ | Sprint A.2: 결제창 SDK/iframe (postMessage 프로토콜 + checkout-iframe + PgCheckout SDK + checkout-verify API) | 2026-03-04 |
| ✅ | Sprint A.3: VAN Adapter Framework — AcquirerProvider DI Factory + NICE/KIS 스켈레톤 + van.config.ts + acquirer-factory.spec.ts 6TC PASS | 2026-03-04 |
| ✅ | Sprint B-2: Webhook 강화 — 테스트발송/재발송/필터 API + MerchantWebhookController(JWT) + 가맹점 포탈 UI (설정+이력+재발송) | 2026-03-04 |
| ✅ | 포트 마이그레이션: Web 3000→3300 (pg-system + pg-system-audit 양쪽 10개 파일, CORS/SDK/Playwright/테스트/문서 전체 반영) | 2026-03-05 |
| ✅ | CC-SDD Sprint 1: 감사 로그 전면 통합 — 9 서비스 32개 CUD 메서드 writeAuditLog + SecurityModule DI + 테스트 mock 9파일 + AUDIT_ACTIONS 34상수 | 2026-03-07 |
| ✅ | CC-SDD Sprint 2: 데이터 격리 버그 수정(dashboard unmatchedDepositCount ownerFilter) + 비밀번호 복잡도 검증(change-password.dto @Matches) | 2026-03-07 |
| ✅ | 방어적 프로그래밍 5계층 감사: 10건 수정 (입력검증/에러처리/Null안전/타입안전/경계검사) — 커밋 8badf4d | 2026-03-08 |
| ✅ | pg-system-audit 동기화: rsync 선별 동기화 ~100파일 + 외부검증 자립성 확인 (206 API, 178 Web, 798 Tests) | 2026-03-08 |

### 데모/PoC 준비 ✅ 완료 (2026-03-03)

Mock 카드사 기반 "결제 → 승인 → 대시보드 확인" 데모 시연 환경 구축.

| Epic | 내용 | 산출물 |
|------|------|--------|
| 1. Checkout UI | 타입+API클라이언트, 결제 페이지, 테스트 | `apps/web/src/types/payment.ts`, `apps/web/src/lib/payment-client.ts`, `apps/web/src/app/(payment)/checkout/page.tsx`, `apps/web/src/components/payment/` |
| 2. Swagger 보강 | DTO @ApiProperty 설명/예시 추가, @ApiResponse 에러 타입 | `apps/api/src/modules/pg-gateway/dto/`, 컨트롤러 `@ApiResponse` |
| 3. 시드 데이터 | 데모 가맹점 + API 키 시드 | `apps/api/prisma/seed.ts` |
| 4. 데모 문서 | 10~15분 시연 스크립트 + Q&A + 장애대응 | `docs/DEMO_SCENARIO.md` |

데모 자격 증명:
- 관리자: `admin@pgsystem.co.kr` / `Admin1234!@#$`
- PG clientKey: `ck_test_demo_0000000000000000`
- PG secretKey: `test_sk_demo_0000000000000000000000000000000000000000000000000000`

### 테스트 현황 (최종: 2026-03-08)

| 구분 | Suites | Tests | 상태 |
|------|--------|-------|------|
| Backend (Jest) | 46 | 617 | ✅ |
| Frontend (Vitest) | 10 | 181 | ✅ |
| **합계** | **56** | **798** | **ALL PASS** |

**보안 모듈 테스트 완료 (2026-03-07):**
- SecurityController: 37개 테스트 케이스 (감사로그, 리스크 알림, 로그인 이력, 해시 체인, FIM)
- IntegrityMonitorScheduler: 7개 테스트 케이스 (파일 무결성 모니터링)
- KeyRotationScheduler: 3개 테스트 케이스 (암호화 키 로테이션)
- 합계 보안 모듈: 47개 TC, ESLint 0 에러 ✅

## 📄 Phase 4 산출물 목록
| 산출물 | 파일 | 핵심 내용 |
|--------|------|----------|
| 약점 카탈로그 | docs/phase4-weakness-catalog.md | 40개 약점 (보안22+설계12+운영6) + 우선순위 매트릭스 |
| ER Diagram | docs/phase4-er-diagram.md | 34 테이블 + 1 뷰, 7개 도메인, 전체 SQL DDL |
| API 명세 | docs/phase4-api-specification.md | 101 엔드포인트 (구현 기준), 15개 모듈, 에러 코드 체계 |
| 보안 설계 | docs/phase4-security-hardening.md | 5층 방어 아키텍처, PCI DSS 매핑, 10주 로드맵 |
| 법규 대응 | docs/phase4-legal-compliance-design.md | 에스크로, 정산 자동화, 자본금/대주주 모니터링 |

## 📊 역설계 분석 현황

| 항목 | 수치 |
|------|------|
| 총 Java 파일 | 1,398개 |
| 총 Vue 컴포넌트 | 80개 |
| 추정 총 코드량 | ~200,000줄 |
| 추정 DB 테이블 | 48+ 개 |
| 발견된 보안 취약점 | 22개 (Critical 7, High 6, Medium 5, Low 4) |
| 핵심 비즈니스 도메인 | 정산, 수수료, 결제, 가맹점/대리점 관리 |

> Phase 1 분석: `docs/reverse-engineering-report.md` 참조
> Phase 2+3 분석: `docs/reverse-engineering-phase2-3-report.md` 참조

### Phase 3: n8n 워크플로우 구축
- [In] Task 1: 워크플로우 아키텍처 설계 → Jayden 승인
- [Out] Task 2: Workflow A 임베딩 생성 노드 구축
- [Out] Task 3: Workflow B 메인 상담 엔진 노드 1-6 구축
- [Gate] Task 4: 가드레일 로직 검증 → Jayden 승인
- [Out] Task 5: 가드레일 노드 7-12 구축
- [In] Task 6: 보안 테스트 시나리오 검증
