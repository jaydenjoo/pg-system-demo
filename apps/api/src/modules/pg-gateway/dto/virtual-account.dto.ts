// ============================================================
// PG Gateway — 가상계좌 요청 DTO
// POST /pg/v1/virtual-account/confirm
// POST /pg/v1/virtual-account/deposit-callback
// ============================================================
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DepositCallbackRequest } from '@pg-system/shared';

/** 가상계좌 발급 확정 요청 */
export class VirtualAccountConfirmDto {
  @ApiProperty({
    description: '결제 키 (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  /** paymentKey (결제 주문 UUID) */
  @IsString()
  @IsNotEmpty()
  paymentKey!: string;

  @ApiProperty({
    description: '주문번호 (가맹점 생성)',
    example: 'ORDER-20250302-001',
  })
  /** 주문번호 (가맹점 생성) */
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({
    description: '결제 금액 (원 단위)',
    example: 10000,
    type: 'number',
  })
  /** 결제 금액 (원 단위) */
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  amount!: number;

  @ApiPropertyOptional({
    description: '은행 코드 (미입력 시 기본값: 088 신한은행)',
    example: '088',
  })
  /** 은행 코드 (미입력 시 기본값 '088' 신한은행) */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  bankCode?: string;

  @ApiPropertyOptional({
    description: '입금자명 (미입력 시 기본값: 입금자)',
    example: '김철수',
  })
  /** 입금자명 (미입력 시 기본값 '입금자') */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerName?: string;
}

/** 가상계좌 입금 콜백 요청 (Mock 은행 → PG) */
export class DepositCallbackDto implements DepositCallbackRequest {
  @ApiProperty({
    description: '가상계좌 번호',
    example: '1002345678901',
  })
  /** 가상계좌 번호 */
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty({
    description: '입금 금액 (원 단위)',
    example: 10000,
    type: 'number',
  })
  /** 입금 금액 (원 단위) */
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amount!: number;

  @ApiProperty({
    description: '입금자명',
    example: '김철수',
  })
  /** 입금자명 */
  @IsString()
  @IsNotEmpty()
  depositorName!: string;

  @ApiProperty({
    description: '은행 코드',
    example: '088',
  })
  /** 은행 코드 */
  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @ApiPropertyOptional({
    description: '입금 시각 (ISO 8601, 미입력 시 처리 시점)',
    example: '2025-03-02T15:30:00Z',
  })
  /** 입금 시각 (ISO 8601, 미입력 시 처리 시점) */
  @IsOptional()
  @IsString()
  depositedAt?: string;
}
