# VAN 어댑터 인터페이스 규격

> 최종 업데이트: 2026-03-03
> Sprint A.3에서 코드 구현 예정. 이 문서는 설계 레퍼런스.

---

## 목적

현재 PG Gateway는 `MockAcquirerService`(가짜 카드사)로 결제를 시뮬레이션한다.
실서비스 전환 시 **Mock → 실제 VAN** 어댑터만 교체하면 되도록,
공통 인터페이스(`AcquirerProvider`)를 정의한다.

**비유**: 콘센트 규격을 먼저 정하고, 나중에 전선만 연결하는 방식.

---

## 현재 구조 (Mock)

```
PaymentConfirmService (9단계 파이프라인)
  └── Step 7: MockAcquirerService.processCardPayment()
        ├── CardProcessor.approve()    — 카드 승인 시뮬레이션
        └── BankProcessor.transfer()   — 계좌이체 시뮬레이션
```

### 현재 MockAcquirerService 메서드

| 메서드 | 입력 | 출력 | 용도 |
|--------|------|------|------|
| `processCardPayment` | `CardApprovalRequest` | `CardApprovalResponse` | 카드 승인 |
| `cancelCardPayment` | `CardCancelRequest` | `CardCancelResponse` | 카드 취소 |
| `processBankTransfer` | `BankTransferRequest` | `BankTransferResponse` | 계좌이체 |
| `createVirtualAccount` | `VirtualAccountRequest` | `VirtualAccountResponse` | 가상계좌 발급 |

---

## 목표 구조 (어댑터 패턴)

```
PaymentConfirmService
  └── Step 7: AcquirerProvider.processCardPayment()
                │
                ├── [VAN_PROVIDER=MOCK]  → MockAcquirerAdapter
                ├── [VAN_PROVIDER=NICE]  → NiceAcquirerAdapter
                ├── [VAN_PROVIDER=KIS]   → KisAcquirerAdapter
                └── [VAN_PROVIDER=KICC]  → KiccAcquirerAdapter
```

환경변수 `VAN_PROVIDER`로 어댑터를 전환한다.

---

## AcquirerProvider 인터페이스

```typescript
// apps/api/src/modules/pg-gateway/services/acquirer-provider.interface.ts

export interface AcquirerProvider {
  /** 카드 승인 요청 */
  processCardPayment(
    params: CardApprovalRequest,
  ): Promise<CardApprovalResponse>;

  /** 카드 승인 취소 */
  cancelCardPayment(
    params: CardCancelRequest,
  ): Promise<CardCancelResponse>;

  /** 계좌이체 */
  processBankTransfer(
    params: BankTransferRequest,
  ): Promise<BankTransferResponse>;

  /** 가상계좌 발급 */
  createVirtualAccount(
    params: VirtualAccountRequest,
  ): Promise<VirtualAccountResponse>;
}
```

**기존 타입 재사용**: `@pg-system/shared`의 `CardApprovalRequest`, `CardApprovalResponse` 등 그대로 사용.

---

## 기존 타입 정의 (참조)

모든 타입은 `packages/shared/src/types/pg-gateway.types.ts`에 정의됨.

### CardApprovalRequest

| 필드 | 타입 | 설명 |
|------|------|------|
| `cardNumber` | `string` | 카드번호 (토큰화 후에는 토큰값) |
| `amount` | `number` | 결제 금액 |
| `installmentMonths` | `number` | 할부 개월수 (0=일시불) |
| `merchantId` | `string` | 가맹점 ID |

### CardApprovalResponse

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | `boolean` | 승인 성공 여부 |
| `approvalNumber` | `string?` | 승인번호 |
| `cardCompany` | `string?` | 카드사명 |
| `cardType` | `string?` | 카드 타입 (CREDIT/DEBIT) |
| `maskedCardNumber` | `string?` | 마스킹된 카드번호 |
| `errorCode` | `string?` | 에러 코드 |
| `errorMessage` | `string?` | 에러 메시지 |
| `approvedAt` | `string?` | 승인 시각 (ISO 8601) |

---

## VAN별 구현 가이드

### NICE 정보통신 (NICE VAN)

| 항목 | 내용 |
|------|------|
| 프로토콜 | TCP 소켓 (전문 통신) |
| 전문 규격 | Fixed-length 바이트 전문 |
| 인증 | TID(단말기 ID) + 가맹점번호 |
| 테스트 환경 | 별도 테스트 서버 IP/Port 제공 |
| 필요 정보 | VAN 계약번호, TID, 전문 규격서 |

### KIS 정보통신

