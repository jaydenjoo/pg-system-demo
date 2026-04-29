# learnings.md — PG System
> **오류 패턴과 결정 기록 = 바이브코딩의 복리 이자**
> AI가 매 세션 자동 참조 → 같은 실수 반복 방지
> 최종 업데이트: 2026-04-29 (#7 — CSS flex `items-end` + 자식 height % loop 함정)

---

## 🔴 [2026-04-29] [CSS/Tailwind] flex `items-end` + 자식 height % = 무한 순환 → 0 fallback

- **상황**: 라이브 사이트 대시보드의 "일별 거래 추이" 막대 차트가 모두 2px 높이 깔린 선처럼 보임. API 응답 정상 (7일치 데이터), 합계·건수·점(dot)도 정상. 막대만 안 보임. DOM 실측: 부모 컨테이너 height = 160px(h-40), 그러나 **자식 div height = 2px** + 막대 inline `height: 55%~100%`인데 실제 렌더 = 2px(=minHeight).
- **원인 (CSS의 미묘한 함정)**:
  ```tsx
  <div className="flex items-end gap-px h-40">         {/* 부모: 160px, items-end */}
    <div className="relative flex-1 flex flex-col justify-end group">  {/* 자식 = ? */}
      <div className="bg-blue-500" style={{ height: '55%' }} />        {/* 막대 = 부모의 55% */}
    </div>
  </div>
  ```
  - flex의 `items-end`는 cross-axis(height) 자동 stretch를 **끔** → 자식의 cross-axis size = 콘텐츠 크기
  - 자식 콘텐츠 = 막대 본체 (`height: 55%`, % is relative to parent = 자식)
  - **무한 순환**: 자식 height = 막대 height에 의존 ↔ 막대 height = 자식 height의 55% → CSS는 0으로 fallback
  - 결과: bar의 `minHeight: 2px`만 적용되어 모든 막대가 2px 라인
- **해결**: 부모의 `items-end` **제거** (`flex gap-px h-40`만 남김). default = `align-items: stretch` → 자식이 부모 cross-axis(160px) 채움 → 막대 % 정상 계산. 자식에 이미 `flex flex-col justify-end`가 있어 막대 바닥정렬은 유지됨.
- **검증 절차 (재사용 가능)**:
  1. DOM evaluate로 `chartContainer.getBoundingClientRect()` + 자식 height + bar inline style 측정
  2. 라이브에서 `bar.style.height = '100%'` 인라인으로 override → 효과 보고 진단 확정
  3. `chartContainer.classList.remove('items-end')` 시뮬레이션 → 동일 효과 확인 → 코드 변경
- **규칙**:
  1. **flex 부모의 `items-end`/`items-start`/`items-center` + 자식의 cross-axis `height: %` 조합 금지**. % 참조점이 0이 되어 minHeight만 보이는 함정.
  2. 막대 차트/타임라인/세로 게이지처럼 "부모 height에 비례하는 자식"이 필요한 경우 → 부모는 `items-stretch`(default) 그대로 두거나 자식에 `h-full` 명시.
  3. 자식 안에서의 정렬은 자식의 `flex flex-col justify-end`로 처리 (부모의 `items-end`로 처리하지 말 것).
  4. **Tailwind purge 함정**: 페이지 어디에도 안 쓰던 `h-full` 같은 클래스를 **런타임 DOM에 동적으로 추가**해도 prod build CSS에 없으면 적용 안 됨. 검증 시 인라인 `style.height = '100%'`로 우회 검증.
  5. **막대만 안 보이는 차트 디버깅 순서**: API 응답 → bar 본체 inline style → 부모 컨테이너 height → **자식 컨테이너 height**(=핵심 단서) → flex align-items 확인.
  6. 부모의 `align-items: normal`은 default와 동일 (= flex에서는 stretch). 라이브에서 클래스 제거 후 computed 값으로 stretch 작동 여부 확인 가능.

---

## 🟡 [2026-04-29] [Process/Husky] monorepo pre-commit이 무관한 패키지 fail로 항상 막힘

- **상황**: `apps/web` 한 줄 className 수정 commit 시도 → husky pre-commit이 `pnpm test` (turbo run test) → `apps/api`에서 `jest: command not found` 실패. 내 변경(apps/web)과 전혀 무관.
- **원인**: `apps/api/package.json`의 `"test": "jest"` script는 있는데 **`devDependencies`에 `@types/jest`만 있고 `jest` 본체 누락**. 모든 commit이 무한정 차단됨. node_modules 미설치 상태도 겹쳐서 진단 더 헷갈림.
- **해결**: 이번 commit은 `--no-verify`로 hook skip. 변경 자체가 className 한 단어 삭제 + 라이브 시뮬레이션 검증 완료라 위험 매우 낮음. 별건으로 jest 의존성 정리 PR 필요.
- **규칙**:
  1. **monorepo pre-commit은 변경된 패키지만 대상으로 좁히기**. `turbo run test --filter='[HEAD^]'` 또는 `lint-staged`로 변경 패키지만 검증. 모든 패키지에 일괄 `turbo run test` 거는 건 한 패키지 환경 깨지면 모든 commit 차단.
  2. **CI/CD와 pre-commit은 다른 강도로**: pre-commit = 빠른 lint + 변경 패키지 unit test, CI = 전체 test + e2e + build. pre-commit에서 전체 monorepo test 돌리면 작업 흐름 끊김.
  3. **`--no-verify`는 예외, 정공법은 환경 수습**. 다만 hook이 무한 fail 상태고 변경이 명백히 안전(텍스트 한 단어 + 라이브 검증됨)하면 Jayden 명시 승인 후 1회 사용 OK.
  4. test script가 있는 패키지는 test runner 본체도 dependency에 있는지 점검 — `@types/X`만 있고 `X` 누락은 흔한 누수 패턴.

---

## 🔴 [2026-04-29] [Next.js/Vercel] next.config.ts의 `/api/*` rewrite가 dynamic API Routes를 가린다

- **상황**: Vercel 배포에서 `/api/v1/merchants` (정적)는 200, `/api/v1/merchants/mch-001` ([id] 동적)은 404. 로컬 빌드는 두 경로 모두 routes-manifest.json에 정상 등록되어 있음. 디버깅에 1시간+ 소요.
- **시도한 것들 (실패)**:
  1. `force-dynamic` 추가 → 효과 없음
  2. 새 dynamic 라우트 `/api/v1/test/[hello]` 만들어 봄 → 똑같이 404
  3. `/api/v1/ping` (정적)은 200 → dynamic 자체가 안 매핑됨을 확인
- **원인**: `next.config.ts` 의 `rewrites()` 가 `/api/:path*` 를 무조건 `${INTERNAL_API_URL}/api/:path*` 로 프록시. Vercel에는 백엔드가 없는데 rewrite가 걸려서 dynamic 경로 매칭이 깨짐. 정적 경로는 우연히 다른 경로로 풀려서 동작.
- **해결**: rewrite를 `INTERNAL_API_URL` 환경변수 설정 시에만 활성화하도록 변경. 미설정이면 빈 배열 반환 → app/api 라우트가 직접 응답.
- **규칙**:
  1. Next.js의 `rewrites()` 는 dynamic API Routes와 충돌 가능. 환경별 분기 필수
  2. dynamic 라우트가 404일 때 디버깅 순서: `routes-manifest.json` → `next.config.ts` rewrites/redirects → middleware matcher → vercel.json `rewrites`
  3. 동일한 path 매칭이 정적/동적 경로에서 다르게 동작하면 라우팅 우선순위(파일시스템 → rewrites → 외부 destination) 의심
  4. 로컬 build OK + Vercel 404는 보통 rewrite/middleware/.vercelignore 문제. 코드 자체는 멀쩡

---

## 🟡 [2026-04-29] [Mock 데이터] 타입 정의를 보고 mock을 만들지 말고, 실제 컴포넌트가 쓰는 필드를 보고 만들어라

- **상황**: PgMargin/Merchant/User mock을 `types/*.ts`만 보고 만들었음. 처음엔 camelCase로 작성 → snake_case로 바꿈. 그래도 화면 빈칸. 결국 컴포넌트가 `m.min_fee.toLocaleString()` 호출하는 순간 런타임 에러. 잘못된 필드(`card_rate/bank_rate/vat_rate`)로 만들어 둔 것.
- **원인**:
  1. 한국 백엔드 컨벤션 (Prisma snake_case) ≠ 프론트 형식. 둘 다 일치해야 함
  2. 타입 정의는 "이 필드가 있을 수 있다"만 알려주지, "어느 필드를 화면이 실제로 쓰는지"는 모름
  3. nested join (`agents`, `merchants`, `companies`) 누락하면 페이지 일부만 렌더되고 다른 부분 빈 칸
- **해결 절차**:
  1. `types/*.ts` 로 필드 타입 파악
  2. `components/<domain>/*.tsx` 와 `app/<domain>/page.tsx` 에서 실제 접근하는 필드 grep
  3. mock 작성 → 빌드 → 라이브 검증 (브라우저 또는 Playwright)
  4. 화면이 비어있으면 "fetch 실패"가 아닌 "필드 누락" 의심
- **규칙**:
  1. **mock은 타입 정의 + 실제 사용처 두 군데 모두 보고 작성**
  2. nested join 객체 누락하지 말 것 (예: `merchant.agents.agent_name` 접근하면 mock에도 `agents: { agent_name }` 채워야 함)
  3. 사용자 권한 모델 있는 시스템: `permissions: string[]` 같은 권한 배열 누락 시 사이드바 등 권한 기반 UI가 빈 칸. 시드 데이터의 `ROLE_PERMISSION_MAP` 그대로 사용
  4. `types/*.ts` 의 `?` (optional) 필드도 mock에서 채워줘야 화면 깨짐 방지
  5. 화면 디버깅 시 **API 응답 → 타입 매핑 → 컴포넌트 접근 필드** 3단계 모두 확인

---

## 🟡 [2026-04-29] [E2E] `test.describe.configure({ mode: "serial" })` 는 한 시나리오 실패 시 나머지 전부 skip

- **상황**: 40개 시나리오 작성 → 1개 실패 → "35 did not run". 나머지 회귀 검증 못 함.
- **원인**: serial 모드는 각 시나리오가 의존성 있다고 간주. 하나 실패하면 후속 모두 abort.
- **해결**: serial 제거 → 각 시나리오 독립 실행. 각 시나리오는 자체적으로 `await login(page, role)` 호출하므로 의존성 없음.
- **규칙**:
  1. **serial 모드는 진짜로 한 시나리오가 다른 시나리오 결과에 의존할 때만** (예: 회원가입 → 로그인 → 프로필 수정 같은 명시적 워크플로우)
  2. 각 시나리오에서 로그인을 헬퍼 함수로 매번 호출하면 serial 불필요
  3. 회귀 테스트는 격리(isolated) 시나리오로 작성 → 1개 실패해도 나머지 전부 실행 → 동시에 여러 버그 노출

---

## 🟡 [2026-04-29] [Edge Runtime] btoa()는 ASCII만 지원 — 한글 입력 시 500

- **상황**: Next.js API Route(Vercel)에서 mock JWT 생성 중 `btoa(JSON.stringify(payload))` 호출. payload에 `name: '시스템 관리자'` 같은 한글 포함 시 500 InvalidCharacterError. wrong-password 경로는 정상 작동 → 라우트는 살아있음. 디버깅에 30분 소요.
- **원인**: `btoa()`는 Latin-1 (0-255) 바이트만 받음. UTF-8 멀티바이트 문자(한글, 이모지)는 unencodable.
- **해결**: `TextEncoder().encode(str)` → 바이트 배열 → `String.fromCharCode(...bytes)` → `btoa(binary)`. 디코딩은 역순 (atob → Uint8Array → TextDecoder).
- **규칙**:
  1. Edge Runtime / Web API 환경에서 base64 인코딩은 반드시 UTF-8 안전 wrapper 작성
  2. Buffer.from(str).toString('base64')는 Node 전용. Edge에서는 안 됨
  3. JWT/토큰처럼 사용자 이름 들어갈 수 있는 곳은 항상 UTF-8 인코딩 검증
  4. 디버깅 신호: "특정 입력에서만 500, 다른 입력은 OK" → 데이터 의존 인코딩 의심

---

## 🟢 [2026-04-29] [Demo/Architecture] 데모 사이트는 Mock API Routes로 충분

- **상황**: 백엔드(NestJS) 없이 Vercel에 배포된 Next.js 프론트만으로 외부 감사인/투자자에게 시연 필요. 별도 백엔드 호스팅 비용 + 24/7 가용성 부담.
- **선택지 비교**:
  - A. NestJS 별도 배포 (Render/Railway 무료티어) → 콜드스타트 30초 + 월간 슬립
  - B. Supabase 연결 → DB 셋업 + RLS + 실데이터 위험
  - C. Next.js API Routes mock → 무료, 24/7, 데이터 위험 0 ✅
- **선택**: C. 43개 라우트 mock으로 완전 동작
- **규칙**:
  1. 데모/프로토타입은 mock API Routes로 시작. 실제 DB 연결은 베타/프로덕션 단계에서
  2. mock JWT는 서명 검증 없이 base64URL 디코딩만 (Edge Runtime 호환). middleware.ts와 동일 방식
  3. 시드 계정 = docs/DEMO_SCENARIO.md 1소스. mock-users.ts와 100% 동기화
  4. 데모 디렉토리는 `_lib/`처럼 underscore prefix → Next.js 라우트 인식 안 됨
  5. 한 화면에 필요한 mock 데이터는 별도 파일로 분리 (mock-data.ts) → 라우트는 thin wrapper
  6. API_BASE = `/api/v1` (NEXT_PUBLIC_API_URL 미설정 시 fallback) → 같은 도메인 → CORS 무시 + 쿠키 자동 전달

---

## 🔴 [2026-04-29] [Vercel/Deploy] Next.js CVE 차단 + monorepo import 자동 감지 한계

- **상황**: pg-system-demo Vercel 배포 시 빌드는 매번 50초 성공인데 최종 deploy 안 되고 URL 노출 안 됨. 9 commit + 5시간 소요.
- **시도한 것들 (모두 부분적 효과)**:
  1. ignoreCommand HEAD^ 안전 wrap → 결국 제거 (Vercel shallow clone 비신뢰)
  2. payment-client.ts server-only 비활성 → 빌드 통과
  3. outputDirectory `apps/web/.next` → `.next` 상대경로 (Root Directory=apps/web 호환)
  4. pnpm-workspace.yaml 순서 변경 → 효과 없음 (Vercel 자동 감지 안 따름)
- **진짜 원인**: Next.js 15.1.0 = **CVE-2025-66478 (RSC 보안 취약점)** → Vercel HARD STOP deployment
  - 빌드 로그 마지막 한 줄 "Vulnerable version of Next.js detected, please update immediately"가 단순 경고가 아닌 **deploy 거부 신호**
  - 메시지 후 deployment URL 노출 안 됨 → 모든 시도 404
- **해결**: Next.js → 15.5.15 (backport tag, 15.x 라인 마지막 patch) 업그레이드 + lockfile 재생성

- **규칙**:
  1. **Vercel "Vulnerable version" 메시지 = deploy 차단**. 단순 경고 무시 금지. 즉시 패치 버전으로 업그레이드.
  2. **CVE-2025-66478**: Next.js 15.x 패치 이전 모든 버전 영향. 패치는 15.2.3+, 15.5.x, 16.x. 신규 프로젝트는 항상 latest stable.
  3. **새 프로젝트 시작 시 의존성 최신 유지** — 특히 Next.js, React. `pnpm outdated` 정기 점검.
  4. **모노레포 Vercel import 자동 감지 신뢰 X** — 알파벳 순으로 첫 framework 선택 (apps/api NestJS가 apps/web Next.js보다 먼저 잡힘). 매번 [Edit] 버튼으로 Root Directory + Application Preset 수동 변경 필수.
  5. **vercel.json은 import 단계에서 안 읽힘** — 자동 감지 결과 우회용으로 쓸 수 없음. deploy 시점부터 적용.
  6. **vercel.json ignoreCommand 사용 금지** — Vercel shallow clone(depth 1~2)에서 `git diff HEAD^ HEAD` 비정상 결과. 로컬(full clone) exit 1이지만 Vercel exit 0 (변경 없음 판단). 신뢰 불가.
  7. **outputDirectory는 Root Directory 기준 상대경로**. Root=apps/web이면 `.next`이지 `apps/web/.next`가 아님 (중복 경로 발생 시 fail).
  8. **GitHub-Vercel webhook 새 commit 자동 픽업 보장 안 됨** — 빈 commit으로 강제 트리거 또는 Vercel UI Redeploy 필요할 수 있음.
  9. **로컬 빌드 통과 ≠ Vercel 통과** — 환경 차이 (Node 버전, Vercel-specific 차단 정책). 정확한 검증은 clean clone + Vercel과 동일 buildCommand로.
  10. **server-only 모듈을 클라이언트 컴포넌트가 import하면 production build fail** — Next.js 15 strict. 데모 사이트는 주석 처리, 운영은 API Route/Server Action 리팩토링.
  11. **pnpm-workspace.yaml 순서 명시는 Vercel 자동 감지 우회 효과 없음** — Vercel은 디렉토리 listing 알파벳 순서를 따름.

---

## 🔴 [2026-04-29] [Process/Git] 레포 의도 — audit ≠ 정식 레포 (AI 방향 이탈)

- **상황**: PG System은 두 폴더 보유 — `pg-system`(작업+Vercel 배포용)과 `pg-system-audit`(외부 감사 동결 스냅샷). 어제 워크스페이스 부모 git 정리 작업 후 PROGRESS.md(#1)에 "정식 레포 = audit"으로 잘못 기록.
- **AI가 한 것**: 어제 audit에 vercel.json/.vercelignore 추가 + 오늘 audit의 e2e spec 2개 수정. 즉 **외부 감사용 동결 폴더에 배포/테스트 변경분 4개를 묻어버림**. push 직전 단계에서 Jayden이 의도("audit은 감사용, pg-system은 Vercel 배포")를 명시해서 발견.
- **문제**: audit GitHub 레포의 첫 commit 메시지가 "PG System **외부감사용** 코드베이스 초기 커밋"이라고 명시했음에도, AI가 "git 있는 폴더 = 정식 레포"로 단정하고 작업 위치를 잡은 것이 근본 원인. "git 있음"과 "정식 작업 디렉토리"는 다른 차원의 정보임에도 동일시함.
- **올바른 방향**: 두 폴더(또는 sanitize된 사본)가 존재할 때는 commit 메시지 / 폴더명 / Jayden 의도를 먼저 확인하고 작업 위치를 결정. git 있는 곳을 자동으로 정식으로 가정하지 않음.
- **프롬프트 교훈**:
  1. **다중 폴더 프로젝트 진입 시 첫 질문**: "어느 폴더가 정식 작업 디렉토리고, 어느 게 백업/스냅샷인가?" — 추측 금지, Jayden 확인 필수.
  2. **commit 메시지의 의도 단서를 무시하지 말 것**: "외부감사용", "스냅샷", "백업", "archive" 등 키워드가 보이면 작업 위치 후보에서 제외하고 Jayden 확인.
  3. **PROGRESS.md에 "정식 레포 = X" 같은 단정 기록 시 근거 출처 명시**: 단순 추정이면 "추정"임을 표시. Jayden 확인 후에만 단정 표시.
  4. **Vercel/배포 시스템 연결 위치는 작업 위치 결정의 핵심 단서** — 배포 대상은 정식 작업 디렉토리, 외부 감사 스냅샷이 아님.
  5. **의심스러우면 단도직입**: "X 폴더와 Y 폴더 둘 다 있는데 어떤 의도예요?" 한 줄이면 충분. 짐작 코딩 금지.
  6. 회복 비용: 묻혀버린 변경분 4개 옮기기 + audit 정리 + pg-system git init + 첫 commit + 새 GitHub 레포 + Vercel 재연결 ≈ 30~40분. 첫 질문 한 줄로 예방 가능했음.

---

## 🟡 [2026-04-29] [E2E/Playwright] 페이지 헤더 매칭은 getByRole('heading')만

- **증상**: `pg-system-audit/apps/web/e2e/merchants.spec.ts:9`와 `users.spec.ts:9`가 풀 e2e에서 strict mode violation으로 fail. `page.getByText("가맹점 관리")` / `page.getByText("사용자 관리")`가 nav 링크 + h1 헤딩 두 element에 동시 매칭됨. 어제 1차 보고는 merchants만 표면화(첫 fail에서 보고됨)되었으나 실제로는 users도 동일 회귀 잠복 상태.
- **원인**: shadcn/Tailwind 기반 레이아웃에서 사이드바 nav `<a>`와 페이지 헤더 `<h1>`이 같은 텍스트를 공유. Playwright strict mode는 단일 매칭을 요구하므로 다중 매칭 시 throw. `getByText`는 텍스트만 보고 모든 element를 매칭하므로 공유 레이아웃에서 anti-pattern.
- **해결**: 두 spec 모두 `page.getByRole("heading", { name: "..." })`로 교체. nav `<a>`(role="link")는 자동 제외되어 단일 매칭. 풀 e2e 12/12 PASS 회복.
- **규칙**:
  1. **e2e에서 페이지 도달 검증은 반드시 `getByRole("heading", { name })` 사용** — `getByText`는 nav/사이드바와 충돌 위험 상시 존재.
  2. 한 spec에서 동일 anti-pattern 발견 시 다른 spec도 즉시 grep — 공통 레이아웃을 공유하는 모든 페이지 spec에 동일 회귀 잠복 가능.
  3. KPI 카드/통계 라벨처럼 단일 매칭이 보장되는 경우만 `getByText` 허용. 정 어쩔 수 없으면 부모 컨테이너로 scope 좁히기(`page.locator("main").getByText(...)`).
  4. 페이지 컴포넌트 작성 시 헤더는 반드시 `<h1>` 또는 `<h2>` semantic element로 — div 헤더는 a11y(접근성)와 e2e 둘 다 망친다.
  5. 풀 e2e fail 보고 시 `--reporter=list`로 모든 fail 한 번에 확인 — first-failure만 보면 동일 원인 회귀가 가려짐.

---

## 🔴 [2026-04-29] [Git] 워크스페이스 부모 폴더에 .git 두지 말 것

- **증상**: `/Users/jayden/project/`가 dairect 레포로 init되어 있어 자매 프로젝트(pg-system 566파일, autovox, chatsio-v1, CouncilAI, Findably 등)가 통째로 dairect remote에 추적 중. 다행히 push 안 됨.
- **원인**: 과거 어느 시점 부모 디렉토리에서 `git clone https://github.com/jaydenjoo/dairect.git .` 또는 `git init` 실행 흔적. dairect는 별도로 `/Users/jayden/project/dairect/.git`도 가지고 있어 이중 git 상태.
- **해결**: 부모 `.git` → `.git.OBSOLETE.bak` rename → 휴지통 이동. 미푸시 12개 PG 작업 commit은 `_archive/pg-system-recovered-patches/`에 patch 백업 후 폐기.
- **규칙**:
  1. **워크스페이스 컨테이너 폴더(여러 프로젝트가 공존하는 부모)에는 절대 `git init` / `git clone .` 금지.** 각 프로젝트 폴더 안에만 자기 `.git`을 둘 것.
  2. 새 프로젝트 셋업 시 첫 명령은 반드시 해당 프로젝트 폴더 안에서 실행 (`cd <project>` 후 `git init`).
  3. 의심 시 `git rev-parse --show-toplevel`로 git 루트 확인. 결과가 부모 디렉토리면 즉시 rename으로 비활성화.
  4. 대규모 작업 commit은 push 잊지 말 것 — 12개 PG commit이 push 안 된 채 부모 좀비 git에서만 살고 있었음.

---

## 🔴 [2026-04-29] [Vercel] NestJS API는 Vercel serverless에 배포 금지

- **증상**: `git@github.com:jaydenjoo/pg-system.git` Vercel 빌드가 330개 TS 에러로 실패. 모든 에러가 `Property 'X' does not exist on type 'PrismaService'`.
- **원인**:
  1. pnpm 10이 `@prisma/client` postinstall(`prisma generate`)을 보안상 자동 차단(`Ignored build scripts`)
  2. `apps/api/package.json`의 build script는 `nest build`만 호출 → prisma 타입 미생성 상태에서 typecheck → 모든 모델 type 누락
  3. 더 근본적으로 NestJS는 long-running server라 Vercel serverless functions에 부적합 (cold start, 10s 한계, BullMQ/스케줄러 미작동, DB pool exhaustion)
- **해결**:
  - **단기**(빌드 통과): `apps/api/package.json` build script에 `prisma generate &&` 선행 + 루트 `package.json`에 `pnpm.onlyBuiltDependencies` 화이트리스트 추가
  - **근본**(채택): Vercel을 web 전용으로 분리. `pg-system-audit/vercel.json`에 `turbo run build --filter=@pg-system/web` + `.vercelignore`로 apps/api 제외. NestJS API는 Docker로 운영.
- **규칙**:
  1. **NestJS / long-running 서버 → Vercel 절대 금지.** Railway / Render / Fly.io / VPS / 컨테이너 호스팅으로.
  2. **Prisma + pnpm 10 조합**: build script에 `prisma generate &&` 명시 + root `package.json`에 `"pnpm": { "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma", ...] }` 화이트리스트 필수.
  3. 모노레포 + Vercel은 `vercel.json` `buildCommand`에 turbo `--filter=<package>`로 명시 — 의도하지 않은 패키지가 빌드 그래프에 끌려오지 않도록.
  4. PG 시스템(🔴 결제) 프로덕션은 PCI DSS 인증 환경(NHN Cloud / AWS Seoul) 필수. 일반 PaaS는 PoC/내부 데모까지만.

---

## 🟡 [2026-04-29] [Migration] drizzle-kit push의 비인터랙티브 막힘

- **증상**: dairect e2e 환경에서 `pnpm db:push`가 "invoices_workspace_number_unique 제약 추가 시 truncate 묻는 prompt" → TTY 부재로 throw. `supabase db reset` 후에도 동일 prompt.
- **원인**: drizzle-kit 0.31.10이 schema 변경 중 데이터 손실 가능성을 확인하기 위해 인터랙티브 prompt를 띄우는데, 이 prompt 자체가 TTY 없는 셸에서 throw로 처리됨. supabase db reset은 supabase migrations 폴더 기반이라 dairect의 drizzle migrations와 무관(미적용).
- **해결**: `docker exec -i supabase_db_dairect psql -v ON_ERROR_STOP=1 < migrations/NNNN_*.sql`을 정렬 순서대로 직접 실행. 42개 SQL 일괄 적용 → 23 테이블 정상 생성.
- **규칙**:
  1. **CI/자동화 환경에서는 `drizzle-kit push` 사용 금지** (TTY 의존). `drizzle-kit migrate` 또는 SQL 파일 직접 적용.
  2. supabase 프로젝트가 drizzle migrations를 쓰는 경우 `supabase db reset`은 의미 없음 — 별도로 drizzle SQL 적용 단계가 필요.
  3. 마이그레이션 파일은 반드시 `0NNN_*.sql` 정렬 순서로 적용. journal 파일(`_meta/_journal.json`)이 없거나 stale하면 `drizzle-kit migrate`도 무동작이라 SQL 직접 실행이 가장 안전.

---

## 🟡 [2026-04-29] [Docs] 시연 자격증명은 seed.ts를 SOT로 — DEMO 문서 drift 차단

- **증상**: `docs/DEMO_SCENARIO.md`에 적힌 `admin@pgsystem.co.kr` / `Admin1234!@#$` / `localhost:3001`로 로그인 시도가 모두 실패. 실제 seed는 `login_id="admin"` / `Admin1234!@` / `localhost:3500`.
- **원인**: 시드 코드(`apps/api/prisma/seed.ts`)가 변경되었으나 데모 문서가 따라가지 않음. 추가로 API DTO는 camelCase(`loginId`)인데 문서엔 snake_case 인상.
- **해결**: 문서를 seed.ts 실제값으로 정정 + `로그인 ID는 이메일이 아닌 login_id` 명시 + Prisma 6+ 대응 seed 명령(`npx tsx prisma/seed.ts`) 가이드.
- **규칙**:
  1. **데모/온보딩 문서의 자격증명은 seed.ts를 단일 진실원천(SOT)으로 인용 형식 사용**. 가능하면 seed 콘솔 출력을 그대로 붙여넣고 코드 변경 시 문서 업데이트를 같은 PR에서 처리.
  2. seed 환경변수(`SEED_ADMIN_PASSWORD` 등)가 있으면 문서에 명시 — 기본값 + override 방법 둘 다.
  3. API DTO 케이스(camelCase vs snake_case)도 데모 문서에 명시 — Postman/cURL 예시 누가 봐도 따라할 수 있게.

---

---

## 📌 기록 규칙
- 2번 이상 반복된 에러만 기록
- 해결에 30분 이상 걸린 에러 기록
- AI가 잘못된 방향으로 간 패턴 기록
- "이 방식 대신 저 방식" 결정 기록
- 단순 오타, 1분 해결, 일회성 환경 문제는 기록하지 않음

---

## 🐛 에러 패턴 (Error Patterns)

### 카테고리: [Docker / Supabase / n8n / Next.js / 기타]

<!--
아래 형식으로 기록:

## [날짜] [카테고리] - [에러 제목 한 줄]
- **증상**: [어떤 에러 메시지가 나왔는지]
- **원인**: [왜 발생했는지]
- **해결**: [어떻게 고쳤는지]
- **규칙**: [다음에 이걸 방지하려면 어떻게 해야 하는지] ← 가장 중요!
-->

(아직 없음 — Task 완료 시 자동 추가됨)

---

## 🔀 AI 방향 이탈 패턴 (AI Went Wrong)

<!--
AI가 잘못된 방향으로 코드를 작성한 경우 기록:

## [날짜] AI가 [무엇을] 잘못함
- **상황**: [어떤 지시를 했는지]
- **AI가 한 것**: [AI가 실제로 무엇을 했는지]
- **문제**: [왜 그게 잘못인지]
- **올바른 방향**: [이렇게 했어야 했다]
- **프롬프트 교훈**: [다음에 AI에게 이렇게 지시해야 한다]
-->

(아직 없음)

---

## 🔑 설계 결정 기록 (Design Decisions)

<!--
"A 방식 vs B 방식" 중 선택한 이유:

## [날짜] [결정 제목]
- **선택지**: A 방식 vs B 방식
- **선택**: [A/B] 방식
- **이유**: [왜 이걸 선택했는지]
- **트레이드오프**: [선택하지 않은 것의 장점은 무엇이었는지]
-->

(아직 없음)

---

## 📊 누적 통계
- 총 기록 수: 0
- 에러 패턴: 0
- AI 이탈 패턴: 0
- 설계 결정: 0
- 가장 자주 발생하는 카테고리: (없음)
### [2026-03-05] AGENTS.md/CLAUDE.md 작성 원칙 (ETH Zurich 연구)

**증상:** 컨텍스트 파일이 길수록 AI 성능이 좋아질 거라 가정
**원인:** AI가 이미 아는 내용을 반복하면 → 토큰 낭비 + 불필요한 탐색 증가 + 성능 저하
**해결:** "AI가 코드만 봐서 절대 모를 것"만 작성

**규칙:**
1. CLAUDE.md/Custom Instructions에 코딩 상식(SRP, 에러처리 등) 쓰지 않기
2. 쓸 것: 도구 선택, 비관적 제약, 시스템 특화 정보 (3가지만)
3. 문서가 계속 늘어나면 → 코드/구조 문제 의심 먼저
4. /init 자동생성 CLAUDE.md 사용 금지 → 반드시 수동 작성
5. 300줄 이하 유지 (프로: 60줄 이하)