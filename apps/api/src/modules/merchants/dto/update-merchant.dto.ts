import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  MERCHANT_STATUS,
  SETTLEMENT_CYCLES,
  type MerchantStatusCode,
  type SettlementCycleCode,
} from "@pg-system/shared";

export class UpdateMerchantDto {
  @ApiPropertyOptional({
    description: "가맹점명",
    example: "ABC 커피숍",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantName?: string;

  @ApiPropertyOptional({
    description: "가맹점 상태",
    example: "ACTIVE",
    enum: Object.values(MERCHANT_STATUS),
  })
  @IsOptional()
  @IsEnum(MERCHANT_STATUS, { message: "유효하지 않은 가맹점 상태입니다" })
  status?: MerchantStatusCode;

  @ApiPropertyOptional({
    description: "정산 주기",
    example: "DAILY",
    enum: Object.values(SETTLEMENT_CYCLES),
  })
  @IsOptional()
  @IsEnum(SETTLEMENT_CYCLES, { message: "유효하지 않은 정산 주기입니다" })
  settlementCycle?: SettlementCycleCode;

  @ApiPropertyOptional({
    description: "은행명",
    example: "국민은행",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankName?: string;

  @ApiPropertyOptional({
    description: "계좌번호",
    example: "123-456-789012",
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankAccount?: string;

  @ApiPropertyOptional({
    description: "예금주명",
    example: "홍길동",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankHolder?: string;
}
