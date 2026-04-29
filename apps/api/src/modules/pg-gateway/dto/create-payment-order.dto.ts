import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHODS } from '@pg-system/shared';

export class CreatePaymentOrderDto {
  @ApiProperty({
    description: '주문 ID (가맹점 측 고유 주문번호)',
    example: 'ORDER-20250302-001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orderId!: string;

  @ApiProperty({
    description: '결제 금액 (원 단위, 정수)',
    example: 10000,
    type: 'number',
  })
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  amount!: number;

  @ApiProperty({
    description: '주문명 (상품명, 사용자 진열용)',
    example: 'iPhone 15 Pro Max',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  orderName!: string;

  @ApiPropertyOptional({
    description: '결제 수단',
    enum: Object.values(PAYMENT_METHODS),
    example: 'CARD',
  })
  @IsOptional()
  @IsIn(Object.values(PAYMENT_METHODS))
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: '고객 이메일',
    example: 'customer@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(256)
  customerEmail?: string;

  @ApiPropertyOptional({
    description: '고객명',
    example: '김철수',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerName?: string;

  @ApiPropertyOptional({
    description: '결제 성공 후 리다이렉트 URL',
    example: 'https://example.com/success',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  @MaxLength(512)
  successUrl?: string;

  @ApiPropertyOptional({
    description: '결제 실패 후 리다이렉트 URL',
    example: 'https://example.com/fail',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  @MaxLength(512)
  failUrl?: string;
}
