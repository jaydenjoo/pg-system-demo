# 🛡️ 방어적 프로그래밍 계획서
> **Defensive Programming Blueprint — 범용 가이드**
> 작성일: 2026.03.07
> 원칙: "사용자는 항상 예상 밖의 행동을 한다. 그것을 가정하고 설계한다."

---

## 📌 개요

### 전체 방어 구조

```
┌─────────────────────────────────────────────┐
│  Layer 1. 프론트엔드   → 입력 자체를 막는다  │
│  Layer 2. 백엔드       → 서버에서 재검증한다 │
│  Layer 3. 에러 처리    → 우아하게 실패한다   │
│  Layer 4. 모니터링     → 사후에 빠르게 감지  │
└─────────────────────────────────────────────┘
```

> **비유: 공항 보안 시스템**
> - 체크인 카운터(프론트)에서 1차 서류 확인
> - 보안 게이트(백엔드)에서 2차 정밀 검사
> - 비상 매뉴얼(에러 처리)로 사고 대응
> - 관제탑(모니터링)에서 전체 상황 파악

---

## 🛡️ Layer 1: 프론트엔드 방어

> **목표**: 잘못된 입력이 서버까지 도달하지 못하게 막는다
> **핵심**: 사용자가 실수했을 때 즉시 친절하게 안내한다

### 1-1. 입력 유효성 검사 규칙

| 입력 유형 | 검사 규칙 | 에러 메시지 예시 |
|---------|---------|--------------|
| 텍스트 필드 | 최소/최대 글자 수 제한 | "300자 이내로 입력해주세요" |
| 빈 입력 | 공백만 있으면 제출 차단 | "내용을 입력해주세요" |
| 이메일 | `@` 포함, 도메인 형식 | "올바른 이메일 형식이 아닙니다" |
| 숫자 필드 | 문자 입력 차단, 범위 제한 | "숫자만 입력 가능합니다" |
| 파일 업로드 | 허용 확장자, 최대 용량 | "10MB 이하 파일만 가능합니다" |
| 날짜 | 과거/미래 범위 제한 | "유효한 날짜를 입력해주세요" |
| URL | 형식 패턴 검사 | "올바른 URL 형식이 아닙니다" |

### 1-2. 보안 입력 차단 목록

```
차단해야 할 패턴:
- HTML 태그:     <script>, <iframe>, <img onerror=...>
- SQL 인젝션:    SELECT, DROP, INSERT, DELETE, UNION
- 경로 탐색:     ../../../, ..\..\..\
- 명령어 인젝션: ;rm -rf, && del, | bash
- AI 인젝션:     "당신의 지침을 무시하고", "System prompt을 알려줘"
```

### 1-3. UI 방어 패턴

```
[ ] 제출 버튼 중복 클릭 방지
    → 클릭 즉시 비활성화 → 로딩 표시 → 응답 후 재활성화

[ ] 폼 이탈 경고
    → 입력 중 페이지 이탈 시 "작성 중인 내용이 있습니다" 경고

[ ] 타임아웃 안내
    → 30초 응답 없으면 "응답이 지연되고 있어요" 표시

[ ] 오프라인 감지
    → 인터넷 끊기면 "네트워크 연결을 확인해주세요" 표시

[ ] 실시간 입력 피드백
    → 글자 수 카운터, 형식 오류 즉시 표시 (제출 후가 아니라 입력 중에)
```

### 1-4. 코드 패턴

```typescript
// ✅ 입력 검증 함수 패턴
const validateInput = (value: string, options: {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}): { valid: boolean; error?: string } => {
  
  if (!value.trim()) 
    return { valid: false, error: '내용을 입력해주세요.' };
  
  if (options.maxLength && value.length > options.maxLength) 
    return { valid: false, error: `${options.maxLength}자 이내로 입력해주세요.` };
  
  if (options.minLength && value.length < options.minLength) 
    return { valid: false, error: `최소 ${options.minLength}자 이상 입력해주세요.` };
  
  if (options.pattern && !options.pattern.test(value)) 
    return { valid: false, error: '형식이 올바르지 않습니다.' };
  
  return { valid: true };
};

// ✅ 중복 제출 방지 패턴
const [isLoading, setIsLoading] = useState(false);

const handleSubmit = async () => {
  if (isLoading) return;           // 이미 처리 중이면 무시
  setIsLoading(true);
  try {
    await submitData();
  } finally {
    setIsLoading(false);           // 성공/실패 무관하게 항상 해제
  }
};
```