| 항목 | 내용 |
|------|------|
| 프로토콜 | TCP 소켓 (전문 통신) |
| 전문 규격 | Fixed-length 바이트 전문 |
| 인증 | TID + 가맹점번호 |
| 테스트 환경 | 별도 테스트 서버 제공 |

### 공통 어댑터 구현 패턴

```typescript
// 예시: NiceAcquirerAdapter
@Injectable()
export class NiceAcquirerAdapter implements AcquirerProvider {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {}

  async processCardPayment(
    params: CardApprovalRequest,
  ): Promise<CardApprovalResponse> {
    // 1. params → NICE 전문 변환 (바이트 배열)
    // 2. TCP 소켓 연결 → 전문 송신
    // 3. 응답 전문 수신 → CardApprovalResponse 변환
    // 4. 타임아웃/에러 처리
    throw new Error('VAN 계약 후 구현 예정');
  }

  // ... 나머지 메서드도 동일 패턴
}
```

---

## DI 팩토리 패턴

```typescript
// pg-gateway.module.ts 에서 동적 주입

const acquirerProvider = {
  provide: 'ACQUIRER_PROVIDER',
  useFactory: (
    configService: ConfigService,
    mockAcquirer: MockAcquirerAdapter,
    // niceAcquirer: NiceAcquirerAdapter,  ← VAN 계약 후 추가
  ): AcquirerProvider => {
    const provider = configService.get<string>('VAN_PROVIDER', 'MOCK');
    switch (provider) {
      case 'MOCK':
        return mockAcquirer;
      // case 'NICE':
      //   return niceAcquirer;
      default:
        return mockAcquirer;
    }
  },
  inject: [ConfigService, MockAcquirerAdapter],
};
```

---

## VAN 연동 체크리스트

### 계약 단계
- [ ] VAN사 선정 (NICE / KIS / KICC)
- [ ] VAN 계약 체결
- [ ] 전문 규격서 수령
- [ ] 테스트 환경 정보 수령 (IP, Port, TID)
- [ ] 가맹점 등록번호 발급

### 개발 단계
- [ ] 전문 규격 분석 (요청/응답 필드 매핑)
- [ ] TCP 소켓 클라이언트 구현
- [ ] 전문 인코딩/디코딩 유틸 구현
- [ ] 어댑터 구현 (`implements AcquirerProvider`)
- [ ] 타임아웃 처리 (VAN 응답 5초 초과 시)
- [ ] 에러 코드 매핑 (VAN 에러 → 공통 에러)
- [ ] 재시도 로직 (네트워크 일시 장애)

### 테스트 단계
- [ ] VAN 테스트 서버 연결 확인
- [ ] 카드 승인 성공 케이스
- [ ] 카드 승인 실패 케이스 (잔액 부족, 한도 초과 등)
- [ ] 카드 취소 케이스
- [ ] 계좌이체 케이스
- [ ] 가상계좌 발급 케이스
- [ ] 부분 취소 케이스
- [ ] 타임아웃 핸들링 확인
- [ ] 동시성 테스트 (다건 동시 승인)

### 운영 전환 단계
- [ ] 환경변수 `VAN_PROVIDER` 전환
- [ ] 스테이징 환경 전체 E2E 테스트
- [ ] 프로덕션 전환 (카나리 배포)
- [ ] 모니터링 알림 설정 (승인 실패율 임계치)

---

## 환경변수

| 변수명 | 값 | 설명 |
|--------|---|------|
| `VAN_PROVIDER` | `MOCK` / `NICE` / `KIS` / `KICC` | 사용할 VAN 어댑터 |
| `VAN_HOST` | IP 주소 | VAN 서버 IP |
| `VAN_PORT` | 포트 번호 | VAN 서버 포트 |
| `VAN_TID` | 단말기 ID | VAN 계약 시 발급 |
| `VAN_TIMEOUT_MS` | `5000` | VAN 응답 타임아웃 (ms) |
| `VAN_RETRY_COUNT` | `2` | 재시도 횟수 |

---

## 참조 파일

| 파일 | 역할 |
|------|------|
| `apps/api/src/modules/pg-gateway/mock-acquirer/mock-acquirer.service.ts` | 현재 Mock 어댑터 (리팩토링 대상) |
| `apps/api/src/modules/pg-gateway/mock-acquirer/card-processor.ts` | 카드 처리 로직 (179줄) |
| `apps/api/src/modules/pg-gateway/mock-acquirer/bank-processor.ts` | 은행 처리 로직 (101줄) |
| `apps/api/src/modules/pg-gateway/services/payment-confirm.service.ts` | 9단계 파이프라인 (Step 7에서 호출) |
| `packages/shared/src/types/pg-gateway.types.ts` | 공통 타입 정의 |
