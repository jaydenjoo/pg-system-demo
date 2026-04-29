import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SETTLEMENT_CYCLES, type SettlementCycleCode } from "@pg-system/shared";

export class CreateMerchantDto {
  @ApiProperty({
    description: "대리점 ID (UUID)",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsUUID()
  agentId!: string;

  @ApiProperty({
    description: "가맹점명",
    example: "ABC 커피숍",
  })
  @IsString()
  @IsNotEmpty({ message: "가맹점명은 필수 입력입니다" })
  @MaxLength(100)
  merchantName!: string;

  @ApiProperty({
    description: "사업자등록번호",
    example: "123-45-67890",
  })
  @IsString()
  @IsNotEmpty({ message: "사업자등록번호는 필수 입력입니다" })
  @MaxLength(20)
  businessNo!: string;

  @ApiPropertyOptional({
    description: "대표자명",
    example: "김영희",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  representative?: string;

  @ApiPropertyOptional({
    description: "업태",
    example: "소매업",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  businessType?: string;

  @ApiPropertyOptional({
    description: "정산 주기",
    example: "DAILY",
    enum: Object.values(SETTLEMENT_CYCLES),
  })
  @IsOptional()
  @IsEnum(SETTLEMENT_CYCLES, { message: "유효하지 않은 정산 주기입니다" })
  settlementCycle?: SettlementCycleCode;

  @ApiPropertyOptional({
    description: "계약 시작일",
    example: "2024-01-01",
  })
  @IsOptional()
  @IsDateString()
  contractStartDate?: Date;

  @ApiPropertyOptional({
    description: "계약 종료일",
    example: "2025-12-31",
  })
  @IsOptional()
  @IsDateString()
  contractEndDate?: Date;

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