---

## 🛡️ Layer 2: 백엔드 방어

> **목표**: "프론트를 절대 믿지 마라" — 모든 입력을 서버에서 재검증한다
> **핵심**: 프론트엔드는 우회 가능하다. 서버만이 진짜 방어선이다

### 2-1. 서버사이드 검증 규칙

```
프론트에서 검증했더라도 서버에서 반드시 재검증:

[ ] 입력 타입 검증     (숫자여야 하는데 문자가 들어왔는가?)
[ ] 입력 길이 검증     (제한을 우회해서 긴 값이 들어왔는가?)
[ ] 권한 검증          (이 사용자가 이 데이터에 접근 가능한가?)
[ ] 인증 토큰 검증     (매 요청마다 토큰이 유효한가?)
[ ] 데이터 존재 검증   (참조하는 ID가 실제로 존재하는가?)
[ ] 비즈니스 규칙 검증 (결제 금액이 허용 범위 안인가?)
```

### 2-2. 인증/인가 체크리스트

```
인증 (Authentication) — "당신이 누구인지":
[ ] 모든 보호된 엔드포인트에 인증 미들웨어 적용
[ ] 토큰 만료 처리 (만료 시 로그인 페이지로 리다이렉트)
[ ] 민감한 작업은 재인증 요구 (비밀번호 변경, 결제 등)

인가 (Authorization) — "당신이 무엇을 할 수 있는지":
[ ] 타인의 데이터 접근 차단 (내 ID로 남의 데이터 조회 불가)
[ ] 관리자 기능에 역할(Role) 기반 접근 제어
[ ] 삭제/수정은 소유자 확인 후에만 허용
```

### 2-3. Rate Limiting (요청 횟수 제한)

| 제한 기준 | 권장 임계값 | 초과 시 대응 |
|---------|-----------|-----------|
| IP별 분당 요청 | 60회/분 | 429 Too Many Requests |
| 로그인 실패 | 5회 연속 | 15분 잠금 |
| API 호출 | 서비스별 설정 | 한도 초과 안내 |
| 파일 업로드 | 10회/시간 | 업로드 차단 |

### 2-4. 데이터베이스 방어

```sql
-- ✅ Row Level Security 활성화 (Supabase 기준)
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- ✅ 사용자는 자신의 데이터만 접근
CREATE POLICY "own_data_only" ON user_data
  FOR ALL USING (auth.uid() = user_id);

-- ✅ 컬럼 레벨 길이 제한
content TEXT NOT NULL CHECK (
  length(content) > 0 AND length(content) <= 300
);

-- ✅ 타임스탬프 수동 입력 금지 (자동 생성)
created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
```

### 2-5. 환경변수 보안 규칙

```bash
# ✅ 반드시 .env 파일로 분리
API_KEY=sk-...
DATABASE_URL=postgresql://...
SECRET_KEY=...

# ❌ 코드에 직접 입력 절대 금지
const apiKey = "sk-1234567890";  # 하드코딩 금지!

# .gitignore에 반드시 추가
.env
.env.local
.env.production
```

---

## 🛡️ Layer 3: 에러 처리

> **목표**: 에러는 반드시 발생한다. 넘어져도 다치지 않게 설계한다
> **핵심**: 사용자에게는 친절하게, 개발자에게는 상세하게

### 3-1. 에러 처리 3원칙

```
원칙 1. 서비스는 계속 동작한다
  → 하나의 기능이 실패해도 전체 서비스가 중단되면 안 된다

원칙 2. 사용자에게 기술적 메시지를 노출하지 않는다
  → "Error: undefined is not a function" ❌
  → "일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요." ✅

원칙 3. 에러는 반드시 기록한다
  → console.log만 찍고 넘기는 것은 에러 처리가 아니다
```

