import {
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
import { MERCHANT_STATUS } from "@pg-system/shared";

export class MerchantListQueryDto {
  @ApiPropertyOptional({
    description: "페이지 번호 (1부터 시작)",
    example: 1,
    type: "number",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: "페이지당 항목 수 (1~100)",
    example: 10,
    type: "number",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: "대리점 ID (UUID)",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({
    description: "가맹점 상태",
    example: "ACTIVE",
    enum: Object.values(MERCHANT_STATUS),
  })
  @IsOptional()
  @IsEnum(MERCHANT_STATUS, { message: "유효하지 않은 가맹점 상태입니다" })
  status?: string;

  @ApiPropertyOptional({
    description: "검색어 (가맹점명)",
    example: "ABC 커피숍",
  })
  @IsOptional()
  @IsString()
  search?: string;
}
