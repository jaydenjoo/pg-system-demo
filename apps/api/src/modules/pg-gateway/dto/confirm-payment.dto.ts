// ============================================================
// PG Gateway — 결제 승인 확정 요청 DTO
// ============================================================
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmPaymentDto {
  @ApiProperty({
    description: '결제 키 (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  /** 결제 키 (UUID) */
  @IsUUID()
  paymentKey!: string;

  @ApiProperty({
    description: '주문 ID (가맹점 측 주문번호)',
    example: 'ORDER-20250302-001',
  })
  /** 주문 ID (가맹점 측 주문번호) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orderId!: string;

  @ApiProperty({
    description: '결제 금액 (원 단위, 정수)',
    example: 10000,
    type: 'number',
  })
  /** 결제 금액 (원 단위, 정수) */
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  amount!: number;

  @ApiPropertyOptional({
    description: '카드번호 (선택, 미입력 시 테스트 기본값 사용)',
    example: '4111111111111111',
  })
  /**
   * 카드번호 (선택)
   * 미입력 시 테스트용 기본 카드번호 사용 (4111111111111111)
   */
  @IsOptional()
  @IsString()
  @MinLength(13)
  @MaxLength(19)
  cardNumber?: string;

  @ApiPropertyOptional({
    description: '할부 개월수 (기본값: 0 - 일시불)',
    example: 0,
    type: 'number',
  })
  /**
   * 할부 개월수 (선택)
   * 기본값: 0 (일시불)
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(36)
  installmentMonths?: number;

  @ApiPropertyOptional({
    description: '카드사 코드 (예: SHINHAN, KB, SAMSUNG)',
    example: 'SHINHAN',
  })
  /** 카드사 코드 (토큰화 시 사용) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  cardCompany?: string;

  @ApiPropertyOptional({
    description: '카드 유형 (CREDIT, CHECK)',
    example: 'CREDIT',
  })
  /** 카드 유형 (토큰화 시 사용) */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cardType?: string;

  @ApiPropertyOptional({
    description: '카드 브랜드 (VISA, MASTERCARD, AMEX 등)',
    example: 'VISA',
  })
  /** 카드 브랜드 (토큰화 시 사용) */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cardBrand?: string;
}