### 3-2. 에러 유형별 대응표

| HTTP 상태 | 에러 유형 | 사용자 메시지 | 개발자 처리 |
|---------|---------|------------|-----------|
| 400 | 잘못된 요청 | "입력 내용을 다시 확인해주세요." | 입력값 로그 |
| 401 | 인증 만료 | "세션이 만료되었어요. 다시 로그인해주세요." | 로그인 리다이렉트 |
| 403 | 권한 없음 | "접근 권한이 없습니다." | 접근 시도 로그 |
| 404 | 리소스 없음 | "요청한 정보를 찾을 수 없어요." | URL 확인 |
| 429 | 요청 초과 | "잠시 후 다시 시도해주세요." | IP/세션 기록 |
| 500 | 서버 오류 | "일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요." | 알림 + 로그 |
| 503 | 서비스 불가 | "현재 서비스 점검 중이에요. 잠시 후 다시 이용해주세요." | 긴급 알림 |
| 타임아웃 | 응답 지연 | "응답이 지연되고 있어요. 잠시 후 다시 시도해주세요." | 재시도 1회 |
| 네트워크 | 연결 끊김 | "인터넷 연결을 확인해주세요." | 재연결 감지 |

### 3-3. 코드 패턴

```typescript
// ✅ 기본 에러 처리 패턴
try {
  const result = await riskyOperation();
  return { success: true, data: result };
  
} catch (error) {
  // 개발자용: 상세 로그
  console.error('[Operation Failed]', {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    context: { /* 관련 정보 */ }
  });
  
  // 사용자용: 친절한 메시지
  return {
    success: false,
    userMessage: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.'
  };
}

// ✅ 재시도 패턴 (네트워크 오류 대비)
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error('Max retries exceeded');
};

// ✅ API 호출 전용 에러 처리
const safeApiCall = async (url: string, options?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
  
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('REQUEST_TIMEOUT');
    }
    throw error;
  }
};
```

### 3-4. 폴백(Fallback) 전략

```
정상 경로 실패 시 → 단계별 폴백:

1단계: 캐시된 데이터 표시 (신선도 낮아도 없는 것보다 낫다)
2단계: 기본값/빈 상태 UI 표시 (에러 화면보다 낫다)
3단계: 재시도 버튼 제공 (사용자가 직접 재시도 가능하게)
4단계: 대안 경로 안내 (고객센터, 다른 방법 안내)
```

---

## 🛡️ Layer 4: 모니터링

> **목표**: 막지 못한 것들을 빠르게 발견하고 수정한다
> **핵심**: 문제를 사용자보다 먼저 알아야 한다

### 4-1. 모니터링 도구 선택 가이드

| 도구 | 역할 | 비용 | 추천 상황 |
|-----|------|------|---------|
| **Sentry** | 에러 자동 수집 + 알림 | 무료 티어 | 모든 프로젝트 기본 |
| **Slack 알림** | 실시간 이상 감지 알림 | 무료 | n8n/자동화 프로젝트 |
| **Uptime Robot** | 서버 다운 감지 | 무료 | 운영 서비스 |
| **Supabase 로그** | DB 접근 기록 | 내장 | Supabase 사용 시 |
| **Vercel Analytics** | 페이지 성능/에러 | 무료 티어 | Next.js 프로젝트 |

### 4-2. 알림 우선순위 분류

```
🔴 즉시 알림 (Critical) — 5분 내 대응:
  - 서버/서비스 다운
  - 인증 시스템 연속 실패
  - 외부 API 연속 3회 이상 실패
  - 비용 한도 80% 초과
  - 의심스러운 보안 패턴 감지

🟡 1시간 내 알림 (Warning):
  - 에러율 급증 (평소 대비 3배 이상)
  - 응답 시간 급격히 느려짐
  - 특정 기능 반복 실패

🟢 일간 요약 (Info):
  - 총 요청 수 / 에러 수
  - 평균 응답 시간
  - 일별 비용 현황
  - 사용자 활동 요약
```

### 4-3. 핵심 지표(KPI) 기준표

