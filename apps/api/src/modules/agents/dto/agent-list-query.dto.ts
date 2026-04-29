import { IsInt, IsOptional, IsString, Max, Min, IsEnum } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { AGENT_STATUS } from "@pg-system/shared";

export class AgentListQueryDto {
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
    description: "대리점 상태",
    example: "ACTIVE",
    enum: Object.values(AGENT_STATUS),
  })
  @IsOptional()
  @IsEnum(AGENT_STATUS, { message: "유효하지 않은 대리점 상태입니다" })
  status?: string;

  @ApiPropertyOptional({
    description: "검색어 (대리점명)",
    example: "서울 대리점",
  })
  @IsOptional()
  @IsString()
  search?: string;
}
