import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { TRANSACTION_STATUS } from "@pg-system/shared";

export class TransactionListQueryDto {
  @ApiPropertyOptional({ type: "number", description: "페이지 번호", example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: "number", description: "페이지 당 조회 건수", example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ type: "string", description: "가맹점 ID (UUID)", example: "550e8400-e29b-41d4-a716-446655440000" })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ type: "string", description: "거래 상태", enum: Object.values(TRANSACTION_STATUS), example: "SUCCESS" })
  @IsOptional()
  @IsEnum(TRANSACTION_STATUS, { message: "유효하지 않은 거래 상태입니다" })
  status?: string;

  @ApiPropertyOptional({ type: "string", description: "대리점 ID (UUID)", example: "550e8400-e29b-41d4-a716-446655440000" })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ type: "string", description: "결제 방법", example: "CARD" })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ type: "string", description: "거래 유형", example: "PURCHASE" })
  @IsOptional()
  @IsString()
  tranType?: string;

  @ApiPropertyOptional({ type: "string", description: "주문번호 또는 상품명 검색", example: "ORD-2024-001" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: "string", description: "검색 시작 날짜 (ISO 8601)", example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ type: "string", description: "검색 종료 날짜 (ISO 8601)", example: "2024-01-31" })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
