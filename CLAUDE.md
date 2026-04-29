# CLAUDE.md — Jayden's Vibe Coding System v2.2 + Enterprise Guard
> 이 파일은 Claude Code가 매 세션 자동으로 읽는 프로젝트 핵심 규칙입니다.
> PG System을 실제 프로젝트명으로 변경하세요.

## 프로젝트 정보
- **이름**: PG System
- **설명**: 한국 금융감독원 기준 결제대행(PG) 시스템 — 결제 도메인 특화, 로그인/비로그인 이원화, 대외비 보호
- **스택**: 
- **방식**: 비개발자 바이브코딩 (Claude Code 중심 — 보안 최고등급)
- **보안등급**: 🔴 최고 (돈+법적책임) — n8n/Supabase 자동화 금지, 직접 코드+수동 검증 필수
- **규제**: 한국 금융감독원(FSS) 기준 준수

## 핵심 문서 (반드시 참조)
- `docs/PRD.md` — 설계도 (기능 + 안 할 것)
- `docs/PROGRESS.md` — 진행상황 추적 (세션 이어하기 핵심)
- `docs/learnings.md` — 에러패턴/AI이탈패턴/설계결정 기록 (컴파운드엔지니어링)
  - 세션시작시 반드시 읽기 → 기록된 규칙은 이번 작업에도 적용
  - Task완료시 기록할 교훈 여부 자동 판단

## 🛡️ 엔터프라이즈 가드 (최우선)
1. **스코프 제한**: 요청받은 것만 구현. 추가 제안은 "다음Task로 제안합니다"로 처리
2. **PRD 필수**: 새 프로젝트 → PRD 먼저 (목적/기능/안할것/스택/Epic분해/완료기준)
3. **1 Task씩**: Epic→Task 분해, 한번에 1Task만, 30분~2시간 단위
4. **검증 후 진행**: tsc→eslint→build→test 통과 전 다음Task 금지
5. **세션 시작**: PROGRESS.md 읽기→현재위치 보고→범위확인→승인→작업시작

## 작업 프로토콜
- Plan is King: 계획→승인→실행 (바로코딩 금지=환각전이 차단)
- 모호한 지시 → 짐작코딩 금지, 선택지+비유→확인후진행
- OAR 보고: 발견(Observation)/수정(Action)/근거(Rationale)
- 4단계 워크플로우: 설계40%→구현10%→검증40%→축적10%

## 코드 규칙
- `any` 금지 → `unknown`+타입가드
- OST: 타입/상수 한곳 정의, import해서 사용
- SRP: 함수는 한가지 일만
- 에러처리: 구체적으로 (console.log만은 금지)
- 환경변수: .env 분리, 하드코딩 금지
- 셀프체크 4질문: 역할/흐름/이유/영향

## 모델 전략
- Sonnet=80%일상, Opus=복잡설계/디버깅만, Haiku=단순작업
- opusplan=계획Opus+구현Sonnet. 의식적선택=비용절감

## 보안
- 결제/인증/개인정보 → 자동화도구 금지, 직접코드+수동검증
- 보안분류 기준: "돈, 신원, 법적 책임"

## 빌드 명령어
```bash
npm run dev        # 개발서버
npm run build      # 빌드
npx tsc --noEmit   # 타입검사
npm run lint       # 린트
npm test           # 테스트
```

## 컨텍스트 관리
- /compact: 20회 반복 or 70% 차면
- /clear: 기능 완료 시
- CLAUDE.md 5K이내. 상세는 docs/
- @파일참조로 필요파일만 로드
- 탐색은 서브에이전트 위임 → 메인컨텍스트 오염 방지

## 파일 규칙
- 기본 .md 형식. docx/pptx/pdf는 명시적 요청 시만


# AI-DLC and Spec-Driven Development

Kiro-style Spec Driven Development implementation on AI-DLC (AI Development Life Cycle)

## Project Context

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`

### Steering vs Specification

**Steering** (`.kiro/steering/`) - Guide AI with project-wide rules and context
**Specs** (`.kiro/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `.kiro/specs/` for active specifications
- Use `/kiro:spec-status [feature-name]` to check progress

## Development Guidelines
- Think in English, generate responses in Korean. All Markdown content written to project files (e.g., requirements.md, design.md, tasks.md, research.md, validation reports) MUST be written in the target language configured for this specification (see spec.json.language).

## Minimal Workflow
- Phase 0 (optional): `/kiro:steering`, `/kiro:steering-custom`
- Phase 1 (Specification):
  - `/kiro:spec-init "description"`
  - `/kiro:spec-requirements {feature}`
  - `/kiro:validate-gap {feature}` (optional: for existing codebase)
  - `/kiro:spec-design {feature} [-y]`
  - `/kiro:validate-design {feature}` (optional: design review)
  - `/kiro:spec-tasks {feature} [-y]`
- Phase 2 (Implementation): `/kiro:spec-impl {feature} [tasks]`
  - `/kiro:validate-impl {feature}` (optional: after implementation)
- Progress check: `/kiro:spec-status {feature}` (use anytime)

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/kiro:spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `.kiro/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/kiro:steering-custom`)