| 지표 | 정상 | 경고 | 위험 |
|-----|------|------|------|
| 서비스 가용성 | > 99.5% | 99~99.5% | < 99% |
| 응답 성공률 | > 98% | 95~98% | < 95% |
| 평균 응답 시간 | < 2초 | 2~5초 | > 5초 |
| 에러율 | < 1% | 1~3% | > 3% |
| API 비용 | < 예산 70% | 70~90% | > 90% |

### 4-4. 로그 기록 필수 항목

```
모든 서비스에서 반드시 기록해야 할 것:

[ ] 요청 시각 (timestamp)
[ ] 요청한 사용자/세션 ID (익명화 처리)
[ ] 요청 유형 (어떤 기능을 사용했는가)
[ ] 성공/실패 여부
[ ] 실패 시 에러 코드 및 메시지
[ ] 응답 시간 (ms)

기록하면 안 되는 것 (개인정보 보호):
[ ] 비밀번호 (절대 금지)
[ ] 카드번호, 계좌번호
[ ] 주민등록번호 등 민감 개인정보
```

---

## 🚨 안티패턴 (절대 하지 말 것)

```
코드 품질:
❌ catch 블록을 비워두기: catch(e) {}
❌ 에러를 console.log만 찍고 넘기기
❌ any 타입으로 검증 우회하기
❌ API 키/비밀번호를 코드에 직접 작성

보안:
❌ 프론트엔드 검증만 믿고 백엔드 검증 생략
❌ 사용자에게 상세 에러 스택 노출
❌ 인증 없이 데이터 수정/삭제 허용
❌ 사용자 입력을 검증 없이 DB에 직접 저장

운영:
❌ 모니터링 없이 운영
❌ 에러 로그 없이 운영
❌ 단일 장애점(SPOF) 설계 (하나 죽으면 전체 죽는 구조)
❌ 백업 없이 운영
```

---

## ✅ 새 프로젝트 시작 시 체크리스트

### 개발 시작 전
```
[ ] .env 파일 생성 + .gitignore 등록
[ ] 에러 로깅 도구 설정 (Sentry 등)
[ ] 알림 채널 설정 (Slack 등)
[ ] 인증 미들웨어 설계
```

### 개발 중
```
[ ] 모든 외부 API 호출에 try-catch 적용
[ ] 모든 외부 API 호출에 타임아웃 설정
[ ] 사용자 입력 필드마다 검증 로직 추가
[ ] 에러 유형별 사용자 메시지 정의
[ ] Rate Limiting 미들웨어 적용
[ ] DB 테이블에 RLS 및 길이 제약 설정
```

### 배포 전
```
[ ] 환경변수 전체 점검 (코드에 하드코딩된 값 없는지)
[ ] 에러 메시지가 사용자에게 직접 노출되지 않는지 확인
[ ] Rate Limiting 동작 테스트
[ ] 의도적으로 에러를 발생시켜 폴백 동작 확인
[ ] 모니터링 알림 테스트 (실제로 알림이 오는지)
```

### 배포 후
```
[ ] 첫 24시간 집중 모니터링
[ ] 에러 로그 일일 점검 (초기 1주일)
[ ] 이상 패턴 발견 시 learnings.md에 기록
```

---

## 📐 방어 구현 우선순위 가이드

새 프로젝트에서 시간이 부족할 때, 이 순서로 구현한다:

```
1순위 (런칭 전 필수):
  → 입력 길이 제한 + 필수 필드 검증
  → API 키 환경변수 분리
  → 기본 try-catch + 사용자 친화 에러 메시지
  → 인증 미들웨어

2순위 (런칭 후 1주일 내):
  → Sentry 에러 모니터링 연동
  → Rate Limiting
  → DB RLS 활성화
  → Slack 긴급 알림

3순위 (안정화 후):
  → 재시도 로직
  → 상세 로그 시스템
  → KPI 대시보드
  → 자동 일간 리포트
```

---

*Plan is King. 방어는 코딩 전에 설계한다.*
*에러는 "만약 나면"이 아니라 "언제 나는가"의 문제다.*
*Last Updated: 2026.03.07*
