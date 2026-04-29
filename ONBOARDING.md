# PG System — 온보딩 가이드 (새 세션용)

> 이 문서는 새 Claude 세션(=새 담당자)이 5분 안에 개발을 시작하기 위한 가이드입니다.

## 1. 프로젝트 요약
- **PG사 관리시스템** 역설계 → 보안 강화 재구축 (🔴 보안 프로젝트)
- NestJS + Prisma + PostgreSQL + JWT/MFA
- 모노레포: `apps/api` (백엔드), `apps/web` (프론트 — 미구현)

## 2. 필수 읽기 (순서대로)
1. `CLAUDE.md` — 프로젝트 규칙 (자동 로드됨)
2. `PROGRESS.md` — 현재 진행 상황 + 다음 작업
3. `.claude/rules/` — 보안/코딩 규칙 (자동 로드됨)

## 3. 핵심 명령어
```bash
cd ~/project/pg-system
pnpm install                    # 의존성 설치
docker compose -f docker-compose.dev.yml up -d  # DB 실행
cd apps/api && npx prisma migrate dev           # DB 마이그레이션
npm run dev                     # 개발 서버 (API)
npx tsc --noEmit && npm test    # 검증 (타입체크 + 테스트)
```

## 4. 워크플로우
- **Opus**: 기획/설계/리뷰만. 코드 직접 작성 안 함
- **Sonnet**: 실제 코딩 담당
- **보안 코드**: 반드시 Plan → Jayden 승인 → 구현
- **완료 후**: `npx tsc --noEmit && npm test` → pg-system-audit 동기화

## 5. 현재 상태
- Step 11 완료 (Docker 프로덕션 시뮬레이션)
- Step 12 진행 중 (운영 매뉴얼)
- 테스트: 22 suites / 334 tests 전체 통과
- 자동 채번: merchantCode(`M`+날짜+순번), agentCode(`A`+날짜+순번)

## 6. 금지사항 (CRITICAL)
- `any` 타입, 하드코딩 시크릿, n8n/Supabase 사용, `SELECT *`
- 에러 메시지에 내부 정보 노출
- 10개 이상 파일 동시 수정
