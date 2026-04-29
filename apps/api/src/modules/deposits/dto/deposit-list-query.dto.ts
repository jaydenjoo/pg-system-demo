import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class DepositListQueryDto {
  @ApiPropertyOptional({
    type: "number",
    description: "페이지 번호 (기본값: 1)",
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: "number",
    description: "페이지당 항목 수 (기본값: 20, 최대: 100)",
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: "입금 출처로 필터링",
    example: "bank_transfer",
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: "대사 상태로 필터링",
    example: "matched",
  })
  @IsOptional()
  @IsString()
  reconcileStatus?: string;

  @ApiPropertyOptional({
    description: "시작 날짜 (ISO 8601 형식)",
    example: "2026-03-01",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "종료 날짜 (ISO 8601 형식)",
    example: "2026-03-31",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
