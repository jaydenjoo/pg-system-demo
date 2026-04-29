# PG System 개발자 온보딩 가이드

> **대상**: 신규 입사 개발자
> **기간**: 5일 (Day 1 ~ Day 5)
> **목표**: PG System 코드베이스 이해 → 코딩 규칙 숙지 → 첫 기능 구현까지
> **최종 수정**: 2026-03-01

---

## 목차

1. [Day 1: 개발 환경 구축](#day-1-개발-환경-구축)
2. [Day 2: 코드 구조 이해](#day-2-코드-구조-이해)
3. [Day 3: 코딩 가이드](#day-3-코딩-가이드)
4. [Day 4: 개발 워크플로우](#day-4-개발-워크플로우)
5. [Day 5: 첫 기능 구현 실습](#day-5-첫-기능-구현-실습)
6. [부록: 자주 쓰는 명령어 모음](#부록-자주-쓰는-명령어-모음)

---

## Day 1: 개발 환경 구축

### 1.1 필수 소프트웨어 설치

```bash
# 1. Node.js 20 LTS 설치 (nvm 권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc   # 또는 source ~/.bashrc
nvm install 20
nvm use 20
node -v           # v20.x.x 확인

# 2. pnpm 설치 (패키지 매니저)
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v           # 9.x.x 확인

# 3. Docker Desktop 설치
#    macOS: https://docs.docker.com/desktop/install/mac-install/
#    Linux: https://docs.docker.com/desktop/install/linux-install/
docker --version  # Docker version 24.x+ 확인
docker compose version  # v2.x+ 확인

# 4. Git 설치 확인
git --version     # 2.40+ 권장
```

### 1.2 프로젝트 클론 및 의존성 설치

```bash
# 프로젝트 클론
git clone <repository-url> pg-system
cd pg-system

# 의존성 설치 (모노레포 전체)
pnpm install

# Prisma 클라이언트 생성
cd apps/api
npx prisma generate
cd ../..
```

### 1.3 환경변수 설정

```bash
# .env 파일 생성 (팀장에게 실제 값 요청)
cp .env.example .env
```

`.env` 파일에 반드시 설정해야 할 항목:

| 변수명 | 설명 | 예시 값 |
|--------|------|---------|
| `POSTGRES_USER` | DB 사용자명 | `pgadmin` |
| `POSTGRES_PASSWORD` | DB 비밀번호 | `(팀장에게 요청)` |
| `POSTGRES_DB` | 데이터베이스명 | `pg_system_dev` |
| `DATABASE_URL` | Prisma 접속 URL | `postgresql://pgadmin:xxx@localhost:5432/pg_system_dev` |
| `JWT_ACCESS_SECRET` | JWT 액세스 토큰 시크릿 | `(팀장에게 요청)` |
| `JWT_REFRESH_SECRET` | JWT 리프레시 토큰 시크릿 | `(팀장에게 요청)` |
| `JWT_MFA_SECRET` | MFA 토큰 시크릿 | `(팀장에게 요청)` |
| `MFA_ENCRYPTION_KEY` | MFA 암호화 키 | `(팀장에게 요청)` |
| `ENCRYPTION_KEY` | 범용 암호화 키 | `(팀장에게 요청)` |
| `API_PORT` | API 서버 포트 | `4000` |
| `ALLOWED_ORIGINS` | CORS 허용 도메인 | `http://localhost:3500` |

> **보안 주의**: `.env` 파일은 절대 Git에 커밋하지 마세요. `.gitignore`에 이미 등록되어 있습니다.
> **PCI DSS 6.4.3**: 개발 환경에서도 실제 카드 데이터를 사용하지 마세요. 테스트 데이터만 사용합니다.

### 1.4 데이터베이스 설정 및 시드

```bash
# Docker로 PostgreSQL 실행
docker compose up -d db

# DB 상태 확인 (healthy가 될 때까지 대기)
docker compose ps

# Prisma 마이그레이션 실행
cd apps/api
npx prisma migrate dev

# 시드 데이터 삽입 (개발용 테스트 데이터)
npx prisma db seed

# DB 브라우저로 확인 (선택사항)
npx prisma studio
# → http://localhost:5555 에서 테이블 확인
```

### 1.5 개발 서버 실행 및 확인

```bash
# API 서버 실행 (apps/api)
cd apps/api
pnpm dev
# → http://localhost:4000 에서 실행 확인

# 별도 터미널에서 헬스체크
curl http://localhost:4000/api/v1/health
# 기대 응답: { "success": true, "data": { "status": "ok", ... } }
```

### 1.6 Day 1 체크리스트

- [ ] Node.js 20, pnpm, Docker, Git 설치 완료
- [ ] `pnpm install` 에러 없이 완료
- [ ] `.env` 파일 설정 완료 (시크릿 값 팀장 확인)
- [ ] `docker compose up -d db` → PostgreSQL healthy
- [ ] `npx prisma migrate dev` 성공
- [ ] `pnpm dev` → `curl /api/v1/health` 200 OK

---

## Day 2: 코드 구조 이해

### 2.1 모노레포 구조

```
pg-system/
├── apps/
│   ├── api/                 # NestJS 백엔드 (핵심)
│   │   ├── src/
│   │   │   ├── modules/     # 도메인별 모듈
│   │   │   ├── common/      # 공유 유틸/가드/필터
│   │   │   ├── config/      # 환경 설정
│   │   │   ├── prisma/      # Prisma 서비스
│   │   │   ├── app.module.ts
│   │   │   └── main.ts      # 앱 부트스트랩
│   │   ├── prisma/
│   │   │   ├── schema.prisma # DB 스키마 정의
│   │   │   ├── migrations/   # DB 마이그레이션 이력
│   │   │   └── seed.ts       # 시드 데이터
│   │   └── test/             # E2E 테스트
│   └── web/                  # Next.js 15 프론트엔드
│       └── src/
├── packages/
│   └── shared/               # 공유 타입/상수 (OST)
│       └── src/
│           ├── types/         # 공유 타입 정의
│           └── constants/     # 에러코드, 권한, 보안상수
├── infra/
│   └── nginx/                # 리버스 프록시 설정
├── docker-compose.yml
├── tsconfig.base.json        # TypeScript 베이스 설정
└── CLAUDE.md                 # 프로젝트 규칙
```

**핵심 원칙**: `packages/shared`에 정의된 타입과 상수를 `apps/api`와 `apps/web`에서 import합니다. 타입이나 상수를 각 앱에서 중복 정의하면 안 됩니다 (OST 원칙).

### 2.2 NestJS 아키텍처 패턴

NestJS는 **Module → Controller → Service → Prisma** 계층 구조를 따릅니다.

```
요청 흐름:

[클라이언트] → [Nginx] → [NestJS]
                            │
                    ┌───────┴───────┐
                    │  Guards       │  ← 인증/인가 확인
                    │  (JWT + 권한) │
                    └───────┬───────┘
                            │
                    ┌───────┴───────┐
                    │  Controller   │  ← 요청 파싱, DTO 검증
                    │  (라우트 핸들러)│
                    └───────┬───────┘
                            │
                    ┌───────┴───────┐
                    │  Service      │  ← 비즈니스 로직
                    │  (핵심 로직)   │
                    └───────┬───────┘
                            │
                    ┌───────┴───────┐
                    │  Prisma       │  ← DB 접근
                    │  (ORM)        │
                    └───────┬───────┘
                            │
                    [PostgreSQL DB]
```

### 2.3 모듈 구조 (도메인별)

각 비즈니스 도메인은 독립 모듈로 구성됩니다:

```
src/modules/commissions/          # 수수료 모듈 예시
├── commissions.module.ts         # 모듈 정의 (DI 컨테이너)
├── commissions.controller.ts     # API 엔드포인트 (HTTP 핸들러)
├── commissions.service.ts        # 비즈니스 로직
├── dto/                          # Data Transfer Objects
│   ├── set-merchant-commission.dto.ts
│   ├── set-agent-commission.dto.ts
│   └── commission-query.dto.ts
└── __tests__/                    # 유닛 테스트
    └── commissions.service.spec.ts
```

**모듈 정의** — 모듈은 Controller, Service, 그리고 다른 모듈에서 사용할 수 있도록 export할 서비스를 명시합니다:

```typescript
// commissions.module.ts
@Module({
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService],  // 다른 모듈에서 import 가능
})
export class CommissionsModule {}
```

### 2.4 인증/인가 흐름

```
로그인 → MFA 검증 → JWT 발급 → API 요청 시 Guard 체인 통과

[1. 로그인 요청]
    POST /api/v1/auth/login  { loginId, password }
    │
    ▼
[2. 비밀번호 검증]
    bcrypt.compare(password, hashedPassword)
    실패 5회 → 계정 잠금 30분 (PCI DSS 8.3.4)
    │
    ▼
[3. MFA 토큰 발급]
    MFA가 활성화된 경우 → mfaToken 반환
    POST /api/v1/auth/verify-mfa  { mfaToken, totpCode }
    │
    ▼
[4. JWT 토큰 발급]
    accessToken  (15분 만료) + refreshToken (7일 만료)
    │
    ▼
[5. API 요청마다]
    Authorization: Bearer <accessToken>
    │
    ▼
[6. Guard 체인]
    JwtAuthGuard → PermissionsGuard → Controller
    │                │
    │                └─ @RequirePermissions(PERMISSIONS.XXX) 데코레이터 확인
    └─ JWT 유효성 검증, payload에서 user 정보 추출
```

**JwtPayload 구조** (`packages/shared`에 정의):

```typescript
export interface JwtPayload {
  sub: string;           // 사용자 UUID
  loginId: string;       // 로그인 ID
  userType: 'ADMIN' | 'AGENT' | 'MERCHANT';
  roles: string[];       // 역할 목록
  permissions: string[]; // 세분화된 권한 코드
}
```

### 2.5 미들웨어 / 인터셉터 / 필터 (공통 레이어)

```
src/common/
├── guards/
│   ├── jwt-auth.guard.ts         # JWT 인증 가드
│   └── permissions.guard.ts      # 권한 검사 가드
├── decorators/
│   ├── current-user.decorator.ts # @CurrentUser() — 현재 사용자 추출
│   └── permissions.decorator.ts  # @RequirePermissions() — 필요 권한 명시
├── interceptors/
│   ├── transform.interceptor.ts  # 응답 형식 통일 { success, data, meta? }
│   └── audit.interceptor.ts      # 감사 로그 자동 기록
├── filters/
│   └── http-exception.filter.ts  # 전역 에러 처리 (스택 노출 금지)
└── pipes/
    └── validation.pipe.ts        # DTO 유효성 검증
```

**TransformInterceptor** — 모든 성공 응답을 통일된 형식으로 변환:

```typescript
// 컨트롤러에서 반환:
return { data: result };
// 또는 페이지네이션:
return { data: items, meta: { total, page, limit, totalPages } };

// 클라이언트가 받는 응답:
{ "success": true, "data": { ... } }
{ "success": true, "data": [...], "meta": { "total": 100, "page": 1, ... } }
```

**GlobalExceptionFilter** — 모든 에러를 통일된 형식으로 변환:

```typescript
// 에러 응답 형식 (항상 동일):
{
  "success": false,
  "error": {
    "code": "AUTH_001",       // packages/shared의 ERROR_CODES 참조
    "message": "인증이 필요합니다"  // 사용자 친화적 메시지 (한국어)
  }
}
// 주의: 스택 트레이스, DB 구조, 쿼리 정보는 절대 응답에 포함하지 않음 (서버 로그에만 기록)
```

### 2.6 Prisma ORM

Prisma는 타입 안전한 DB 접근 계층입니다.

```typescript
// PrismaService — NestJS 생명주기와 통합
@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// 서비스에서 사용:
constructor(private readonly prisma: PrismaService) {}

// 단일 조회
const user = await this.prisma.users.findUnique({
  where: { id: userId },
  select: { id: true, login_id: true, user_type: true }, // SELECT * 금지
});

// 트랜잭션 (여러 쿼리를 원자적으로 실행)
return this.prisma.$transaction(async (tx) => {
  await tx.table1.update({ ... });
  return tx.table2.create({ ... });
});
```

### 2.7 Day 2 체크리스트

- [ ] 모노레포 구조 (`apps/api`, `apps/web`, `packages/shared`) 이해
- [ ] NestJS Module → Controller → Service → Prisma 계층 구조 이해
- [ ] 인증 흐름 (Login → MFA → JWT → Guard 체인) 이해
- [ ] 공통 레이어 (Guards, Interceptors, Filters) 역할 이해
- [ ] `packages/shared`에서 타입/상수 import하는 OST 패턴 이해
- [ ] Prisma 기본 쿼리 (findUnique, findMany, create, $transaction) 이해

---

## Day 3: 코딩 가이드

### 3.1 TypeScript Strict 모드

이 프로젝트는 **TypeScript strict: true**가 적용되어 있습니다. `tsconfig.base.json`의 핵심 설정:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**`any` 타입은 절대 금지**입니다. 대신 다음 패턴을 사용하세요:

```typescript
// ❌ 금지: any 사용
function process(data: any): any {
  return data.name;
}

// ✅ 올바른 방법 1: 구체적 타입 정의
interface UserData {
  name: string;
  email: string;
}
function process(data: UserData): string {
  return data.name;
}

// ✅ 올바른 방법 2: unknown + 타입 가드
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    return (data as { name: string }).name;
  }
  throw new Error('Invalid data format');
}

// ✅ 올바른 방법 3: 제네릭
function process<T extends { name: string }>(data: T): string {
  return data.name;
}
```

### 3.2 네이밍 규칙

| 대상 | 규칙 | 예시 |
|------|------|------|
| 변수, 함수 | camelCase | `getUserById`, `merchantCount` |
| 타입, 인터페이스, 클래스 | PascalCase | `UserProfile`, `CommissionsService` |
| 상수 | SCREAMING_SNAKE_CASE | `MAX_LOGIN_ATTEMPTS`, `ERROR_CODES` |
| 파일명 | kebab-case | `jwt-auth.guard.ts`, `set-merchant-commission.dto.ts` |
| DB 테이블 | snake_case | `user_profiles`, `agent_commissions` |
| 환경변수 | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `JWT_ACCESS_SECRET` |

### 3.3 에러 처리 패턴

**에러를 절대 삼키지 않습니다** — 모든 에러는 적절히 처리하거나 상위로 전파합니다.

```typescript
// ❌ 금지: 에러 삼키기
try {
  await someOperation();
} catch (error) {
  console.log(error);  // console.log만 찍고 무시
}

// ❌ 금지: 내부 정보 노출
throw new HttpException(
  `DB 쿼리 실패: ${error.message}, 테이블: users`,  // DB 구조 노출
  500,
);

// ✅ 올바른 방법: NestJS 예외 + 에러 코드 사용
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ERROR_CODES } from '@pg-system/shared';

// 찾을 수 없음
throw new NotFoundException({
  code: ERROR_CODES.MERCHANT_001,
  message: '가맹점을 찾을 수 없습니다',
});

// 유효성 검증 실패
throw new BadRequestException({
  code: ERROR_CODES.STL_003,
  message: '수수료 계층 검증 실패: 대리점 수수료는 PG 마진 이상이어야 합니다',
});
```

**에러 코드는 `packages/shared`에서 중앙 관리**합니다:

```typescript
// packages/shared/src/constants/index.ts
export const ERROR_CODES = {
  AUTH_001: 'AUTH_001',        // 인증이 필요합니다
  AUTH_002: 'AUTH_002',        // 아이디 또는 비밀번호가 올바르지 않습니다
  AUTH_003: 'AUTH_003',        // 계정이 잠겼습니다
  AUTH_008: 'AUTH_008',        // 권한이 없습니다
  AGENT_001: 'AGENT_001',     // 대리점을 찾을 수 없습니다
  MERCHANT_001: 'MERCHANT_001', // 가맹점을 찾을 수 없습니다
  STL_003: 'STL_003',         // 수수료 계층 검증 실패
  INTERNAL_ERROR: 'INTERNAL_ERROR', // 내부 오류
} as const;
```

### 3.4 DTO (Data Transfer Object) 작성법

모든 API 입력은 DTO를 통해 자동 검증됩니다 (`class-validator` + `ValidationPipe`).

```typescript
import {
  IsString,
  IsOptional,
  Matches,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SetMerchantCommissionDto {
  @IsString()
  @MaxLength(30, { message: '결제 수단은 30자 이하여야 합니다' })
  paymentMethod!: string;   // ! = 필수 필드

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cardCompany?: string;     // ? = 선택 필드

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: '수수료율은 숫자(소수점 4자리 이하)만 허용됩니다',
  })
  commissionRate!: string;
}

// 페이지네이션 쿼리 DTO
export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseInt(value, 10) : value)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseInt(value, 10) : value)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

**핵심 규칙**:
- 검증 메시지는 한국어로 작성
- 필수 필드는 `!` (definite assignment assertion)
- 선택 필드는 `?` (optional property)
- Query string 파라미터는 `@Transform`으로 타입 변환
- `whitelist: true` 설정으로 DTO에 정의되지 않은 필드는 자동 제거

### 3.5 Controller 작성법

```typescript
@Controller('api/v1/commissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)  // 모든 엔드포인트에 인증 적용
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  // GET — 목록 조회
  @Get('pg-margins')
  @RequirePermissions(PERMISSIONS.COMMISSION_READ)
  async getPgMargins(
    @Query() query: CommissionQueryDto,
  ): Promise<{ data: PgDefaultMargins[] }> {
    return { data: await this.commissionsService.getPgMargins(query) };
  }

  // POST — 생성
  @Post('pg-margins')
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async setPgMargin(
    @Body() dto: SetPgMarginDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: PgDefaultMargins }> {
    return { data: await this.commissionsService.setPgMargin(dto, user.sub) };
  }

  // GET — 단일 조회 (UUID 파라미터)
  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMMISSION_READ)
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: Commission }> {
    return { data: await this.commissionsService.getById(id) };
  }
}
```

**Controller 규칙**:
- Controller는 **요청 파싱 → 서비스 호출 → 응답 반환**만 수행 (비즈니스 로직 금지)
- 모든 엔드포인트에 `@UseGuards(JwtAuthGuard, PermissionsGuard)` 적용
- 각 핸들러에 `@RequirePermissions()` 데코레이터로 필요 권한 명시
- 응답은 항상 `{ data: ... }` 형태 (TransformInterceptor가 `{ success: true, data }` 로 변환)
- `@CurrentUser()` 데코레이터로 현재 로그인 사용자 정보 추출

### 3.6 Service 작성법

```typescript
@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async setAgentCommission(
    agentId: string,
    dto: SetAgentCommissionDto,
    createdBy: string,
  ): Promise<AgentCommission> {
    // 1. 존재 여부 확인
    const agent = await this.prisma.agents.findUnique({
      where: { id: agentId },
    });
    if (!agent) {
      throw new NotFoundException({
        code: ERROR_CODES.AGENT_001,
        message: '대리점을 찾을 수 없습니다',
      });
    }

    // 2. 비즈니스 규칙 검증 (수수료 계층: PG ≤ 대리점 ≤ 가맹점)
    const pgMargin = await this.prisma.pg_default_margins.findFirst({
      where: { payment_method: dto.paymentMethod, effective_to: null },
    });
    if (pgMargin !== null) {
      const pgRate = Number(pgMargin.margin_rate);
      const agentRate = Number(dto.commissionRate);
      if (agentRate < pgRate) {
        throw new BadRequestException({
          code: ERROR_CODES.STL_003,
          message: '수수료 계층 검증 실패: 대리점 수수료는 PG 마진 이상이어야 합니다',
        });
      }
    }

    // 3. 트랜잭션으로 원자적 업데이트 (만료 + 생성)
    return this.prisma.$transaction(async (tx) => {
      await tx.agent_commissions.updateMany({
        where: { agent_id: agentId, effective_to: null },
        data: { effective_to: new Date() },
      });
      return tx.agent_commissions.create({
        data: {
          agent_id: agentId,
          payment_method: dto.paymentMethod,
          commission_rate: dto.commissionRate,
          effective_from: new Date(),
          created_by: createdBy,
        },
      });
    });
  }
}
```

**Service 규칙**:
- 비즈니스 로직은 반드시 Service에 작성 (Controller나 Prisma에 넣지 않기)
- Early Return 패턴: 조건 불충족 시 빠르게 예외 throw
- 여러 DB 작업은 반드시 `$transaction` 사용 (데이터 일관성)
- `SELECT *` 금지 → `select: { ... }`로 필요한 컬럼만 조회

### 3.7 보안 12계명 (요약)

이 프로젝트의 모든 코드에 적용되는 보안 규칙입니다. 상세 내용은 `.claude/rules/security.md`를 참조하세요.

| # | 규칙 | PCI DSS |
|---|------|---------|
| 1 | 카드번호 직접 저장 금지 → 토큰화 | 3.4.1 |
| 2 | 저장 데이터 AES-256-GCM 암호화, 전송 TLS 1.3 | 4.2.1 |
| 3 | 시크릿 하드코딩 금지 → 환경변수/KMS | 2.2.7 |
| 4 | 모든 입력값 검증 (SQL 인젝션, XSS, CSRF 방어) | 6.2.4 |
| 5 | 에러 메시지에 내부 정보 노출 금지 | 6.2.2 |
| 6 | 모든 접근 기록 남기기 (5년 보관) | 10.7 |
| 7 | 최소 권한 원칙 (기본값 = 거부) | 7.2 |
| 8 | 의존성 정기 점검 (`npm audit`) | 6.3.2 |
| 9 | JWT 15분 만료, Refresh 7일, HttpOnly 쿠키 | 8.6.3 |
| 10 | 결제 금액 프론트/백엔드/DB 3단계 검증 | 6.2.4 |
| 11 | Rate Limiting (결제 IP당 10/분, 로그인 5회 잠금) | 6.2.4 |
| 12 | 배포 전 보안 검사 (SAST → DAST → 리뷰) | 6.5 |

**코드 내 금지 패턴**:
```typescript
// ❌ 절대 사용 금지
eval('...');
element.innerHTML = userInput;
document.write('...');
console.log(sensitiveData);  // 프로덕션 코드
`SELECT * FROM users WHERE id = '${userId}'`;  // Raw SQL
```

### 3.8 Day 3 체크리스트

- [ ] TypeScript strict 모드와 `any` 금지 규칙 이해
- [ ] 네이밍 규칙 (camelCase/PascalCase/SCREAMING_SNAKE_CASE) 숙지
- [ ] 에러 처리 패턴 (NestJS 예외 + ERROR_CODES) 이해
- [ ] DTO 작성법 (class-validator 데코레이터) 이해
- [ ] Controller / Service 역할 분리 이해
- [ ] 보안 12계명 읽기 완료

---

## Day 4: 개발 워크플로우

### 4.1 Git 브랜칭 전략

```
main (배포용, 직접 push 금지)
 └── develop (개발 통합)
      ├── feature/add-notice-api    ← 기능 개발
      ├── fix/settlement-rounding   ← 버그 수정
      └── security/mfa-improvement  ← 보안 관련
```

```bash
# 새 기능 브랜치 생성
git checkout develop
git pull origin develop
git checkout -b feature/add-notice-api

# 작업 후 커밋
git add src/modules/notice/
git commit -m "feat: 시스템 공지사항 CRUD API 추가"

# develop에 PR 생성
git push -u origin feature/add-notice-api
# → GitHub에서 Pull Request 생성
```

### 4.2 커밋 메시지 규칙

```
<type>: <description>

<optional body>
```

| Type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat: 가맹점 수수료 조회 API 추가` |
| `fix` | 버그 수정 | `fix: 정산 금액 소수점 반올림 오류 수정` |
| `security` | 보안 수정 | `security: JWT 리프레시 토큰 만료 로직 강화` |
| `refactor` | 리팩토링 | `refactor: 수수료 계산 로직 서비스 분리` |
| `test` | 테스트 | `test: 수수료 계층 검증 단위 테스트 추가` |
| `docs` | 문서 | `docs: API 엔드포인트 명세 업데이트` |
| `chore` | 기타 | `chore: ESLint 규칙 업데이트` |

**규칙**:
- 한국어 사용 가능
- 첫 줄 70자 이내
- body에 "왜" 변경했는지 설명 (코드 자체가 "무엇"을 설명)

### 4.3 테스트 작성

**목표 커버리지: 80% 이상**

```bash
# 전체 테스트 실행
cd apps/api
pnpm test

# 특정 파일 테스트
pnpm test -- --testPathPattern=commissions

# E2E 테스트
pnpm test:e2e

# 커버리지 리포트
pnpm test -- --coverage
```

**유닛 테스트 패턴** (Jest + NestJS Testing):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommissionsService } from '../commissions.service';
import { PrismaService } from '../../../prisma/prisma.service';

// 1. Mock 정의 — Prisma의 각 테이블 메서드를 jest.fn()으로
const mockPrisma = {
  agents: {
    findUnique: jest.fn(),
  },
  pg_default_margins: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

// 2. Fixture 팩토리 — 테스트 데이터 생성 헬퍼
const makeAgent = (overrides: Record<string, unknown> = {}) => ({
  id: 'agent-uuid-1',
  name: '테스트 대리점',
  ...overrides,
});

describe('CommissionsService', () => {
  let service: CommissionsService;

  // 3. 매 테스트 전 모듈 초기화 + Mock 리셋
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
    jest.clearAllMocks();
  });

  // 4. 테스트 케이스 (한국어 설명)
  describe('setAgentCommission', () => {
    it('존재하지 않는 대리점에 수수료 설정 시 NotFoundException을 던진다', async () => {
      mockPrisma.agents.findUnique.mockResolvedValue(null);

      await expect(
        service.setAgentCommission('nonexistent', dto, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('PG 마진보다 낮은 수수료 설정 시 BadRequestException(STL_003)을 던진다', async () => {
      mockPrisma.agents.findUnique.mockResolvedValue(makeAgent());
      mockPrisma.pg_default_margins.findFirst.mockResolvedValue(
        makePgMargin({ margin_rate: '3.0000' }),
      );

      await expect(
        service.setAgentCommission('agent-1', { paymentMethod: 'CARD', commissionRate: '2.0000' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
```

**테스트 작성 원칙**:
1. **RED**: 테스트 먼저 작성 → 실행하면 실패해야 함
2. **GREEN**: 테스트를 통과하는 최소한의 코드 구현
3. **REFACTOR**: 코드 정리 (테스트는 여전히 통과해야 함)

### 4.4 검증 4단계

기능 구현이 끝나면 반드시 순서대로 실행합니다:

```bash
# 1단계: 타입 체크
npx tsc --noEmit

# 2단계: 린트
npx eslint . --fix

# 3단계: 빌드
pnpm build

# 4단계: 테스트
pnpm test
```

4단계 모두 통과해야 PR을 생성할 수 있습니다. **하나라도 실패하면 커밋하지 마세요**.

### 4.5 Pull Request 체크리스트

PR 생성 전 다음 항목을 확인합니다:

```markdown
## PR 체크리스트

### 코드 품질
- [ ] `any` 타입 사용하지 않음
- [ ] 모든 함수에 반환 타입 명시
- [ ] 에러 처리 누락 없음 (try-catch 또는 NestJS 예외)
- [ ] console.log 프로덕션 코드에 없음
- [ ] 하드코딩된 값 없음 (constants/ 사용)

### 보안
- [ ] 인증 가드 적용됨 (@UseGuards)
- [ ] 권한 체크 적용됨 (@RequirePermissions)
- [ ] 입력값 검증 DTO 적용됨
- [ ] 에러 응답에 내부 정보 없음
- [ ] API 키/비밀번호 코드에 없음

### 테스트
- [ ] 유닛 테스트 작성 (커버리지 80%+)
- [ ] Happy path + Error path 모두 테스트
- [ ] `pnpm test` 전체 통과

### 검증
- [ ] `npx tsc --noEmit` 통과
- [ ] `npx eslint .` 통과
- [ ] `pnpm build` 통과
- [ ] `pnpm test` 통과
```

### 4.6 Day 4 체크리스트

- [ ] Git 브랜칭 전략 (main → develop → feature/) 이해
- [ ] 커밋 메시지 규칙 (feat/fix/security/test/docs) 숙지
- [ ] 유닛 테스트 패턴 (Mock → Fixture → describe/it) 이해
- [ ] TDD 프로세스 (RED → GREEN → REFACTOR) 이해
- [ ] 검증 4단계 (tsc → eslint → build → test) 실행 연습
- [ ] PR 체크리스트 확인

---

## Day 5: 첫 기능 구현 실습

### 5.1 과제: 시스템 공지사항 CRUD API

**요구사항**: 관리자가 시스템 공지사항을 생성/조회/수정/삭제할 수 있는 API

| 엔드포인트 | 메서드 | 설명 | 권한 |
|-----------|--------|------|------|
| `/api/v1/notices` | GET | 공지 목록 조회 (페이지네이션) | `SYSTEM_MANAGE` |
| `/api/v1/notices/:id` | GET | 공지 상세 조회 | `SYSTEM_MANAGE` |
| `/api/v1/notices` | POST | 공지 생성 | `SYSTEM_MANAGE` |
| `/api/v1/notices/:id` | PATCH | 공지 수정 | `SYSTEM_MANAGE` |
| `/api/v1/notices/:id` | DELETE | 공지 삭제 (소프트 삭제) | `SYSTEM_MANAGE` |

### 5.2 Step 1 — Prisma 스키마에 테이블 추가

```prisma
// apps/api/prisma/schema.prisma 에 추가

model system_notices {
  id         String    @id @default(uuid()) @db.Uuid
  title      String    @db.VarChar(200)
  content    String    @db.Text
  priority   String    @default("NORMAL") @db.VarChar(20) // URGENT, HIGH, NORMAL, LOW
  is_active  Boolean   @default(true)
  created_by String    @db.Uuid
  updated_by String?   @db.Uuid
  created_at DateTime  @default(now()) @db.Timestamptz(6)
  updated_at DateTime  @updatedAt @db.Timestamptz(6)
  deleted_at DateTime? @db.Timestamptz(6)  // 소프트 삭제
}
```

```bash
# 마이그레이션 생성 및 적용
cd apps/api
npx prisma migrate dev --name add-system-notices
```

### 5.3 Step 2 — 공유 상수/타입 추가

```typescript
// packages/shared/src/constants/index.ts 에 추가

export const NOTICE_PRIORITY = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW',
} as const;

export type NoticePriority = (typeof NOTICE_PRIORITY)[keyof typeof NOTICE_PRIORITY];
```

### 5.4 Step 3 — DTO 작성

```typescript
// apps/api/src/modules/notices/dto/create-notice.dto.ts
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { NOTICE_PRIORITY, type NoticePriority } from '@pg-system/shared';

export class CreateNoticeDto {
  @IsString()
  @MaxLength(200, { message: '제목은 200자 이하여야 합니다' })
  title!: string;

  @IsString()
  @MaxLength(10000, { message: '내용은 10000자 이하여야 합니다' })
  content!: string;

  @IsOptional()
  @IsIn(Object.values(NOTICE_PRIORITY), {
    message: '우선순위는 URGENT, HIGH, NORMAL, LOW 중 하나여야 합니다',
  })
  priority?: NoticePriority;
}
```

```typescript
// apps/api/src/modules/notices/dto/update-notice.dto.ts
import { IsString, IsOptional, IsIn, IsBoolean, MaxLength } from 'class-validator';
import { NOTICE_PRIORITY, type NoticePriority } from '@pg-system/shared';

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '제목은 200자 이하여야 합니다' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: '내용은 10000자 이하여야 합니다' })
  content?: string;

  @IsOptional()
  @IsIn(Object.values(NOTICE_PRIORITY))
  priority?: NoticePriority;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

### 5.5 Step 4 — Service 작성

```typescript
// apps/api/src/modules/notices/notices.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ERROR_CODES } from '@pg-system/shared';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 20): Promise<{
    items: SystemNotice[];
    meta: PaginationMeta;
  }> {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.system_notices.findMany({
        where: { deleted_at: null },
        orderBy: [
          { priority: 'asc' },   // URGENT 먼저
          { created_at: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.system_notices.count({
        where: { deleted_at: null },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<SystemNotice> {
    const notice = await this.prisma.system_notices.findFirst({
      where: { id, deleted_at: null },
    });
    if (!notice) {
      throw new NotFoundException({
        code: ERROR_CODES.VALIDATION_001,
        message: '공지사항을 찾을 수 없습니다',
      });
    }
    return notice;
  }

  async create(
    dto: CreateNoticeDto,
    createdBy: string,
  ): Promise<SystemNotice> {
    return this.prisma.system_notices.create({
      data: {
        title: dto.title,
        content: dto.content,
        priority: dto.priority ?? 'NORMAL',
        created_by: createdBy,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateNoticeDto,
    updatedBy: string,
  ): Promise<SystemNotice> {
    // 존재 여부 확인
    await this.findById(id);

    return this.prisma.system_notices.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        updated_by: updatedBy,
      },
    });
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.findById(id);

    await this.prisma.system_notices.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        updated_by: deletedBy,
      },
    });
  }
}
```

### 5.6 Step 5 — Controller 작성

```typescript
// apps/api/src/modules/notices/notices.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NoticesService } from './notices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@pg-system/shared';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('api/v1/notices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async findAll(@Query() query: PaginationQueryDto) {
    const { items, meta } = await this.noticesService.findAll(
      query.page,
      query.limit,
    );
    return { data: items, meta };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.noticesService.findById(id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateNoticeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.noticesService.create(dto, user.sub) };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoticeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.noticesService.update(id, dto, user.sub) };
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.noticesService.softDelete(id, user.sub);
  }
}
```

### 5.7 Step 6 — Module 등록

```typescript
// apps/api/src/modules/notices/notices.module.ts
import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}

// app.module.ts에 NoticesModule import 추가
```

### 5.8 Step 7 — 유닛 테스트 작성

```typescript
// apps/api/src/modules/notices/__tests__/notices.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NoticesService } from '../notices.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  system_notices: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const makeNotice = (overrides: Record<string, unknown> = {}) => ({
  id: 'notice-uuid-1',
  title: '시스템 점검 안내',
  content: '2026년 3월 5일 02:00~04:00 시스템 점검이 진행됩니다.',
  priority: 'NORMAL',
  is_active: true,
  created_by: 'admin-uuid-1',
  updated_by: null,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
  deleted_at: null,
  ...overrides,
});

describe('NoticesService', () => {
  let service: NoticesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NoticesService>(NoticesService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('존재하는 공지사항을 반환한다', async () => {
      const notice = makeNotice();
      mockPrisma.system_notices.findFirst.mockResolvedValue(notice);

      const result = await service.findById('notice-uuid-1');

      expect(result).toEqual(notice);
      expect(mockPrisma.system_notices.findFirst).toHaveBeenCalledWith({
        where: { id: 'notice-uuid-1', deleted_at: null },
      });
    });

    it('존재하지 않는 공지사항 조회 시 NotFoundException을 던진다', async () => {
      mockPrisma.system_notices.findFirst.mockResolvedValue(null);

      await expect(
        service.findById('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('삭제된 공지사항은 조회되지 않는다', async () => {
      mockPrisma.system_notices.findFirst.mockResolvedValue(null);

      await expect(
        service.findById('deleted-notice'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('공지사항을 생성하고 반환한다', async () => {
      const notice = makeNotice();
      mockPrisma.system_notices.create.mockResolvedValue(notice);

      const result = await service.create(
        { title: '시스템 점검 안내', content: '점검 내용' },
        'admin-uuid-1',
      );

      expect(result).toEqual(notice);
      expect(mockPrisma.system_notices.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '시스템 점검 안내',
          content: '점검 내용',
          priority: 'NORMAL',
          created_by: 'admin-uuid-1',
        }),
      });
    });
  });

  describe('softDelete', () => {
    it('공지사항을 소프트 삭제한다 (deleted_at 설정)', async () => {
      mockPrisma.system_notices.findFirst.mockResolvedValue(makeNotice());
      mockPrisma.system_notices.update.mockResolvedValue(
        makeNotice({ deleted_at: new Date() }),
      );

      await service.softDelete('notice-uuid-1', 'admin-uuid-1');

      expect(mockPrisma.system_notices.update).toHaveBeenCalledWith({
        where: { id: 'notice-uuid-1' },
        data: expect.objectContaining({
          deleted_at: expect.any(Date),
          updated_by: 'admin-uuid-1',
        }),
      });
    });
  });
});
```

### 5.9 Step 8 — 검증 실행

```bash
cd apps/api

# 1. 타입 체크
npx tsc --noEmit
# ✅ 에러 0개여야 함

# 2. 린트
npx eslint . --fix
# ✅ 에러 0개여야 함

# 3. 빌드
pnpm build
# ✅ 성공해야 함

# 4. 테스트
pnpm test
# ✅ 모든 테스트 통과, 커버리지 80%+
```

### 5.10 Step 9 — PR 생성

```bash
# 커밋
git add apps/api/src/modules/notices/
git add apps/api/prisma/migrations/
git add packages/shared/src/constants/index.ts
git commit -m "feat: 시스템 공지사항 CRUD API 추가

- Prisma 스키마에 system_notices 테이블 추가
- CreateNoticeDto, UpdateNoticeDto 유효성 검증
- 소프트 삭제 패턴 적용 (deleted_at)
- 유닛 테스트 작성 (findById, create, softDelete)"

# PR 생성
git push -u origin feature/add-notice-api
```

### 5.11 코드 리뷰에서 자주 지적받는 포인트

| 지적 사항 | 해결 방법 |
|-----------|-----------|
| `any` 타입 사용 | `unknown` + 타입 가드 또는 구체적 타입 정의 |
| `SELECT *` (전체 컬럼 조회) | `select: { id: true, title: true, ... }` |
| 에러 메시지에 DB 컬럼명 노출 | ERROR_CODES 사용 + 사용자 친화적 메시지 |
| 인증 가드 누락 | `@UseGuards(JwtAuthGuard, PermissionsGuard)` 클래스 레벨 적용 |
| 하드코딩된 문자열 | `packages/shared/constants`에 상수 정의 |
| 비즈니스 로직이 Controller에 있음 | Service로 이동 |
| 테스트 없음 | 최소 happy path + error path 테스트 작성 |
| `console.log` 남아있음 | Logger 서비스 사용 또는 제거 |

### 5.12 Day 5 체크리스트

- [ ] Prisma 스키마에 테이블 추가 + 마이그레이션 실행
- [ ] 공유 상수 (`packages/shared`) 추가
- [ ] DTO 작성 (class-validator 데코레이터)
- [ ] Service 작성 (비즈니스 로직 + 에러 처리)
- [ ] Controller 작성 (라우트 핸들러 + 가드 + 권한)
- [ ] Module 등록
- [ ] 유닛 테스트 작성 (happy path + error path)
- [ ] 검증 4단계 실행 (tsc → eslint → build → test)
- [ ] PR 생성 + 체크리스트 확인

---

## 부록: 자주 쓰는 명령어 모음

### 개발 서버

```bash
# API 서버 (NestJS)
cd apps/api && pnpm dev          # http://localhost:4000

# 웹 서버 (Next.js)
cd apps/web && pnpm dev          # http://localhost:3500

# Docker 서비스 전체 실행
docker compose up -d             # DB + API + Web + Nginx

# Docker 서비스 상태 확인
docker compose ps
docker compose logs -f api       # API 컨테이너 로그 추적
```

### 데이터베이스

```bash
cd apps/api

# 마이그레이션 생성 + 적용
npx prisma migrate dev --name <migration-name>

# 마이그레이션만 적용 (프로덕션용)
npx prisma migrate deploy

# Prisma 클라이언트 재생성
npx prisma generate

# 시드 데이터 삽입
npx prisma db seed

# DB GUI 열기
npx prisma studio               # http://localhost:5555

# 스키마 변경 사항 확인
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
```

### 코드 품질

```bash
cd apps/api

# 타입 체크
npx tsc --noEmit

# 린트 (자동 수정 포함)
npx eslint . --fix

# 빌드
pnpm build

# 전체 테스트
pnpm test

# 특정 파일 테스트
pnpm test -- --testPathPattern=notices

# 테스트 커버리지
pnpm test -- --coverage

# E2E 테스트
pnpm test:e2e

# 보안 취약점 점검
npm audit
```

### Git

```bash
# 브랜치 생성
git checkout -b feature/<name>

# 커밋 (conventional commit)
git commit -m "feat: <설명>"

# 원격 push (최초)
git push -u origin feature/<name>

# develop과 동기화
git checkout develop
git pull origin develop
git checkout feature/<name>
git merge develop                # 충돌 해결 후 계속
```

### 디버깅

```bash
# NestJS 디버그 모드
cd apps/api
node --inspect dist/main.js
# → Chrome DevTools에서 chrome://inspect 열기

# Docker 컨테이너 셸 접속
docker exec -it pg-system-db psql -U pgadmin -d pg_system_dev

# PostgreSQL 쿼리 직접 실행
docker exec -it pg-system-db psql -U pgadmin -d pg_system_dev -c "SELECT count(*) FROM users;"

# 환경변수 확인
env | grep PG_
env | grep JWT_
```

---

## 참고 문서

| 문서 | 경로 | 내용 |
|------|------|------|
| 프로젝트 규칙 | `CLAUDE.md` | 프로젝트 개요 + 코딩 규칙 |
| 코딩 표준 | `.claude/rules/coding-standards.md` | 상세 코딩 가이드 |
| 보안 규칙 | `.claude/rules/security.md` | 보안 12계명 |
| 아키텍처 | `docs/architecture.md` | 시스템 아키텍처 상세 |
| 법규 준수 | `docs/legal-compliance.md` | PCI DSS / 전자금융거래법 |
| 보안 교육 | `docs/training/security-awareness.md` | 전 직원 보안 교육 |
| 운영 절차 | `docs/training/ops-procedures.md` | 운영팀 일일 절차 |
| 장애 대응 | `docs/runbooks/incident-response.md` | 장애 등급별 대응 절차 |
| 정산 운영 | `docs/runbooks/settlement-ops.md` | 정산 운영 매뉴얼 |
| 보안 운영 | `docs/runbooks/security-ops.md` | 보안 운영 체크리스트 |

---

> **문의**: 온보딩 중 막히는 부분이 있으면 팀장에게 즉시 질문하세요.
> **보안 사고 발견 시**: 즉시 보안 담당자에게 보고 (내부 채널 사용, 외부 메신저 금지).
