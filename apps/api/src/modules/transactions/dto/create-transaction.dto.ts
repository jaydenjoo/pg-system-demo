import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTransactionDto {
  @ApiProperty({ type: "string", description: "가맹점 ID (UUID)", example: "550e8400-e29b-41d4-a716-446655440000" })
  @IsUUID()
  merchantId!: string;

  @ApiPropertyOptional({ type: "string", description: "터미널 ID (UUID)", example: "550e8400-e29b-41d4-a716-446655440001" })
  @IsOptional()
  @IsUUID()
  terminalId?: string;

  @ApiProperty({ type: "string", description: "거래 유형", example: "PURCHASE" })
  @IsString()
  transactionType!: string;

  @ApiProperty({ type: "string", description: "결제 방법", example: "CARD" })
  @IsString()
  paymentMethod!: string;

  @ApiProperty({ type: "number", description: "거래 금액 (원, 최소 100원)", example: 10000 })
  @IsInt()
  @Min(100)
  amount!: number;

  @ApiPropertyOptional({ type: "number", description: "수수료 금액 (원, 0 이상)", example: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  feeAmount?: number;

  @ApiProperty({ type: "string", description: "주문 번호", example: "ORD-2024-001" })
  @IsString()
  orderNo!: string;

  @ApiProperty({ type: "string", description: "상품명", example: "노트북" })
  @IsString()
  orderName!: string;

  @ApiPropertyOptional({ description: "결제 세부 정보", example: { cardBin: "123456", cardLast4: "0000" } })
  @IsOptional()
  @IsObject()
  paymentDetail?: Record<string, unknown>;
}
