// ============================================================
// PG Gateway — 결제 취소 요청 DTO
// POST /pg/v1/payments/:paymentKey/cancel
// ============================================================
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CancelPaymentRequest } from '@pg-system/shared';

export class CancelPaymentDto implements CancelPaymentRequest {
  @ApiProperty({
    description: '취소 사유 (필수, 최대 200자)',
    example: '고객 요청에 따른 취소',
  })
  /** 취소 사유 (필수, 최대 200자) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cancelReason!: string;

  @ApiPropertyOptional({
    description: '취소 금액 (원 단위, 미입력 시 전액 취소)',
    example: 5000,
    type: 'number',
  })
  /** 취소 금액 (미입력 = 전액 취소) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  cancelAmount?: number;
}
